import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { withRequestContext } from "@/app/api/utils/requestContext";

// Owner-facing provider discovery (docs/provider-design.md §4 item 5).
// The PUBLIC read view: any logged-in owner can browse PUBLISHED providers.
// This is DISTINCT from the staff-only management GETs (4a, GET /api/providers
// and /api/providers/[id]) which require provider_staff membership and return the
// staff list. Discovery is the one provider surface with NO consent involved:
// it returns public business info only and MUST NOT read care_access_grants or
// any pet/owner data.
//
// Auth: a session is required (401 otherwise), but no per-user scoping — published
// providers are visible to every logged-in user — so there is deliberately no
// resolveUserId / user_profiles lookup and no requireProviderRole here.
//
// Returns ONLY status='published' providers; draft providers are invisible.
// Public business fields only — never owner identity (owner_user_profile_id),
// staff, or pet data.
//
// SERVICES HUB P1 (docs/SERVICES_HUB_PLAN.md §5): the projection now also carries
// map + grouping context so the unified discovery surface can render a list + map
// without a second round-trip — the provider's capabilities[] and its PRIMARY
// location (lat / lng / location_name / hours_json). New OPTIONAL query params add
// geo (?lat/&lng/&radius, mirroring the /api/adoption/listings contract), a
// capability filter (?capability, with the legacy ?type still accepted), and a
// name search (?q). ALL changes are additive — existing callers (no params, or a
// bare ?type=) get the SAME published set in the SAME name order, now with extra
// nullable fields on each row.

// Parse a finite number or null (blank/garbage → null).
function num(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Haversine distance in km between two lat/lng points (mirrors adoption/listings).
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

async function GET(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);

    // Capability filter (ticket 2.1): match providers that HOLD the capability, NOT
    // provider_type. ?capability is the P1 name; ?type is still accepted for the
    // existing per-capability screens. When both are present, ?capability wins.
    const capability =
      searchParams.get("capability") || searchParams.get("type") || null;

    // Name search — a simple ILIKE, bound (never interpolated). Empty → no filter.
    const q = searchParams.get("q") || null;
    const qLike = q ? `%${q}%` : null;

    // openNow: accepted for a stable client contract, but NOT enforced server-side
    // this phase — provider_locations.hours_json is free-form jsonb with no proven
    // schema, so the client derives open-now from the returned hours_json. Parsing it
    // here keeps the param known and reserved for a later server implementation.
    const openNow = searchParams.get("openNow") === "true";
    void openNow;

    // Geo (?lat/&lng/&radius). ?radius is in km. When lat+lng are valid we attach a
    // distance and sort nearest-first; a radius (when given) additionally filters via a
    // bounding box. No radius = distance sort with no distance cutoff.
    const lat = num(searchParams.get("lat"));
    const lng = num(searchParams.get("lng"));
    const radiusKm = num(searchParams.get("radius"));
    const hasGeo =
      lat != null &&
      lng != null &&
      lat >= -90 &&
      lat <= 90 &&
      lng >= -180 &&
      lng <= 180;
    const applyRadius = hasGeo && radiusKm != null && radiusKm > 0;

    // Bounding box for the radius pre-filter (1° lat ≈ 111km; lng shrinks by cos(lat)).
    const latPad = applyRadius ? radiusKm / 111 : null;
    const lngPad = applyRadius
      ? radiusKm / (111 * Math.max(0.01, Math.cos((lat * Math.PI) / 180)))
      : null;
    const latMin = applyRadius ? lat - latPad : null;
    const latMax = applyRadius ? lat + latPad : null;
    const lngMin = applyRadius ? lng - lngPad : null;
    const lngMax = applyRadius ? lng + lngPad : null;

    // ONE joined read with COALESCE-style optional filters (a single tagged template —
    // never sql(string, array); see SCHEMA_NOTES "neon→porsager"). One row PER PROVIDER
    // (capability filtering is an EXISTS, not a JOIN, so a multi-capability provider is
    // never duplicated), with:
    //   • avg_rating / review_count — correlated over provider_reviews (ticket 2.2)
    //   • capabilities[]           — correlated array_agg over provider_capabilities
    //   • lat/lng/location_name/hours_json — the PRIMARY location via LATERAL (lowest
    //     id = primary until an additive is_primary flag exists; see the plan §6)
    // Providers with no location return NULL coords: they still appear in the list, are
    // absent from the map, and drop out only when a ?radius filter is active.
    const rows = await sql`
      SELECT
        p.id, p.slug, p.name, p.provider_type, p.bio, p.logo_url,
        p.claim_status,
        (SELECT ROUND(AVG(r.rating)::numeric, 1) FROM provider_reviews r WHERE r.provider_id = p.id) AS avg_rating,
        (SELECT COUNT(*)::int FROM provider_reviews r WHERE r.provider_id = p.id) AS review_count,
        (SELECT COALESCE(array_agg(pc.capability ORDER BY pc.capability), ARRAY[]::text[])
           FROM provider_capabilities pc WHERE pc.provider_id = p.id) AS capabilities,
        loc.lat AS lat,
        loc.lng AS lng,
        loc.name AS location_name,
        loc.address AS location_address,
        loc.hours_json AS hours_json,
        loc.pet_policy AS pet_policy
      FROM providers p
      LEFT JOIN LATERAL (
        SELECT lat, lng, name, address, hours_json, pet_policy
        FROM provider_locations pl
        WHERE pl.provider_id = p.id
        ORDER BY pl.id ASC
        LIMIT 1
      ) loc ON true
      WHERE p.status = 'published'
        -- Exclude demo/seed providers (0111) from real discovery.
        AND p.is_demo IS NOT TRUE
        AND (
          ${capability}::text IS NULL
          OR EXISTS (
            SELECT 1 FROM provider_capabilities pc
            WHERE pc.provider_id = p.id AND pc.capability = ${capability}
          )
        )
        AND (${qLike}::text IS NULL OR p.name ILIKE ${qLike})
        AND (
          ${applyRadius ? false : true}
          OR (
            loc.lat IS NOT NULL AND loc.lng IS NOT NULL
            AND loc.lat BETWEEN ${latMin} AND ${latMax}
            AND loc.lng BETWEEN ${lngMin} AND ${lngMax}
          )
        )
      ORDER BY p.name ASC
    `;

    // No geo → published set in name order (the pre-P1 behaviour, now with the extra
    // fields). With geo → attach distance_km and re-sort nearest-first; providers
    // lacking coords sort to the end (and were already excluded when ?radius is set).
    if (!hasGeo) {
      return Response.json({ providers: rows });
    }

    const providers = rows
      .map((r) => ({
        ...r,
        distance_km:
          r.lat != null && r.lng != null
            ? distanceKm(lat, lng, Number(r.lat), Number(r.lng))
            : null,
      }))
      .sort((a, b) => (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity));

    return Response.json({ providers });
  } catch (error) {
    console.error("[GET /api/providers/discover] Error:", error.message);
    return Response.json(
      { error: "Failed to fetch providers" },
      { status: 500 },
    );
  }
}

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md). Handler
// bodies are unchanged — only their DB connection is now request-scoped.
const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
