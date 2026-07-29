import { hash } from "argon2";
import sql from "@/app/api/utils/sql";
import { withRequestContext, withSavepoint } from "@/app/api/utils/requestContext";
import { validatePassword } from "@/app/api/utils/passwordStrength";
import { hashResetToken } from "@/app/api/utils/passwordResetToken";

// POST /api/account/reset-password — finish a self-service password reset.
//
// The second half of the flow started by /api/account/forgot-password. NO SESSION: the emailed
// token IS the credential. Everything about which account this is comes from the token row.
//
// Body: { token: string, password: string }.
//
// Order of operations matters:
//   1. shape-check the body;
//   2. run the SHARED 2.32 strength rule (validatePassword — the same import src/auth.js uses on
//      sign-up, so a reset can never become a back door to a weaker password than signup allows.
//      Existing accounts' existing passwords are untouched; the rule applies to NEW passwords only,
//      exactly as 2.32 specifies);
//   3. argon2-hash it HERE, in the app layer — Postgres is handed a hash and never sees plaintext;
//   4. hand token-hash + password-hash to the 0069 SECURITY DEFINER helper, which validates
//      (unused + unexpired), burns this token AND the account's other outstanding ones, writes the
//      password, and clears the account's DB sessions — all in one transaction. No other account is
//      read or written, and no existing session belonging to anyone else is affected.
//
// The helper returns NULL for every rejection — unknown token, already used, expired — and this
// route maps all of them to ONE message. Distinguishing "already used" from "expired" from
// "never existed" tells an attacker holding a guessed token which guesses were close.
//
// DB is porsager's tagged-template `sql` (see SCHEMA_NOTES neon→porsager note).

const INVALID_TOKEN_MESSAGE =
  "This reset link is invalid or has expired. Request a new one and try again.";

async function POST(request) {
  try {
    const body = (await request.json().catch(() => ({}))) ?? {};
    const token = typeof body.token === "string" ? body.token : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!token) {
      return Response.json({ error: INVALID_TOKEN_MESSAGE }, { status: 400 });
    }

    const strength = validatePassword(password);
    if (!strength.valid) {
      return Response.json(
        { error: strength.errors[0], errors: strength.errors },
        { status: 400 },
      );
    }

    const passwordHash = await hash(password);

    // SAVEPOINT so a DB failure can't poison the request transaction and have withRequestContext
    // discard this handler's own answer for a blanket 500 (same reasoning as the sibling
    // forgot-password route; here it's about the user seeing the actionable message rather than
    // about response uniformity).
    const rows = await withSavepoint(
      () => sql`
        SELECT app_consume_password_reset_token(
          ${hashResetToken(token)}, ${passwordHash}
        ) AS auth_user_id
      `,
    );

    if (rows?.[0]?.auth_user_id == null) {
      return Response.json({ error: INVALID_TOKEN_MESSAGE }, { status: 400 });
    }

    return Response.json(
      {
        ok: true,
        message: "Your password has been updated. You can log in with it now.",
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("[POST /api/account/reset-password] Error:", error?.message);
    return Response.json(
      { error: "Something went wrong. Please request a new reset link." },
      { status: 500 },
    );
  }
}

const wrappedPOST = withRequestContext(POST);
export { wrappedPOST as POST };
