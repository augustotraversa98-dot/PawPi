import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { withRequestContext } from "@/app/api/utils/requestContext";
import { TERMS_VERSION, PRIVACY_VERSION } from "@/constants/legal";

// POST /api/legal/consent — record Terms of Service / Privacy Policy acceptance at signup
// (App Store Guideline 1.2 / readiness). Writes one append-only legal_consents row via the
// 0067 SECURITY DEFINER helper app_record_consent.
//
// Identity: the auth_users.id comes from the SESSION (session.user.id), NEVER the request body.
// Consent is keyed to auth_users.id because user_profiles rows are created LAZILY (so there is
// no user_profiles.id yet at signup) — we deliberately do NOT resolveUserId / 404 here.
//
// Versions: SERVER-AUTHORITATIVE. We stamp the TERMS_VERSION / PRIVACY_VERSION constants; any
// versions (or auth ids) supplied in the body are ignored.
//
// Body (all optional): { source?: 'web_signup'|'mobile_signup', user_agent?: string }.
//
// DB is porsager's tagged-template `sql` (see SCHEMA_NOTES neon→porsager note).

const SOURCES = new Set(["web_signup", "mobile_signup"]);

async function POST(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const authUserId = session.user.id;

    const body = (await request.json().catch(() => ({}))) ?? {};
    // Only source + user_agent are accepted from the client; both are advisory metadata.
    const source = SOURCES.has(body.source) ? body.source : null;
    const userAgent =
      (typeof body.user_agent === "string" && body.user_agent) ||
      request.headers.get("user-agent") ||
      null;

    await sql`
      SELECT app_record_consent(
        ${authUserId}, ${TERMS_VERSION}, ${PRIVACY_VERSION}, ${source}, ${userAgent}
      )
    `;

    return Response.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error("[POST /api/legal/consent] Error:", error.message);
    return Response.json({ error: "Failed to record consent" }, { status: 500 });
  }
}

const wrappedPOST = withRequestContext(POST);
export { wrappedPOST as POST };
