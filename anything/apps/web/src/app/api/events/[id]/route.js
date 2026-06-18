import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// /api/events/[id] — one event (Wave 7 ticket 2.74).
//   GET    — detail + attendee_count + the caller's my_rsvp (RLS events_read scopes it).
//   PATCH  — host edits / cancels their own event (RLS events_update is host-only → others touch zero).
//   DELETE — host soft-deletes (sets deleted_at) their own event.
//
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
    const rows = await sql`
      SELECT
        e.*, up.username AS host_username,
        (SELECT COUNT(*) FROM event_rsvps r WHERE r.event_id = e.id AND r.status = 'going') AS attendee_count,
        (SELECT r.status FROM event_rsvps r WHERE r.event_id = e.id AND r.user_profile_id = ${userId}) AS my_rsvp
      FROM events e
      JOIN user_profiles up ON up.id = e.host_user_id
      WHERE e.id = ${params.id}
    `;
    if (rows.length === 0) {
      return Response.json({ error: "Event not found" }, { status: 404 });
    }
    return Response.json({ event: rows[0] });
  } catch (error) {
    console.error("[GET /api/events/[id]] Error:", error.message);
    return Response.json({ error: "Failed to load event" }, { status: 500 });
  }
}

async function PATCH(request, { params }) {
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
    const {
      title,
      description,
      starts_at,
      ends_at,
      lat,
      lng,
      location_name,
      address,
      cover_image_url,
      capacity,
      status,
    } = body;
    if (status !== undefined && !["published", "cancelled"].includes(status)) {
      return Response.json({ error: "Invalid status" }, { status: 400 });
    }
    if (title !== undefined && !String(title).trim()) {
      return Response.json({ error: "Title cannot be empty" }, { status: 400 });
    }
    // COALESCE keeps unspecified fields. RLS events_update (host-only) scopes the row; a non-host
    // updates ZERO → 404.
    const updated = await sql`
      UPDATE events SET
        title = COALESCE(${title ?? null}, title),
        description = COALESCE(${description ?? null}, description),
        starts_at = COALESCE(${starts_at ?? null}, starts_at),
        ends_at = COALESCE(${ends_at ?? null}, ends_at),
        lat = COALESCE(${lat ?? null}, lat),
        lng = COALESCE(${lng ?? null}, lng),
        location_name = COALESCE(${location_name ?? null}, location_name),
        address = COALESCE(${address ?? null}, address),
        cover_image_url = COALESCE(${cover_image_url ?? null}, cover_image_url),
        capacity = COALESCE(${capacity ?? null}, capacity),
        status = COALESCE(${status ?? null}, status),
        updated_at = now()
      WHERE id = ${params.id} AND host_user_id = ${userId}
      RETURNING *
    `;
    if (updated.length === 0) {
      return Response.json(
        { error: "Event not found or not authorized" },
        { status: 404 },
      );
    }
    return Response.json({ event: updated[0] });
  } catch (error) {
    console.error("[PATCH /api/events/[id]] Error:", error.message);
    return Response.json({ error: "Failed to update event" }, { status: 500 });
  }
}

async function DELETE(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = await resolveUserId(session.user.id);
    if (!userId) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }
    const deleted = await sql`
      UPDATE events SET deleted_at = now(), updated_at = now()
      WHERE id = ${params.id} AND host_user_id = ${userId} AND deleted_at IS NULL
      RETURNING id
    `;
    if (deleted.length === 0) {
      return Response.json(
        { error: "Event not found or not authorized" },
        { status: 404 },
      );
    }
    return Response.json({ ok: true });
  } catch (error) {
    console.error("[DELETE /api/events/[id]] Error:", error.message);
    return Response.json({ error: "Failed to delete event" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
const wrappedPATCH = withRequestContext(PATCH);
const wrappedDELETE = withRequestContext(DELETE);
export { wrappedGET as GET, wrappedPATCH as PATCH, wrappedDELETE as DELETE };
