import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { withRequestContext } from "@/app/api/utils/requestContext";

// PUT /api/user-profile/locale — persist the signed-in owner's preferred email locale (FF1).
//
// The E11 weekly-digest + E12 win-back EMAILS are server-rendered, so they need a server-side
// per-user locale (client-only AsyncStorage prefs are invisible to the cron sender). The app
// writes the RESOLVED language here on login and whenever the Settings language control changes.
// Only the two shipped languages persist ('en' | 'es'); anything else (incl. "system") clears the
// column to NULL → the senders fall back to es-AR. Mirrors the /user-profile PATCH auth + scoping
// (owner-private; WHERE auth_user_id). Degrades cleanly pre-0107: undefined_column → 200 no-op.

const UNDEFINED_COLUMN = "42703";
const UNDEFINED_TABLE = "42P01";
const VALID = new Set(["en", "es"]);

async function PUT(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const raw = typeof body?.locale === "string" ? body.locale.slice(0, 2).toLowerCase() : null;
  const locale = VALID.has(raw) ? raw : null; // only en/es; else NULL (es-AR fallback)

  const authUserId = session.user.id;

  try {
    const rows = await sql`
      UPDATE user_profiles
      SET preferred_locale = ${locale}, updated_at = NOW()
      WHERE auth_user_id = ${authUserId}
      RETURNING preferred_locale
    `;
    if (rows.length === 0) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }
    return Response.json({ preferred_locale: rows[0].preferred_locale });
  } catch (error) {
    // Pre-0107 (column/table absent): no-op so the app never sees an error for a not-yet-applied feature.
    if (error?.code === UNDEFINED_COLUMN || error?.code === UNDEFINED_TABLE) {
      return Response.json({ preferred_locale: null, note: "preferred_locale not applied" });
    }
    console.error("Error updating preferred_locale:", error);
    return Response.json({ error: "Failed to update locale" }, { status: 500 });
  }
}

const wrappedPUT = withRequestContext(PUT);
export { wrappedPUT as PUT };
