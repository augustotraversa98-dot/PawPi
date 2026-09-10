import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { withRequestContext, withSavepoint } from "@/app/api/utils/requestContext";
import { parsePaging } from "@/app/api/utils/paging";

const UNDEFINED_COLUMN = "42703"; // pre-0124/0125 DB lacks claim_status/pet_policy → degrade cleanly

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

    // provider_type filter (0125, additive) — needed by the pet-friendly directory
    // surface: seeded `pet_friendly` providers have NO provider_capabilities row
    // (they don't offer services), so the capability filter above never matches them.
    // Composes with the capability filter (both apply when both are given).
    const providerType = searchParams.get("provider_type") || null;

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

    // Paging (AUDIT_2026-09 A-14). The directory holds thousands of rows; without a bound
    // every call shipped the whole published set (≈1,400 rows with three correlated
    // subqueries each). Distance is now computed in SQL so nearest-first paging is exact.
    const { limit, offset } = parsePaging(searchParams);

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
    //
    // DEGRADE-CLEAN (house pattern; see SCHEMA_NOTES "hand-applied to Supabase after
    // merge"): p.claim_status and loc.pet_policy are additive columns from 0124/0125.
    // Migrations here are hand-applied to Supabase AFTER the code deploys, so there is
    // a window where this route runs against a DB that doesn't have them yet. Try the
    // full projection first, inside a SAVEPOINT (this handler runs inside
    // withRequestContext's transaction, so an unguarded failed query would abort the
    // whole request); on undefined_column (42703) retry without the two new columns,
    // defaulting them to null — existing consumers already treat a falsy claim_status /
    // pet_policy as "unknown / not shown" (ClaimCTA renders nothing, PetPolicyBadge
    // renders null).
    const selectFull = () => sql`
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
        loc.pet_policy AS pet_policy,
        (CASE
           WHEN ${hasGeo} AND loc.lat IS NOT NULL AND loc.lng IS NOT NULL THEN
             2 * 6371 * asin(sqrt(
               power(sin(radians((loc.lat - ${lat ?? 0}) / 2)), 2)
               + cos(radians(${lat ?? 0})) * cos(radians(loc.lat))
                 * power(sin(radians((loc.lng - ${lng ?? 0}) / 2)), 2)))
           ELSE NULL
         END) AS distance_km
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
        AND (${providerType}::text IS NULL OR p.provider_type = ${providerType})
        AND (${qLike}::text IS NULL OR p.name ILIKE ${qLike})
        AND (
          ${applyRadius ? false : true}
          OR (
            loc.lat IS NOT NULL AND loc.lng IS NOT NULL
            AND loc.lat BETWEEN ${latMin} AND ${latMax}
            AND loc.lng BETWEEN ${lngMin} AND ${lngMax}
          )
        )
      ORDER BY distance_km ASC NULLS LAST, p.name ASC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const selectPreMigration = () => sql`
      SELECT
        p.id, p.slug, p.name, p.provider_type, p.bio, p.logo_url,
        NULL::text AS claim_status,
        (SELECT ROUND(AVG(r.rating)::numeric, 1) FROM provider_reviews r WHERE r.provider_id = p.id) AS avg_rating,
        (SELECT COUNT(*)::int FROM provider_reviews r WHERE r.provider_id = p.id) AS review_count,
        (SELECT COALESCE(array_agg(pc.capability ORDER BY pc.capability), ARRAY[]::text[])
           FROM provider_capabilities pc WHERE pc.provider_id = p.id) AS capabilities,
        loc.lat AS lat,
        loc.lng AS lng,
        loc.name AS location_name,
        loc.address AS location_address,
        loc.hours_json AS hours_json,
        NULL::text AS pet_policy,
        (CASE
           WHEN ${hasGeo} AND loc.lat IS NOT NULL AND loc.lng IS NOT NULL THEN
             2 * 6371 * asin(sqrt(
               power(sin(radians((loc.lat - ${lat ?? 0}) / 2)), 2)
               + cos(radians(${lat ?? 0})) * cos(radians(loc.lat))
                 * power(sin(radians((loc.lng - ${lng ?? 0}) / 2)), 2)))
           ELSE NULL
         END) AS distance_km
      FROM providers p
      LEFT JOIN LATERAL (
        SELECT lat, lng, name, address, hours_json
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
        AND (${providerType}::text IS NULL OR p.provider_type = ${providerType})
        AND (${qLike}::text IS NULL OR p.name ILIKE ${qLike})
        AND (
          ${applyRadius ? false : true}
          OR (
            loc.lat IS NOT NULL AND loc.lng IS NOT NULL
            AND loc.lat BETWEEN ${latMin} AND ${latMax}
            AND loc.lng BETWEEN ${lngMin} AND ${lngMax}
          )
        )
      ORDER BY distance_km ASC NULLS LAST, p.name ASC
      LIMIT ${limit} OFFSET ${offset}
    `;

    let rows;
    try {
      rows = await withSavepoint(selectFull);
    } catch (e) {
      if (e?.code !== UNDEFINED_COLUMN) throw e;
      rows = await selectPreMigration();
    }

    // No geo → distance_km is NULL for every row and the ORDER BY degrades to name order
    // (the pre-P1 behaviour). With geo → SQL computed distance_km and ordered nearest-first
    // with coord-less providers last (already excluded when ?radius is set). Normalise the
    // numeric column and drop it entirely when no geo was given, keeping the old shape.
    const providers = rows.map((r) => {
      const { distance_km, ...rest } = r;
      return hasGeo
        ? { ...rest, distance_km: distance_km == null ? null : Number(distance_km) }
        : rest;
    });

    return Response.json({
      providers,
      page: { limit, offset, count: providers.length, hasMore: providers.length === limit },
    });
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
