import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";
import { isMissingColumn } from "@/app/api/utils/adoptionQuestions";

// GET /api/adoption/listings — the OWNER-facing adoption browse (ticket 2.86). A single flat,
// filterable, NEAREST-FIRST read across every PUBLISHED provider's AVAILABLE adoptable dogs, joined
// to the provider + its primary location (lat/lng from 2.81). Distinct from the provider-scoped
// management list (/api/providers/[id]/adoptable-listings): no ownership, public discovery only.
//
// Visibility reuses the discovery rule (published provider + available listing) — and rides the
// existing RLS (0038 listings public-read + 0024 provider_locations public-read for published
// providers), so the joined read is safe as any authed owner.
//
// Filters (all optional, compose): gender, size, age_min/age_max (years), energy_level,
// good_with_kids/cats/dogs, vaccination_status, provider_id, and city. Nearest-first when
// lat+lng are valid; else featured-first then recent.
//
// DISTANCE RANKS, IT DOES NOT EXCLUDE (ticket 2.95). Sharing location only SORTS the results
// nearest-first — every AVAILABLE dog of every PUBLISHED provider is returned regardless of
// distance (a shelter across the country still appears, just ranked lower; coordless shelters
// last). The old bounding-box that HID located-but-far shelters is now opt-in only: pass
// enforce_radius=true (with lat+lng+radius_km) to re-apply it. Off by default so sparse early
// data never leaves an owner staring at an empty browse.
//
// EACH ROW REFLECTS THE VIEWER'S OWN APPLICATION (ticket 2.95): my_application_status is a
// correlated read of adoption_applications scoped STRICTLY to the current user
// (applicant_owner_user_id = me) → null | submitted | under_review | approved | declined. The
// mobile apply button renders off this so an owner who already applied sees a disabled,
// status-aware CTA instead of a re-arm-to-duplicate "Apply to adopt".

function num(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function bool(v) {
  if (v === "true") return true;
  if (v === "false") return false;
  return null;
}

// Haversine distance in km between two lat/lng points.
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
    // The browsing owner's own user_profiles.id — used ONLY to reflect their existing
    // application per listing (my_application_status). Null (no profile yet) → the correlated
    // subquery matches nothing and every dog reads my_application_status = null.
    const viewerId = await resolveUserId(session.user.id);

    const { searchParams } = new URL(request.url);
    const gender = searchParams.get("gender") || null;
    const size = searchParams.get("size") || null;
    const energy = searchParams.get("energy_level") || null;
    const vaccination = searchParams.get("vaccination_status") || null;
    const city = searchParams.get("city") || null;
    const providerId = num(searchParams.get("provider_id"));
    const ageMin = num(searchParams.get("age_min"));
    const ageMax = num(searchParams.get("age_max"));
    const goodKids = bool(searchParams.get("good_with_kids"));
    const goodCats = bool(searchParams.get("good_with_cats"));
    const goodDogs = bool(searchParams.get("good_with_dogs"));

    const lat = num(searchParams.get("lat"));
    const lng = num(searchParams.get("lng"));
    const radiusKm = num(searchParams.get("radius_km")) ?? 100;
    // Radius filtering is OPT-IN (ticket 2.95): by default distance only RANKS results. Set
    // enforce_radius=true to hard-filter located shelters to the bounding box below.
    const enforceRadius = bool(searchParams.get("enforce_radius")) === true;
    const hasGeo =
      lat != null && lng != null && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
    const boxFilter = hasGeo && enforceRadius;

    // Bounding box for the radius pre-filter (1° lat ≈ 111km; lng shrinks by cos(lat)).
    const latPad = hasGeo ? radiusKm / 111 : null;
    const lngPad = hasGeo
      ? radiusKm / (111 * Math.max(0.01, Math.cos((lat * Math.PI) / 180)))
      : null;
    const latMin = hasGeo ? lat - latPad : null;
    const latMax = hasGeo ? lat + latPad : null;
    const lngMin = hasGeo ? lng - lngPad : null;
    const lngMax = hasGeo ? lng + lngPad : null;

    // One joined read with COALESCE-style optional filters (all in a single tagged template — no
    // sql(string,array) gotcha). The primary location is the provider's earliest location row.
    // application_questions (0086) is projected behind a pre-migration degrade: on 42703 (column
    // not applied yet) the read retries with a '[]' literal so the whole browse still works (the
    // apply form simply shows no questions), never a 500. Two explicit statements (one sql call on
    // the happy path), mirroring the 0084 comments degrade.
    let rows;
    try {
      rows = await sql`
        SELECT
          al.id, al.provider_id, al.name, al.breed, al.age_years, al.age_months,
          al.gender, al.size, al.photo_urls, al.video_url, al.story,
          al.good_with_kids, al.good_with_cats, al.good_with_dogs, al.energy_level,
          al.vaccination_status, al.adoption_fee_cents, al.currency, al.status,
          al.placement_type, al.is_urgent, al.is_featured, al.urgent_reason, al.created_at,
          al.application_questions,
          (
            SELECT aa.status FROM adoption_applications aa
            WHERE aa.applicant_owner_user_id = ${viewerId}::int
              AND aa.listing_id = al.id
            ORDER BY aa.created_at DESC, aa.id DESC
            LIMIT 1
          ) AS my_application_status,
          p.name AS provider_name, p.slug AS provider_slug, p.logo_url AS provider_logo_url,
          loc.lat AS provider_lat, loc.lng AS provider_lng,
          loc.address AS provider_address, loc.name AS provider_location_name
        FROM adoptable_listings al
        JOIN providers p ON p.id = al.provider_id AND p.status = 'published'
        LEFT JOIN LATERAL (
          SELECT lat, lng, address, name
          FROM provider_locations pl
          WHERE pl.provider_id = p.id
          ORDER BY pl.created_at ASC
          LIMIT 1
        ) loc ON true
        WHERE al.status = 'available'
          -- Exclude demo/seed shelters' listings (0111) from real adoption browse.
          AND p.is_demo IS NOT TRUE
          AND (${providerId}::int IS NULL OR al.provider_id = ${providerId})
          AND (${gender}::text IS NULL OR al.gender = ${gender})
          AND (${size}::text IS NULL OR al.size = ${size})
          AND (${energy}::text IS NULL OR al.energy_level = ${energy})
          AND (${vaccination}::text IS NULL OR al.vaccination_status = ${vaccination})
          AND (${ageMin}::int IS NULL OR al.age_years >= ${ageMin})
          AND (${ageMax}::int IS NULL OR al.age_years <= ${ageMax})
          AND (${goodKids}::bool IS NULL OR al.good_with_kids = ${goodKids})
          AND (${goodCats}::bool IS NULL OR al.good_with_cats = ${goodCats})
          AND (${goodDogs}::bool IS NULL OR al.good_with_dogs = ${goodDogs})
          AND (${city}::text IS NULL OR loc.address ILIKE ${"%" + (city ?? "") + "%"})
          AND (
            ${boxFilter ? false : true}
            OR loc.lat IS NULL OR loc.lng IS NULL
            OR (
              loc.lat BETWEEN ${latMin} AND ${latMax}
              AND loc.lng BETWEEN ${lngMin} AND ${lngMax}
            )
          )
        ORDER BY al.is_featured DESC, al.created_at DESC
      `;
    } catch (e) {
      if (!isMissingColumn(e)) throw e;
      rows = await sql`
        SELECT
          al.id, al.provider_id, al.name, al.breed, al.age_years, al.age_months,
          al.gender, al.size, al.photo_urls, al.video_url, al.story,
          al.good_with_kids, al.good_with_cats, al.good_with_dogs, al.energy_level,
          al.vaccination_status, al.adoption_fee_cents, al.currency, al.status,
          al.placement_type, al.is_urgent, al.is_featured, al.urgent_reason, al.created_at,
          '[]'::jsonb AS application_questions,
          (
            SELECT aa.status FROM adoption_applications aa
            WHERE aa.applicant_owner_user_id = ${viewerId}::int
              AND aa.listing_id = al.id
            ORDER BY aa.created_at DESC, aa.id DESC
            LIMIT 1
          ) AS my_application_status,
          p.name AS provider_name, p.slug AS provider_slug, p.logo_url AS provider_logo_url,
          loc.lat AS provider_lat, loc.lng AS provider_lng,
          loc.address AS provider_address, loc.name AS provider_location_name
        FROM adoptable_listings al
        JOIN providers p ON p.id = al.provider_id AND p.status = 'published'
        LEFT JOIN LATERAL (
          SELECT lat, lng, address, name
          FROM provider_locations pl
          WHERE pl.provider_id = p.id
          ORDER BY pl.created_at ASC
          LIMIT 1
        ) loc ON true
        WHERE al.status = 'available'
          -- Exclude demo/seed shelters' listings (0111) from real adoption browse.
          AND p.is_demo IS NOT TRUE
          AND (${providerId}::int IS NULL OR al.provider_id = ${providerId})
          AND (${gender}::text IS NULL OR al.gender = ${gender})
          AND (${size}::text IS NULL OR al.size = ${size})
          AND (${energy}::text IS NULL OR al.energy_level = ${energy})
          AND (${vaccination}::text IS NULL OR al.vaccination_status = ${vaccination})
          AND (${ageMin}::int IS NULL OR al.age_years >= ${ageMin})
          AND (${ageMax}::int IS NULL OR al.age_years <= ${ageMax})
          AND (${goodKids}::bool IS NULL OR al.good_with_kids = ${goodKids})
          AND (${goodCats}::bool IS NULL OR al.good_with_cats = ${goodCats})
          AND (${goodDogs}::bool IS NULL OR al.good_with_dogs = ${goodDogs})
          AND (${city}::text IS NULL OR loc.address ILIKE ${"%" + (city ?? "") + "%"})
          AND (
            ${boxFilter ? false : true}
            OR loc.lat IS NULL OR loc.lng IS NULL
            OR (
              loc.lat BETWEEN ${latMin} AND ${latMax}
              AND loc.lng BETWEEN ${lngMin} AND ${lngMax}
            )
          )
        ORDER BY al.is_featured DESC, al.created_at DESC
      `;
    }

    let listings = rows;
    let sort = "featured_recent";
    if (hasGeo) {
      // Nearest-first: attach distance + sort ascending. Located shelters rank by real distance
      // (near → far, none excluded); coordless shelters have null distance → sort last. Featured
      // still bubbles up within the same proximity tie-break.
      listings = rows
        .map((r) => ({
          ...r,
          distance_km:
            r.provider_lat != null && r.provider_lng != null
              ? distanceKm(lat, lng, Number(r.provider_lat), Number(r.provider_lng))
              : null,
        }))
        .sort((a, b) => {
          const da = a.distance_km ?? Infinity;
          const db = b.distance_km ?? Infinity;
          if (da !== db) return da - db;
          return (b.is_featured ? 1 : 0) - (a.is_featured ? 1 : 0);
        });
      sort = "nearest";
    }

    return Response.json({ listings, sort });
  } catch (error) {
    console.error("[GET /api/adoption/listings] Error:", error.message);
    return Response.json({ error: "Failed to load adoptable dogs" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
