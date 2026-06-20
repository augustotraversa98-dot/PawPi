import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";
import { moderationResponse } from "@/app/api/utils/moderateText";

// Lost & Found (ticket 2.48).
//   GET            → browse ACTIVE alerts (optional lat/lng/radiusKm bounding box)
//   GET ?mine=true → the caller's own reports
//   POST           → owner activates lost mode for a pet (+ best-effort follower alerts)

async function GET(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = await resolveUserId(session.user.id);
    if (!userId) return Response.json({ reports: [] });

    const { searchParams } = new URL(request.url);
    const mine = searchParams.get("mine") === "true";

    if (mine) {
      const reports = await sql`
        SELECT r.*, p.name AS pet_name, p.avatar_url AS pet_avatar, p.breed AS pet_breed
        FROM lost_reports r
        JOIN pets p ON p.id = r.pet_id
        WHERE r.owner_user_id = ${userId}
        ORDER BY r.created_at DESC
      `;
      return Response.json({ reports });
    }

    // Optional bounding box (no PostGIS — reuse the 2.43 approach).
    const lat = parseFloat(searchParams.get("lat"));
    const lng = parseFloat(searchParams.get("lng"));
    const radiusKm = parseFloat(searchParams.get("radiusKm")) || 25;
    const hasBox = Number.isFinite(lat) && Number.isFinite(lng);
    let latMin = null, latMax = null, lngMin = null, lngMax = null;
    if (hasBox) {
      const latD = radiusKm / 111;
      const lngD = radiusKm / (111 * Math.max(0.01, Math.cos((lat * Math.PI) / 180)));
      latMin = lat - latD; latMax = lat + latD; lngMin = lng - lngD; lngMax = lng + lngD;
    }

    const reports = await sql`
      SELECT
        r.id, r.pet_id, r.status, r.last_seen_lat, r.last_seen_lng, r.last_seen_area,
        r.notes, r.reward, r.created_at,
        p.name AS pet_name, p.avatar_url AS pet_avatar, p.breed AS pet_breed,
        up.username AS owner_username
      FROM lost_reports r
      JOIN pets p ON p.id = r.pet_id
      JOIN user_profiles up ON up.id = r.owner_user_id
      WHERE r.status = 'active'
        -- Moderation (T3): hide reports removed by us + reports from a blocked owner.
        AND r.hidden_at IS NULL
        AND NOT app_user_is_blocked(${userId}, r.owner_user_id)
        AND (
          ${!hasBox}
          OR (
            r.last_seen_lat IS NOT NULL AND r.last_seen_lng IS NOT NULL
            AND r.last_seen_lat BETWEEN ${latMin} AND ${latMax}
            AND r.last_seen_lng BETWEEN ${lngMin} AND ${lngMax}
          )
        )
      ORDER BY r.created_at DESC
      LIMIT 100
    `;
    return Response.json({ reports });
  } catch (error) {
    console.error("[GET /api/lost-reports] Error:", error.message);
    return Response.json({ error: "Failed to load reports" }, { status: 500 });
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

    const body = await request.json();
    const petId = parseInt(body.petId);
    if (!Number.isInteger(petId)) {
      return Response.json({ error: "petId is required" }, { status: 400 });
    }
    const lat = body.lat == null || body.lat === "" ? null : Number(body.lat);
    const lng = body.lng == null || body.lng === "" ? null : Number(body.lng);

    // Content filter (T7): reject objectionable notes / last-seen-area text before insert.
    const blocked = moderationResponse(body.notes, body.lastSeenArea);
    if (blocked) return blocked;

    // Verify ownership (RLS also enforces owner_user_id = me on the insert).
    const pets = await sql`
      SELECT id, name FROM pets WHERE id = ${petId} AND owner_user_id = ${userId}
    `;
    if (pets.length === 0) {
      return Response.json({ error: "Pet not found or not yours" }, { status: 403 });
    }

    let created;
    try {
      created = await sql`
        INSERT INTO lost_reports
          (pet_id, owner_user_id, status, last_seen_lat, last_seen_lng, last_seen_area, notes, reward)
        VALUES (${petId}, ${userId}, 'active', ${lat}, ${lng},
                ${body.lastSeenArea || null}, ${body.notes || null}, ${body.reward || null})
        RETURNING *
      `;
    } catch (e) {
      if (String(e.message).includes("idx_lost_reports_one_active")) {
        return Response.json({ error: "This pet is already marked lost" }, { status: 409 });
      }
      throw e;
    }

    // Best-effort: alert the owner's pet followers. A notify failure NEVER blocks activation.
    try {
      const petName = pets[0].name;
      const followers = await sql`
        SELECT DISTINCT p.owner_user_id AS uid
        FROM pet_follows pf
        JOIN pets p ON p.id = pf.follower_pet_id
        WHERE pf.followed_pet_id = ${petId} AND p.owner_user_id <> ${userId}
      `;
      for (const f of followers) {
        await sql`
          SELECT app_notify(${f.uid}, ${userId}, 'lost_alert', ${String(petId)},
            ${`${petName} is missing${body.lastSeenArea ? ` near ${body.lastSeenArea}` : ""}. Keep an eye out!`})
        `;
      }
    } catch (notifyErr) {
      console.error("[lost-reports] follower alert failed (non-blocking):", notifyErr.message);
    }

    return Response.json({ report: created[0] }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/lost-reports] Error:", error.message);
    return Response.json({ error: "Failed to activate lost mode" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
const wrappedPOST = withRequestContext(POST);
export { wrappedGET as GET, wrappedPOST as POST };
