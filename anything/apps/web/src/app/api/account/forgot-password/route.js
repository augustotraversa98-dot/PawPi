import sql from "@/app/api/utils/sql";
import { withRequestContext, withSavepoint } from "@/app/api/utils/requestContext";
import { sendEmail } from "@/app/api/utils/email";
import {
  RESET_TOKEN_TTL_MINUTES,
  buildResetLink,
  generateResetToken,
  hashResetToken,
  resetTokenExpiry,
  resolveAppOrigin,
} from "@/app/api/utils/passwordResetToken";

// POST /api/account/forgot-password — start a self-service password reset.
//
// Before this route `/account/forgot-password` was a frontend-only stub (a setTimeout and a
// "check your email" screen with nothing behind it), which an App Store reviewer could reach.
//
// NO SESSION: the caller is by definition locked out. Identity comes only from the emailed token
// in the follow-up request, never from this one.
//
// RESPONSE UNIFORMITY IS THE SECURITY PROPERTY. Every outcome — unknown address, known address,
// throttled, email vendor down, email not configured at all — returns the SAME 200 and the same
// message. Any variation (a different status, a different body, even a conspicuously different
// latency class like "we 500 only for real users") turns this endpoint into an account-existence
// oracle: someone could enumerate which of a leaked email dump have PawPi accounts. So the only
// `catch` here swallows to the same 200 as well.
//
// Body: { email: string }.
//
// DB is porsager's tagged-template `sql` (see SCHEMA_NOTES neon→porsager note). The token row is
// written via the 0069 SECURITY DEFINER helper app_create_password_reset_token — password_reset_tokens
// is FORCE-RLS with no write policy, so there is no direct path, with or without a session.

const GENERIC_RESPONSE = {
  ok: true,
  message:
    "If an account exists for that email, we've sent a link to reset your password.",
};

function resetEmailBody(link) {
  const text = [
    "Hi,",
    "",
    "Someone asked to reset the password for your PawPi account. If that was you, open this link to choose a new one:",
    "",
    link,
    "",
    `This link works once and expires in ${RESET_TOKEN_TTL_MINUTES} minutes.`,
    "",
    "If you didn't ask for this, you can ignore this email — your password stays as it is.",
    "",
    "— PawPi 🐾",
  ].join("\n");

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#3B241B;line-height:1.6">
      <p>Hi,</p>
      <p>Someone asked to reset the password for your PawPi account. If that was you, choose a new one:</p>
      <p>
        <a href="${link}" style="display:inline-block;background:#FF6F61;color:#fff;text-decoration:none;padding:12px 20px;border-radius:12px;font-weight:bold">
          Set a new password
        </a>
      </p>
      <p style="color:#7A6254;font-size:14px">
        This link works once and expires in ${RESET_TOKEN_TTL_MINUTES} minutes.
      </p>
      <p style="color:#7A6254;font-size:14px">
        If you didn't ask for this, you can ignore this email — your password stays as it is.
      </p>
      <p>— PawPi 🐾</p>
    </div>
  `;

  return { text, html };
}

async function POST(request) {
  try {
    const body = (await request.json().catch(() => ({}))) ?? {};
    const email = typeof body.email === "string" ? body.email.trim() : "";

    if (!email) {
      // The one case that can't be an oracle: no address was supplied at all, so there is nothing
      // to confirm or deny about any account.
      return Response.json(
        { error: "Please enter your email address" },
        { status: 400 },
      );
    }

    // SAVEPOINT around every DB touch. A failed query aborts the whole request transaction, and
    // withRequestContext then answers 500 regardless of what this handler returns — which here
    // would be a genuine oracle, because the token-minting step below only runs for accounts that
    // EXIST (real address → 500, unknown address → 200). Inside a savepoint the failure rolls back
    // only that far, the outer transaction still commits, and the catch below answers uniformly.
    await withSavepoint(async () => {
      // auth_users is RLS-exempt identity infra (0026), so this read needs no DEFINER helper.
      // Case-insensitive: people type Gmail addresses however they like, and signup stores verbatim.
      const users = await sql`
        SELECT id, email FROM auth_users WHERE lower(email) = lower(${email}) LIMIT 1
      `;
      const user = users?.[0];
      if (!user?.id) return;

      const token = generateResetToken();
      const created = await sql`
        SELECT app_create_password_reset_token(
          ${user.id},
          ${hashResetToken(token)},
          ${resetTokenExpiry().toISOString()},
          ${request.headers.get("x-forwarded-for") || null},
          ${request.headers.get("user-agent") || null}
        ) AS id
      `;

      // NULL means the account hit the helper's per-hour throttle. Silently send nothing — from
      // the caller's side this is indistinguishable from an unknown address, which is the point.
      if (created?.[0]?.id == null) return;

      const link = buildResetLink(resolveAppOrigin(request), token);
      const { text, html } = resetEmailBody(link);
      // Never throws: with EMAIL_API_KEY unset it logs the intended send and returns
      // { sent:false } (see utils/email). A dormant email vendor must not break this endpoint.
      await sendEmail({
        to: user.email,
        subject: "Reset your PawPi password",
        text,
        html,
      });
    });

    return Response.json(GENERIC_RESPONSE, { status: 200 });
  } catch (error) {
    // Log for us, but still answer exactly as above — a 500 for real accounts and a 200 for
    // unknown ones would leak precisely what the uniform response exists to hide.
    console.error("[POST /api/account/forgot-password] Error:", error?.message);
    return Response.json(GENERIC_RESPONSE, { status: 200 });
  }
}

const wrappedPOST = withRequestContext(POST);
export { wrappedPOST as POST };
