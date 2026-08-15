import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { withRequestContext } from "@/app/api/utils/requestContext";
import { num, distanceKm } from "@/app/api/utils/placesQuery";
import { resolveDiscoveryCategory } from "@/app/api/utils/discoveryCategories";

// GET /api/services/discover?q=&category=&neighborhood=&lat=&lng=&radius= — the UNIFIED discovery
// backbone of the Services experience. Returns { items: [...] } where each item is a NORMALIZED,
// typed row merged from TWO sources: PawPi providers (published-provider projection, same as
// /api/providers/discover) and pet-friendly PLACES (the places catalog, 0075). Additive: the
// per-source endpoints (/api/providers/discover, /api/places) stay intact; this is one screen's
// worth of data in a single searchable/filterable/geo-sortable call.
//
// This lives at /api/services/discover, NOT /api/discover — that path is already the social
// Search & Discover feed (pet profiles + moments, ticket 2.25). The unified SERVICES surface is a
// distinct feature and gets its own namespace.
//
// Normalized item shape (per row):
//   { type: 'provider'|'place', id, slug (provider only; null for places), name,
//     capabilities (provider only: [] of capability keys; null for places),
//     category (place only, e.g. 'cafe'; null for providers),
//     lat, lng, address, neighborhood (place only; null for providers),
//     distance_km (present ONLY when lat/lng given),
//     avg_rating, review_count }   // provider → provider_reviews; place → place_reviews (overall)
//
// Category routing (shared taxonomy in utils/discoveryCategories.js):
//   • a PROVIDER category (vet/telehealth/grooming/walking/daycare/sitting/training/shop/adoption/
//     transport/insurance) → filter providers by the backing capability; NO places.
//   • a PLACE category (restaurant/cafe/bakery/brewery/bar/park/hotel/market) → filter places by
//     places.category; NO providers.
//   • 'all' or omitted → BOTH sources.
//   • an unknown category → neither source (empty list).
//
// q          → ILIKE on name across BOTH sources (bound, never interpolated).
// neighborhood → filters PLACES only. Providers are city-wide SERVICES (not a single physical
//                venue), so they are returned regardless of neighborhood — a provider is relevant to
//                every neighborhood it serves. (This mirrors the /api/providers/discover contract,
//                which has no neighborhood concept.)
// geo        → when lat/lng are valid, each item with coords gets a distance_km and the MERGED list
//              sorts nearest-first (items without coords sort last), mirroring providers/discover.
//              ?radius (km) additionally bounds each source via a bounding box. No geo → name order.
//
// Auth: a session is required (401 otherwise); reads are unscoped public browse (published providers
// + published, non-deleted places). Ratings are public aggregates — no owner/pet/consent data.
// RLS R1-rollout: the handler runs under withRequestContext (request-scoped DB identity).

async function GET(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);

    const q = searchParams.get("q") || null;
    const qLike = q ? `%${q}%` : null;
    const neighborhood = searchParams.get("neighborhood") || null;

    const { includeProviders, includePlaces, capability, placeCategory } =
      resolveDiscoveryCategory(searchParams.get("category"));

    // Geo (?lat/&lng/&radius) — same contract as providers/discover + places. radius is in km; when
    // present it bounds each source via a bounding box (1° lat ≈ 111km; lng shrinks by cos(lat)).
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

    const latPad = applyRadius ? radiusKm / 111 : null;
    const lngPad = applyRadius
      ? radiusKm / (111 * Math.max(0.01, Math.cos((lat * Math.PI) / 180)))
      : null;
    const latMin = applyRadius ? lat - latPad : null;
    const latMax = applyRadius ? lat + latPad : null;
    const lngMin = applyRadius ? lng - lngPad : null;
    const lngMax = applyRadius ? lng + lngPad : null;

    // ── Providers ── published-provider projection (mirrors /api/providers/discover): capabilities[]
    // + primary location (lowest-id via LATERAL) + avg_rating/review_count over provider_reviews as
    // correlated subqueries. neighborhood is NOT applied here (providers are city-wide).
    let providerRows = [];
    if (includeProviders) {
      providerRows = await sql`
        SELECT
          p.id, p.slug, p.name,
          (SELECT ROUND(AVG(r.rating)::numeric, 1) FROM provider_reviews r WHERE r.provider_id = p.id) AS avg_rating,
          (SELECT COUNT(*)::int FROM provider_reviews r WHERE r.provider_id = p.id) AS review_count,
          (SELECT COALESCE(array_agg(pc.capability ORDER BY pc.capability), ARRAY[]::text[])
             FROM provider_capabilities pc WHERE pc.provider_id = p.id) AS capabilities,
          loc.lat AS lat,
          loc.lng AS lng,
          loc.address AS address,
          loc.hours_json AS hours_json
        FROM providers p
        LEFT JOIN LATERAL (
          SELECT lat, lng, address, hours_json
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
    }

    // ── Places ── published, non-deleted catalog (0075) with avg_rating/review_count over
    // place_reviews (overall_rating, non-deleted) as correlated subqueries. neighborhood + category
    // (as placeCategory) are exact filters here.
    let placeRows = [];
    if (includePlaces) {
      placeRows = await sql`
        SELECT
          pl.id, pl.name, pl.category, pl.neighborhood, pl.address, pl.lat, pl.lng,
          (SELECT ROUND(AVG(r.overall_rating)::numeric, 1) FROM place_reviews r
             WHERE r.place_id = pl.id AND r.deleted_at IS NULL) AS avg_rating,
          (SELECT COUNT(*)::int FROM place_reviews r
             WHERE r.place_id = pl.id AND r.deleted_at IS NULL) AS review_count
        FROM places pl
        WHERE pl.status = 'published'
          AND pl.deleted_at IS NULL
          AND (${qLike}::text IS NULL OR pl.name ILIKE ${qLike})
          AND (${placeCategory}::text IS NULL OR pl.category = ${placeCategory})
          AND (${neighborhood}::text IS NULL OR pl.neighborhood = ${neighborhood})
          AND (
            ${applyRadius ? false : true}
            OR (
              pl.lat IS NOT NULL AND pl.lng IS NOT NULL
              AND pl.lat BETWEEN ${latMin} AND ${latMax}
              AND pl.lng BETWEEN ${lngMin} AND ${lngMax}
            )
          )
        ORDER BY pl.name ASC
      `;
    }

    // Normalize both sources to the unified typed row. slug/capabilities are provider-only;
    // category/neighborhood are place-only — the other side is null so callers get a stable shape.
    const providerItems = providerRows.map((r) => ({
      type: "provider",
      id: r.id,
      slug: r.slug,
      name: r.name,
      capabilities: r.capabilities ?? [],
      category: null,
      lat: r.lat,
      lng: r.lng,
      address: r.address,
      neighborhood: null,
      // hours_json powers the client "open now" filter (providers only). Free-form jsonb, may
      // be null; places carry no hours (null) and are always treated as included.
      hours_json: r.hours_json ?? null,
      avg_rating: r.avg_rating,
      review_count: r.review_count,
    }));

    const placeItems = placeRows.map((r) => ({
      type: "place",
      id: r.id,
      slug: null,
      name: r.name,
      capabilities: null,
      category: r.category,
      lat: r.lat,
      lng: r.lng,
      address: r.address,
      neighborhood: r.neighborhood,
      hours_json: null, // places carry no hours → always "included" by the open-now filter
      avg_rating: r.avg_rating,
      review_count: r.review_count,
    }));

    const merged = [...providerItems, ...placeItems];

    // No geo → unified NAME order across both sources (each source arrived name-sorted; the merge
    // needs a single re-sort). With geo → attach distance_km and re-sort nearest-first; coord-less
    // items sort last (and were already excluded from any source when ?radius is set).
    if (!hasGeo) {
      merged.sort((a, b) => a.name.localeCompare(b.name));
      return Response.json({ items: merged });
    }

    const items = merged
      .map((it) => ({
        ...it,
        distance_km:
          it.lat != null && it.lng != null
            ? distanceKm(lat, lng, Number(it.lat), Number(it.lng))
            : null,
      }))
      .sort((a, b) => (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity));

    return Response.json({ items });
  } catch (error) {
    console.error("[GET /api/services/discover] Error:", error.message);
    return Response.json(
      { error: "Failed to fetch discovery results" },
      { status: 500 },
    );
  }
}

// RLS R1-rollout: identity-scoped wrapper (docs/rls-hardening.md). Handler body unchanged.
const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
