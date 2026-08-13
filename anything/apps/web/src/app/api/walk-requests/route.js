import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";
import { safeNotify } from "@/app/api/utils/notify";

// walk-requests — the shared "request a walk" model (ticket C1 direct + C2 broadcast).
//   POST /api/walk-requests            — an OWNER creates a request. target_provider_id SET = DIRECT
//                                        (C1) → notify that walker's staff (walk_request_targeted).
//                                        target_provider_id NULL = BROADCAST "find a walker now" (C2)
//                                        → require pickup GPS + radius_km (default 5); fan out
//                                        walk_request_broadcast to every WALKER that is live-available
//                                        now (B1) and within radius of the pickup.
//   GET  /api/walk-requests[?mine=1]   — the caller's OWN requests + live status.
//
// Degrade clean: if walk_requests is missing (unmigrated prod) create returns a friendly 503 and
// list returns []; the broadcast fan-out finds no candidates if provider_live_availability is absent;
// never a 500. Expiry is evaluated at READ time. DB is porsager's tagged-template `sql`.

const BROADCAST_RADIUS_KM = 5;
const BROADCAST_FANOUT_CAP = 25;

// A compact JSON body the mobile bell renders in the recipient's language.
function walkRequestNotifyBody({ when_type, note }) {
  return JSON.stringify({ when_type: when_type ?? "now", note: note ?? null });
}

// Haversine distance in km (mirrors /api/providers/discover — no PostGIS).
function distanceKm(aLat, aLng, bLat, bLng) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// Provider ids of every WALKER that is live-available now (B1) and within radiusKm of (lat,lng).
// A bounding-box SQL prefilter (like /discover) then an exact haversine cut + nearest-first cap in
// JS. Degrades clean: if provider_live_availability is absent (unmigrated) → []. No PostGIS.
export async function broadcastCandidateProviderIds(lat, lng, radiusKm) {
  const latPad = radiusKm / 111;
  const lngPad = radiusKm / (111 * Math.max(0.01, Math.cos((lat * Math.PI) / 180)));
  let rows = [];
  try {
    rows = await sql`
      SELECT p.id, la.lat, la.lng
      FROM providers p
      JOIN provider_live_availability la ON la.provider_id = p.id
      WHERE p.status = 'published'
        AND la.accepting = true
        AND la.expires_at IS NOT NULL AND la.expires_at > now()
        AND la.lat IS NOT NULL AND la.lng IS NOT NULL
        AND la.lat BETWEEN ${lat - latPad} AND ${lat + latPad}
        AND la.lng BETWEEN ${lng - lngPad} AND ${lng + lngPad}
        AND EXISTS (
          SELECT 1 FROM provider_capabilities pc
          WHERE pc.provider_id = p.id AND pc.capability = 'walker'
        )
    `;
  } catch (e) {
    if (e?.code === "42P01") return [];
    throw e;
  }
  const within = rows
    .map((r) => ({ id: r.id, d: distanceKm(lat, lng, Number(r.lat), Number(r.lng)) }))
    .filter((r) => r.d <= radiusKm)
    .sort((a, b) => a.d - b.d);
  if (within.length > BROADCAST_FANOUT_CAP) {
    console.log(
      `[walk-requests] broadcast candidates capped: ${within.length} → ${BROADCAST_FANOUT_CAP} nearest`,
    );
  }
  return within.slice(0, BROADCAST_FANOUT_CAP).map((r) => r.id);
}

async function POST(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    const body = (await request.json()) ?? {};
    const {
      pet_id,
      target_provider_id,
      pickup_lat,
      pickup_lng,
      note,
      when_type,
      scheduled_at,
      radius_km,
    } = body;

    const petId = Number(pet_id);
    if (!Number.isInteger(petId)) {
      return Response.json({ error: "pet_id is required" }, { status: 400 });
    }

    // A DIRECT request (C1) names a specific walker; a BROADCAST request (C2) omits it and instead
    // needs a pickup point + radius so we can find nearby available walkers.
    const isBroadcast =
      target_provider_id === null ||
      target_provider_id === undefined ||
      target_provider_id === "";
    let targetProviderId = null;
    if (!isBroadcast) {
      targetProviderId = Number(target_provider_id);
      if (!Number.isInteger(targetProviderId)) {
        return Response.json({ error: "Invalid target_provider_id" }, { status: 400 });
      }
    }

    const lat = Number(pickup_lat);
    const lng = Number(pickup_lng);
    const hasPickup = Number.isFinite(lat) && Number.isFinite(lng);
    if (isBroadcast && !hasPickup) {
      return Response.json(
        { error: "A pickup location is required to find a walker now" },
        { status: 400 },
      );
    }
    const radiusKm =
      Number.isFinite(Number(radius_km)) && Number(radius_km) > 0
        ? Number(radius_km)
        : BROADCAST_RADIUS_KM;

    const resolvedWhen = when_type === "scheduled" ? "scheduled" : "now";
    if (resolvedWhen === "scheduled" && !scheduled_at) {
      return Response.json(
        { error: "scheduled_at is required for a scheduled request" },
        { status: 400 },
      );
    }

    // I must OWN the pet.
    const petCheck = await sql`
      SELECT id FROM pets WHERE id = ${petId} AND owner_user_id = ${userId}
    `;
    if (petCheck.length === 0) {
      return Response.json({ error: "You do not own this pet" }, { status: 403 });
    }

    // For a DIRECT request the target must exist, be published, and actually be a WALKER.
    if (!isBroadcast) {
      const provRows = await sql`
        SELECT id FROM providers WHERE id = ${targetProviderId} AND status = 'published'
      `;
      if (provRows.length === 0) {
        return Response.json({ error: "Walker not found" }, { status: 404 });
      }
      const capRows = await sql`
        SELECT provider_has_capability(${targetProviderId}, 'walker') AS has
      `;
      if (!capRows?.[0]?.has) {
        return Response.json(
          { error: "This provider is not a walker" },
          { status: 400 },
        );
      }
    }

    let created;
    try {
      created = await sql`
        INSERT INTO walk_requests (
          owner_user_id, pet_id, target_provider_id,
          pickup_lat, pickup_lng, note, when_type, scheduled_at, status
        ) VALUES (
          ${userId}, ${petId}, ${targetProviderId},
          ${hasPickup ? lat : null}, ${hasPickup ? lng : null}, ${note ?? null},
          ${resolvedWhen}, ${resolvedWhen === "scheduled" ? scheduled_at : null}, 'open'
        )
        RETURNING *
      `;
    } catch (e) {
      // Unmigrated prod (no table) → the feature isn't available yet.
      if (e?.code === "42P01") {
        return Response.json(
          { error: "Walk requests are not available yet" },
          { status: 503 },
        );
      }
      throw e;
    }

    // Fan out notifications so the right walkers see the request. Fire-and-forget (safeNotify never
    // throws). DIRECT → the one target's active staff; BROADCAST → active staff of every WALKER that
    // is live-available now (B1) and within radius of the pickup.
    try {
      let recipientProviderIds = [];
      if (!isBroadcast) {
        recipientProviderIds = [targetProviderId];
      } else {
        recipientProviderIds = await broadcastCandidateProviderIds(lat, lng, radiusKm);
      }
      const notifyType = isBroadcast ? "walk_request_broadcast" : "walk_request_targeted";
      if (recipientProviderIds.length > 0) {
        // Resolve recipients via a DEFINER reader: the CREATE runs as the OWNER, whose RLS cannot see
        // another provider's provider_staff (0093). Degrades to no-notify if the helper is absent.
        const staff = await sql`
          SELECT app_provider_active_staff_ids(${recipientProviderIds}::int[]) AS user_profile_id
        `;
        for (const s of staff) {
          await safeNotify({
            recipient: s.user_profile_id,
            actor: userId,
            type: notifyType,
            subjectRef: String(created[0].id),
            body: walkRequestNotifyBody({ when_type: resolvedWhen, note }),
          });
        }
      }
    } catch (notifyErr) {
      console.error("[POST /api/walk-requests] notify (non-fatal):", notifyErr?.message);
    }

    return Response.json({ request: created[0] }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/walk-requests] Error:", error?.message);
    return Response.json({ error: "Failed to create walk request" }, { status: 500 });
  }
}

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

    let requests = [];
    try {
      requests = await sql`
        SELECT
          wr.*,
          (wr.status = 'open' AND wr.expires_at > now()) AS is_live,
          tp.name AS target_provider_name,
          ap.name AS accepted_provider_name,
          pet.name AS pet_name
        FROM walk_requests wr
        LEFT JOIN providers tp ON tp.id = wr.target_provider_id
        LEFT JOIN providers ap ON ap.id = wr.accepted_provider_id
        LEFT JOIN pets pet ON pet.id = wr.pet_id
        WHERE wr.owner_user_id = ${userId}
        ORDER BY wr.created_at DESC
      `;
    } catch (e) {
      if (e?.code === "42P01") return Response.json({ requests: [] });
      throw e;
    }

    return Response.json({ requests });
  } catch (error) {
    console.error("[GET /api/walk-requests] Error:", error?.message);
    return Response.json({ error: "Failed to load walk requests" }, { status: 500 });
  }
}

const wrappedPOST = withRequestContext(POST);
const wrappedGET = withRequestContext(GET);
export { wrappedPOST as POST, wrappedGET as GET };
