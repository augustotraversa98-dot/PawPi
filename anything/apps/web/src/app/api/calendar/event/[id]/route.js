import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";
import { buildEventIcs } from "@/app/api/utils/ics";

// GET /api/calendar/event/[id].ics — ICS export of a community event (ticket 2.80).
// Visibility-scoped to events the caller can SEE: a published, non-deleted event, OR an
// event the caller HOSTS (same visibility as the events listing / single-event GET and
// the events_read RLS policy). Returns a standard .ics that opens in Apple/Google
// Calendar. Server-side, holds no secret.
//
// The `[id]` param may carry a trailing `.ics` (the requested filename) — we strip it.
// DB is porsager's tagged-template `sql`.
async function GET(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = await resolveUserId(session.user.id);
    if (!userId) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    const id = String(params.id).replace(/\.ics$/i, "");

    const rows = await sql`
      SELECT id, title, description, starts_at, ends_at, location_name, address
      FROM events
      WHERE id = ${id}
        AND deleted_at IS NULL
        AND (status = 'published' OR host_user_id = ${userId})
      LIMIT 1
    `;

    if (rows.length === 0) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    const ics = buildEventIcs(rows[0]);
    return new Response(ics, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="event-${rows[0].id}.ics"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[GET /api/calendar/event/[id].ics] Error:", error.message);
    return Response.json({ error: "Failed to export event" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
