import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";
import { isNotifV2Enabled, softV2 } from "@/app/api/utils/notifV2";
import { FINDER_RETENTION_DAYS } from "@/app/api/utils/finderRetention";

// GET /api/notifications — the caller's own notifications, newest first, paginated
// (ticket 2.26). RECIPIENT-SCOPED: the WHERE filter + the owner RLS policy both bind to
// the caller's user_profiles.id, so a user can never read another user's notifications.
// Joins the actor's public identity (username/avatar) for display; never exposes the
// actor's private data.
async function GET(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") || "30", 10) || 30, 1),
      100,
    );
    const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10) || 0, 0);

    const notifications = await sql`
      SELECT
        n.id,
        n.type,
        n.subject_ref,
        -- emergency_contact only (0146): the message and the finder's contact are never returned once older than
        -- the retention period (the purge job deletes them; this holds even if it is late). Only the pet's name
        -- stays. finder_contact is read through to_jsonb so this query also works without the column (then null).
        CASE
          WHEN n.type = 'emergency_contact' AND n.created_at < now() - make_interval(days => ${FINDER_RETENTION_DAYS})
            THEN NULL
          ELSE n.body
        END AS body,
        CASE
          WHEN n.type = 'emergency_contact' AND n.created_at < now() - make_interval(days => ${FINDER_RETENTION_DAYS})
            THEN jsonb_build_object('pet_name', to_jsonb(n) -> 'finder_contact' -> 'pet_name')
          ELSE to_jsonb(n) -> 'finder_contact'
        END AS finder_contact,
        n.read_at,
        n.created_at,
        -- PRIVACY (QA 2026-10-16 bug 04): the display name only — username can be e-mail derived.
        NULLIF(BTRIM(a.full_name), '') AS actor_username,
        a.avatar_url AS actor_avatar
      FROM notifications n
      LEFT JOIN user_profiles a ON a.id = n.actor_user_id
      WHERE n.recipient_user_id = ${userId}
      ORDER BY n.created_at DESC, n.id DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    // Notifications v2 (flag): how many of the caller's DB notifications are unread, so the app's bell badge counts
    // them (it used to count only local reminders + pending access requests). Absent while the flag is off, which is
    // how the app knows to keep the old badge. Soft: a failed count never fails the list.
    if (isNotifV2Enabled()) {
      const unread = await softV2(async () => {
        const rows = await sql`
          SELECT count(*)::int AS n FROM notifications
          WHERE recipient_user_id = ${userId} AND read_at IS NULL
        `;
        return rows[0]?.n ?? 0;
      }, null);
      if (unread !== null) return Response.json({ notifications, unread_count: unread });
    }

    return Response.json({ notifications });
  } catch (error) {
    console.error("[GET /api/notifications] Error:", error.message);
    return Response.json(
      { error: "Failed to fetch notifications" },
      { status: 500 },
    );
  }
}

const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
