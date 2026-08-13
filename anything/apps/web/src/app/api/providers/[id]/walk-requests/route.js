import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import {
  requireProviderRole,
  requireProviderCapability,
  ProviderAuthError,
  ALL_PROVIDER_ROLES,
} from "@/app/api/utils/providerAuth";
import { withRequestContext } from "@/app/api/utils/requestContext";

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

// GET /api/providers/[id]/walk-requests — a walker's incoming requests. Active staff of a walker
// provider only. Non-integer id → 404 before SQL. Degrade clean: no table → { requests: [] }.
//   ?status=open (default)  — INCOMING TARGETED requests (ticket C1): live rows aimed at this
//                             provider. RLS walk_requests_provider_read (0092) scopes them.
//   ?scope=broadcast        — NEARBY "find a walker now" broadcasts (ticket C2): live target-NULL
//                             rows within radius_km (default 5) of this provider's live point (B1).
//                             RLS walk_requests_broadcast_read (0093) admits broadcast rows to walker
//                             staff; the radius cut is done here. No live point → [].
async function GET(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const providerId = Number(params.id);
    if (!Number.isInteger(providerId)) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    await requireProviderCapability(providerId, "walker");
    await requireProviderRole(providerId, userId, ALL_PROVIDER_ROLES);

    const url = new URL(request.url);
    const scope = url.searchParams.get("scope");

    // ── NEARBY BROADCASTS (C2) ─────────────────────────────────────────────────
    if (scope === "broadcast") {
      const radiusParam = Number(url.searchParams.get("radius_km"));
      const radiusKm = Number.isFinite(radiusParam) && radiusParam > 0 ? radiusParam : 5;
      try {
        // This provider's live point while ACCEPTING now (B1). Not accepting / no point → [] (you see
        // nearby "find a walker now" requests only while you're available to take them).
        const live = await sql`
          SELECT lat, lng FROM provider_live_availability
          WHERE provider_id = ${providerId}
            AND accepting = true AND expires_at IS NOT NULL AND expires_at > now()
        `;
        const cLat = live?.[0]?.lat != null ? Number(live[0].lat) : null;
        const cLng = live?.[0]?.lng != null ? Number(live[0].lng) : null;
        if (cLat == null || cLng == null || !Number.isFinite(cLat) || !Number.isFinite(cLng)) {
          return Response.json({ requests: [] });
        }
        const latPad = radiusKm / 111;
        const lngPad = radiusKm / (111 * Math.max(0.01, Math.cos((cLat * Math.PI) / 180)));
        const rows = await sql`
          SELECT
            wr.*,
            pet.name AS pet_name,
            COALESCE(owner.full_name, owner.username) AS owner_name
          FROM walk_requests wr
          LEFT JOIN pets pet ON pet.id = wr.pet_id
          LEFT JOIN user_profiles owner ON owner.id = wr.owner_user_id
          WHERE wr.target_provider_id IS NULL
            AND wr.status = 'open' AND wr.expires_at > now()
            AND wr.pickup_lat IS NOT NULL AND wr.pickup_lng IS NOT NULL
            AND wr.pickup_lat BETWEEN ${cLat - latPad} AND ${cLat + latPad}
            AND wr.pickup_lng BETWEEN ${cLng - lngPad} AND ${cLng + lngPad}
          ORDER BY wr.created_at DESC
        `;
        const requests = rows
          .map((r) => ({
            ...r,
            distance_km: distanceKm(cLat, cLng, Number(r.pickup_lat), Number(r.pickup_lng)),
          }))
          .filter((r) => r.distance_km <= radiusKm);
        return Response.json({ requests });
      } catch (e) {
        if (e?.code === "42P01") return Response.json({ requests: [] });
        throw e;
      }
    }

    // ── INCOMING TARGETED (C1) ─────────────────────────────────────────────────
    const status = url.searchParams.get("status") ?? "open";
    const openOnly = status === "open";

    let requests = [];
    try {
      requests = await sql`
        SELECT
          wr.*,
          pet.name AS pet_name,
          COALESCE(owner.full_name, owner.username) AS owner_name
        FROM walk_requests wr
        LEFT JOIN pets pet ON pet.id = wr.pet_id
        LEFT JOIN user_profiles owner ON owner.id = wr.owner_user_id
        WHERE wr.target_provider_id = ${providerId}
          AND (
            ${openOnly}::boolean = false
            OR (wr.status = 'open' AND wr.expires_at > now())
          )
        ORDER BY wr.created_at DESC
      `;
    } catch (e) {
      if (e?.code === "42P01") return Response.json({ requests: [] });
      throw e;
    }

    return Response.json({ requests });
  } catch (e) {
    if (e instanceof ProviderAuthError) {
      return Response.json({ error: e.message }, { status: e.status ?? 403 });
    }
    console.error("[GET /api/providers/[id]/walk-requests] Error:", e?.message);
    return Response.json({ error: "Failed to load walk requests" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
