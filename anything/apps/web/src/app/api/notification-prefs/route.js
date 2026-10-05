import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { withRequestContext } from "@/app/api/utils/requestContext";
import {
  BUSINESS_NOTIFICATION_CATEGORIES,
  isBusinessNotificationCategory,
  categoryDefaultEnabled,
} from "@/app/api/utils/notificationCategories";
import { isNotifV2Enabled, softV2 } from "@/app/api/utils/notifV2";
import { normalizeQuietSettings } from "@/app/api/utils/quietHours";
import {
  isOwnerNotificationCategory,
  resolveOwnerPrefs,
} from "@/app/api/utils/ownerNotificationCategories";

// /api/notification-prefs — the caller's SERVER-SIDE notification preferences (BX4).
// Owner-scoped (notification_prefs is own-row FOR ALL under FORCE RLS, 0108). These
// gate delivery of BUSINESS-category notifications only; the pet-owner categories
// stay client-side (E5). The business Settings screen (PR2) reads + writes this.
//
//   GET : the effective on/off for every known business category, fail-open
//         (an absent row = enabled) so the UI never invents an off state.
//   PUT : upsert one { category, enabled } for the caller.
//
// DB is porsager's tagged-template `sql` (SCHEMA_NOTES "neon→porsager").

async function resolveOwner(session) {
  const rows = await sql`
    SELECT id FROM user_profiles WHERE auth_user_id = ${session.user.id}
  `;
  return rows.length ? rows[0].id : null;
}

async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const ownerUserId = await resolveOwner(session);
    if (ownerUserId === null) {
      // No profile yet => no stored prefs => every category is at its fail-open default.
      return Response.json({
        prefs: defaultPrefs(),
        ...(isNotifV2Enabled()
          ? { owner_prefs: resolveOwnerPrefs(new Map()), quiet_hours: normalizeQuietSettings(null) }
          : {}),
      });
    }

    const rows = await sql`
      SELECT category, enabled FROM notification_prefs
      WHERE user_id = ${ownerUserId}
    `;
    const stored = new Map(rows.map((r) => [r.category, r.enabled]));

    // Per-category default when no row exists: PUSH → on, OPTIONAL_PUSH → off.
    const prefs = {};
    for (const c of BUSINESS_NOTIFICATION_CATEGORIES) {
      prefs[c] = stored.has(c) ? stored.get(c) : categoryDefaultEnabled(c);
    }
    // Notifications v2: pet-owner categories (email consent today; push categories in PR 3c). Absent from the
    // payload while the flag is off, which is how the app knows to hide the controls.
    if (isNotifV2Enabled()) {
      const quiet = await softV2(async () => {
        const rows = await sql`
          SELECT quiet_hours_enabled, quiet_start, quiet_end FROM notification_settings WHERE owner_user_id = ${ownerUserId}
        `;
        return rows[0] ?? null;
      }, null);
      return Response.json({
        prefs,
        owner_prefs: resolveOwnerPrefs(stored),
        quiet_hours: normalizeQuietSettings(quiet),
      });
    }
    return Response.json({ prefs });
  } catch (e) {
    console.error("[GET /api/notification-prefs] Error:", e?.message);
    return Response.json({ error: "Failed to load notification preferences" }, { status: 500 });
  }
}

async function PUT(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = (await request.json().catch(() => ({}))) ?? {};
    const { category } = body;
    const enabled = body.enabled;
    const isOwnerCategory = isNotifV2Enabled() && isOwnerNotificationCategory(category);
    if (!isOwnerCategory && !isBusinessNotificationCategory(category)) {
      return Response.json({ error: "Unknown notification category" }, { status: 400 });
    }
    if (typeof enabled !== "boolean") {
      return Response.json({ error: "enabled must be a boolean" }, { status: 400 });
    }
    const ownerUserId = await resolveOwner(session);
    if (ownerUserId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    // Upsert the caller's pref. RLS (own-row) + the WITH CHECK make user_id the
    // caller's id load-bearing; the UNIQUE(user_id, category) drives the conflict.
    const rows = await sql`
      INSERT INTO notification_prefs (user_id, category, enabled)
      VALUES (${ownerUserId}, ${category}, ${enabled})
      ON CONFLICT (user_id, category)
      DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now()
      RETURNING category, enabled
    `;
    return Response.json({ pref: rows[0] });
  } catch (e) {
    console.error("[PUT /api/notification-prefs] Error:", e?.message);
    return Response.json({ error: "Failed to update notification preferences" }, { status: 500 });
  }
}

function defaultPrefs() {
  const prefs = {};
  for (const c of BUSINESS_NOTIFICATION_CATEGORIES) prefs[c] = categoryDefaultEnabled(c);
  return prefs;
}

const wrappedGET = withRequestContext(GET);
const wrappedPUT = withRequestContext(PUT);
export { wrappedGET as GET, wrappedPUT as PUT };
