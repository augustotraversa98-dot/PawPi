import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { withRequestContext } from "@/app/api/utils/requestContext";
import { isNotifV2Enabled, softV2 } from "@/app/api/utils/notifV2";
import { DEFAULT_QUIET_HOURS, normalizeQuietSettings } from "@/app/api/utils/quietHours";

// GET / PUT /api/notification-prefs/quiet-hours — the owner's quiet hours (notifications v2, PR 3c; migration 0132).
//
// While the owner's LOCAL clock is inside the window the server does not ring their phone (the in-app bell is
// unaffected). Default 22:00-08:00, enabled; no row = the defaults. Own-row RLS (notification_settings_owner_all).
//
//   GET : { enabled, start, end }                      (defaults when never set / table not applied yet)
//   PUT : { enabled?: boolean, start?: 0-23, end?: 0-23 }   partial update, upserts the caller's own row
//
// FLAG: with NOTIF_V2_ENABLED off both answer {skipped:"disabled"} and issue NO query. Missing table (0132 not
// applied) → GET returns the defaults, PUT answers 503 so the app can tell the owner it is not available yet.

const isHour = (v) => Number.isInteger(v) && v >= 0 && v <= 23;

async function resolveOwner(session) {
  const rows = await sql`SELECT id FROM user_profiles WHERE auth_user_id = ${session.user.id}`;
  return rows.length ? rows[0].id : null;
}

async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (!isNotifV2Enabled()) return Response.json({ skipped: "disabled" });

    const ownerUserId = await resolveOwner(session);
    if (ownerUserId === null) return Response.json({ ...DEFAULT_QUIET_HOURS });
    const stored = await softV2(async () => {
      const rows = await sql`
        SELECT quiet_hours_enabled, quiet_start, quiet_end FROM notification_settings WHERE owner_user_id = ${ownerUserId}
      `;
      return rows[0] ?? null;
    }, null);
    return Response.json(normalizeQuietSettings(stored));
  } catch (e) {
    console.error("[GET /api/notification-prefs/quiet-hours] Error:", e?.message);
    return Response.json({ error: "Failed to load quiet hours" }, { status: 500 });
  }
}

async function PUT(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (!isNotifV2Enabled()) return Response.json({ ok: true, skipped: "disabled" });

    const body = (await request.json().catch(() => ({}))) ?? {};
    if (body.enabled !== undefined && typeof body.enabled !== "boolean") {
      return Response.json({ error: "enabled must be a boolean" }, { status: 400 });
    }
    if (body.start !== undefined && !isHour(body.start)) {
      return Response.json({ error: "start must be an hour 0-23" }, { status: 400 });
    }
    if (body.end !== undefined && !isHour(body.end)) {
      return Response.json({ error: "end must be an hour 0-23" }, { status: 400 });
    }
    if (body.enabled === undefined && body.start === undefined && body.end === undefined) {
      return Response.json({ error: "nothing to update" }, { status: 400 });
    }

    const ownerUserId = await resolveOwner(session);
    if (ownerUserId === null) return Response.json({ error: "User profile not found" }, { status: 404 });

    let rows;
    try {
      // Partial update: omitted fields keep their stored value (or the default on first write).
      rows = await sql`
        INSERT INTO notification_settings (owner_user_id, quiet_hours_enabled, quiet_start, quiet_end)
        VALUES (
          ${ownerUserId},
          ${body.enabled ?? DEFAULT_QUIET_HOURS.enabled},
          ${body.start ?? DEFAULT_QUIET_HOURS.start},
          ${body.end ?? DEFAULT_QUIET_HOURS.end}
        )
        ON CONFLICT (owner_user_id) DO UPDATE SET
          quiet_hours_enabled = COALESCE(${body.enabled ?? null}, notification_settings.quiet_hours_enabled),
          quiet_start         = COALESCE(${body.start ?? null}::smallint, notification_settings.quiet_start),
          quiet_end           = COALESCE(${body.end ?? null}::smallint, notification_settings.quiet_end),
          updated_at          = now()
        RETURNING quiet_hours_enabled, quiet_start, quiet_end
      `;
    } catch (e) {
      if (e?.code === "42P01") {
        return Response.json({ error: "Quiet hours are not available yet" }, { status: 503 });
      }
      throw e;
    }
    return Response.json(normalizeQuietSettings(rows[0]));
  } catch (e) {
    console.error("[PUT /api/notification-prefs/quiet-hours] Error:", e?.message);
    return Response.json({ error: "Failed to update quiet hours" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
const wrappedPUT = withRequestContext(PUT);
export { wrappedGET as GET, wrappedPUT as PUT };
