import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// POST /api/events/[id]/rsvp — the caller upserts their OWN rsvp (Wave 7 ticket 2.74). One rsvp per
// user/event (UNIQUE) toggled between going/not_going. RLS event_rsvps_insert/_update is the
// backstop: it forbids writing another user's rsvp and forbids RSVPing a cancelled/deleted event.
//
// DB is porsager's tagged-template `sql`.
async function POST(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = await resolveUserId(session.user.id);
    if (!userId) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }
    const body = (await request.json()) ?? {};
    const status = body.status ?? "going";
    if (!["going", "not_going"].includes(status)) {
      return Response.json({ error: "Invalid status" }, { status: 400 });
    }
    const petId = body.pet_id ?? null;
    // Optional device calendar event id (2.80): persisted on the caller's OWN rsvp row
    // (per-attendee, migration 0063). Pass null to clear it (e.g. on un-RSVP / not_going).
    const calendarEventId = body.calendar_event_id ?? null;

    // Upsert the caller's rsvp. RLS WITH CHECK requires a published, non-deleted event — a stale RSVP
    // is rejected by the DB and surfaced as a clean 400.
    const saved = await sql`
      INSERT INTO event_rsvps (event_id, user_profile_id, pet_id, status, calendar_event_id)
      VALUES (${params.id}, ${userId}, ${petId}, ${status}, ${calendarEventId})
      ON CONFLICT (event_id, user_profile_id)
      DO UPDATE SET status = EXCLUDED.status, pet_id = EXCLUDED.pet_id,
                    calendar_event_id = EXCLUDED.calendar_event_id, updated_at = now()
      RETURNING id, event_id, status, pet_id, calendar_event_id
    `;
    const count = await sql`
      SELECT COUNT(*)::int AS attendee_count
      FROM event_rsvps WHERE event_id = ${params.id} AND status = 'going'
    `;
    return Response.json({
      rsvp: saved[0],
      attendee_count: count[0].attendee_count,
    });
  } catch (error) {
    if (/row-level security/i.test(error?.message ?? "")) {
      return Response.json(
        { error: "You can't RSVP to this event" },
        { status: 400 },
      );
    }
    console.error("[POST /api/events/[id]/rsvp] Error:", error.message);
    return Response.json({ error: "Failed to RSVP" }, { status: 500 });
  }
}

const wrappedPOST = withRequestContext(POST);
export { wrappedPOST as POST };
