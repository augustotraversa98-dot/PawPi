// placesQuery — DB reads for the PawPi-owned places catalog (0075), the free replacement for the
// Google Places proxy. Shared by GET /api/places (index search), GET /api/places/search (the
// legacy path, kept alive for the mobile client), and GET /api/places/[placeId] (detail).
//
// Reads are PUBLIC-ish: any authed user sees published, non-deleted rows (the route enforces auth;
// the places RLS additionally scopes to status='published' AND deleted_at IS NULL). Geo mirrors
// providers/discover exactly — a bounding-box pre-filter in SQL, then a haversine distance attached
// and nearest-first sort in JS.
//
// DB is porsager's tagged-template `sql` (SCHEMA_NOTES "neon→porsager"): every query is ONE tagged
// template with bound `${}` params — never sql(string, array).

import sql from './sql';

// Parse a finite number or null (blank/garbage → null).
export function num(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Haversine distance in km (mirrors providers/discover + adoption/listings).
export function distanceKm(aLat, aLng, bLat, bLng) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * Search the published catalog. All filters optional:
 *   q            — ILIKE on name
 *   category     — exact match
 *   neighborhood — exact match
 *   lat/lng      — attach distance_km + sort nearest-first
 *   radiusKm     — with lat/lng, a bounding-box pre-filter (drops far + coord-less rows)
 * Returns rows (name order without geo; distance order with geo).
 */
export async function searchPlacesInDb({ q, category, neighborhood, lat, lng, radiusKm } = {}) {
  const qLike = q ? `%${q}%` : null;
  const hasGeo =
    lat != null && lng != null && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
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

  const rows = await sql`
    SELECT
      id, name, category, neighborhood, city, address, lat, lng,
      website, instagram, phone, pet_friendly_note, source, source_url, confidence, created_at
    FROM places
    WHERE status = 'published'
      AND deleted_at IS NULL
      AND (${qLike}::text IS NULL OR name ILIKE ${qLike})
      AND (${category}::text IS NULL OR category = ${category})
      AND (${neighborhood}::text IS NULL OR neighborhood = ${neighborhood})
      AND (
        ${applyRadius ? false : true}
        OR (
          lat IS NOT NULL AND lng IS NOT NULL
          AND lat BETWEEN ${latMin} AND ${latMax}
          AND lng BETWEEN ${lngMin} AND ${lngMax}
        )
      )
    ORDER BY name ASC
  `;

  if (!hasGeo) return rows;

  return rows
    .map((r) => ({
      ...r,
      distance_km:
        r.lat != null && r.lng != null
          ? distanceKm(lat, lng, Number(r.lat), Number(r.lng))
          : null,
    }))
    .sort((a, b) => (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity));
}

/** One published, non-deleted place by id, or null. */
export async function getPlaceById(id) {
  const rows = await sql`
    SELECT
      id, name, category, neighborhood, city, address, lat, lng,
      website, instagram, phone, pet_friendly_note, source, source_url, confidence, created_at
    FROM places
    WHERE id = ${id} AND status = 'published' AND deleted_at IS NULL
    LIMIT 1
  `;
  return rows[0] ?? null;
}
