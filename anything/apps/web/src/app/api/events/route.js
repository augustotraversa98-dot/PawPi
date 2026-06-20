import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// /api/events — community events / meetups (Wave 7 ticket 2.74; forum-style public read).
//   GET  — upcoming published events, optional ?lat&lng&radiusKm bounding box, with attendee_count
//          and the caller's my_rsvp. RLS events_read scopes the rows.
//   POST  — create an event as the host (RLS events_insert: host_user_id = caller).
//
// DB is porsager's tagged-template `sql`.
function validCoord(v, max) {
  return v === null || (Number.isFinite(v) && Math.abs(v) <= max);
}

async function GET(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = await resolveUserId(session.user.id);
    if (!userId) return Response.json({ events: [] });

    const { searchParams } = new URL(request.url);
    const centerLat = parseFloat(searchParams.get("lat"));
    const centerLng = parseFloat(searchParams.get("lng"));
    const radiusKm = parseFloat(searchParams.get("radiusKm")) || 50;
    const hasBox = Number.isFinite(centerLat) && Number.isFinite(centerLng);

    // A plain numeric bounding box (no PostGIS), mirroring social-walks nearby discovery.
    const latDelta = radiusKm / 111;
    const lngDelta =
      radiusKm / (111 * Math.max(0.01, Math.cos((centerLat * Math.PI) / 180)));

    const events = await sql`
      SELECT
        e.id, e.host_user_id, e.title, e.description, e.starts_at, e.ends_at,
        e.lat, e.lng, e.location_name, e.address, e.cover_image_url, e.capacity,
        e.status, e.created_at,
        up.username AS host_username,
        (e.host_user_id = ${userId}) AS is_host,
        (SELECT COUNT(*) FROM event_rsvps r WHERE r.event_id = e.id AND r.status = 'going') AS attendee_count,
        (SELECT r.status FROM event_rsvps r WHERE r.event_id = e.id AND r.user_profile_id = ${userId}) AS my_rsvp,
        (SELECT r.calendar_event_id FROM event_rsvps r WHERE r.event_id = e.id AND r.user_profile_id = ${userId}) AS my_calendar_event_id
      FROM events e
      JOIN user_profiles up ON up.id = e.host_user_id
      WHERE e.deleted_at IS NULL
        AND e.status = 'published'
        AND e.starts_at >= now() - interval '1 day'
        -- Moderation (T3): hide events removed by us + events from a blocked host.
        AND e.hidden_at IS NULL
        AND NOT app_user_is_blocked(${userId}, e.host_user_id)
        ${
          hasBox
            ? sql`AND e.lat BETWEEN ${centerLat - latDelta} AND ${centerLat + latDelta}
                  AND e.lng BETWEEN ${centerLng - lngDelta} AND ${centerLng + lngDelta}`
            : sql``
        }
      ORDER BY e.starts_at ASC
      LIMIT 100
    `;
    return Response.json({ events });
  } catch (error) {
    console.error("[GET /api/events] Error:", error.message);
    return Response.json({ error: "Failed to load events" }, { status: 500 });
  }
}

async function POST(request) {
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
    const title = (body.title || "").trim();
    const startsAt = body.starts_at;
    if (!title) {
      return Response.json({ error: "Title is required" }, { status: 400 });
    }
    if (!startsAt) {
      return Response.json({ error: "A start date/time is required" }, { status: 400 });
    }
    const lat = body.lat == null || body.lat === "" ? null : Number(body.lat);
    const lng = body.lng == null || body.lng === "" ? null : Number(body.lng);
    if (!validCoord(lat, 90) || !validCoord(lng, 180)) {
      return Response.json({ error: "Invalid lat/lng" }, { status: 400 });
    }

    const created = await sql`
      INSERT INTO events
        (host_user_id, title, description, starts_at, ends_at, lat, lng,
         location_name, address, cover_image_url, capacity, status)
      VALUES (
        ${userId}, ${title}, ${body.description ?? null}, ${startsAt}, ${body.ends_at ?? null},
        ${lat}, ${lng}, ${body.location_name ?? null}, ${body.address ?? null},
        ${body.cover_image_url ?? null}, ${body.capacity ?? null}, 'published'
      )
      RETURNING *
    `;
    return Response.json({ event: created[0] }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/events] Error:", error.message);
    return Response.json({ error: "Failed to create event" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
const wrappedPOST = withRequestContext(POST);
export { wrappedGET as GET, wrappedPOST as POST };
