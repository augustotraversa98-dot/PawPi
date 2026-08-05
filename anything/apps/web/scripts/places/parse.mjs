// scripts/places/parse.mjs — PURE mapping logic for the places catalog importer + seed loader.
//
// No DB, no fs, no ambient network: the ONE function that touches the network (geocodePlace) takes
// an injected `fetchImpl`, so everything here is unit-testable without a live Overpass/Nominatim
// (see parse.test.js). The node-only side effects (env, postgres, rate-limited fetch loop) live in
// lib.mjs + the runner scripts. Mirrors the demo-seed spec.mjs / lib.mjs split.

// ─────────────────────────────────────────────────────────────────────────────
// Overpass query (importer). ONE query, bounding box over CABA + all of Zona Norte
// (Vicente López, Olivos, Martínez, San Isidro, Beccar, Boulogne, San Fernando, Tigre, Pilar edge).
// bbox order is (south, west, north, east). `nwr` = node|way|relation; `out center tags` gives
// ways/relations a single center coordinate. We fetch two element sets:
//   1. dog=yes venues on the eating/drinking amenities the task lists
//   2. leisure=dog_park (fenced off-leash areas)
// ─────────────────────────────────────────────────────────────────────────────
export const OVERPASS_BBOX = { south: -34.72, west: -58.64, north: -34.38, east: -58.32 };

export const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';

export const OVERPASS_QUERY = (() => {
  const { south, west, north, east } = OVERPASS_BBOX;
  const bbox = `${south},${west},${north},${east}`;
  return `[out:json][timeout:90];
(
  nwr["dog"="yes"]["amenity"~"^(cafe|restaurant|bar|pub|fast_food|bakery|ice_cream)$"](${bbox});
  nwr["leisure"="dog_park"](${bbox});
);
out center tags;`;
})();

// OSM tag → our category enum (places_category_check). pub→bar, fast_food→restaurant,
// ice_cream→cafe are deliberate collapses onto the nearest allowed value; a dog_park is a park.
const AMENITY_CATEGORY = {
  cafe: 'cafe',
  restaurant: 'restaurant',
  bar: 'bar',
  pub: 'bar',
  fast_food: 'restaurant',
  bakery: 'bakery',
  ice_cream: 'cafe',
};

function categoryFromTags(tags = {}) {
  if (tags.leisure === 'dog_park') return 'park';
  return AMENITY_CATEGORY[tags.amenity] ?? 'other';
}

// neighborhood is derived from addr:suburb, then addr:city, else null (task rule).
function neighborhoodFromTags(tags = {}) {
  return tags['addr:suburb'] || tags['addr:city'] || null;
}

// Compose a street address from OSM addr:* parts. Argentine order is "Street Number".
function addressFromTags(tags = {}) {
  const street = tags['addr:street'];
  const hn = tags['addr:housenumber'];
  if (!street) return null;
  return hn ? `${street} ${hn}` : street;
}

// blank → null (the curated JSON uses "" for absent website/phone/instagram).
function nullifyBlank(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

// slugify for the curated id: accent-folded, lowercased, non-alphanumeric → single dashes.
// "Soffice Pastelería" + "San Isidro" → "soffice-pasteleria-san-isidro".
export function slugify(name, neighborhood) {
  const base = [name, neighborhood].filter(Boolean).join(' ');
  return base
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritical marks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Map ONE Overpass element → a places row, or null when it can't be a valid row (no name, since
// places.name is NOT NULL). lat/lng come from the node itself or, for ways/relations, `out center`.
export function overpassElementToPlace(el) {
  const tags = el.tags || {};
  const name = nullifyBlank(tags.name);
  if (!name) return null; // NOT NULL name — skip unnamed elements

  const lat = el.lat ?? el.center?.lat ?? null;
  const lng = el.lon ?? el.center?.lon ?? null;
  const address = addressFromTags(tags);

  // Well-tagged (name + a real street address) → high; otherwise medium.
  const confidence = address ? 'high' : 'medium';

  const note =
    tags.leisure === 'dog_park'
      ? 'Fenced off-leash dog park (leisure=dog_park) in OpenStreetMap.'
      : 'Tagged dog=yes in OpenStreetMap.';

  return {
    id: `osm-${el.type}-${el.id}`,
    name,
    category: categoryFromTags(tags),
    neighborhood: neighborhoodFromTags(tags),
    city: 'Buenos Aires',
    address,
    lat: lat == null ? null : Number(lat),
    lng: lng == null ? null : Number(lng),
    website: nullifyBlank(tags.website || tags['contact:website']),
    instagram: nullifyBlank(tags['contact:instagram']),
    phone: nullifyBlank(tags.phone || tags['contact:phone']),
    pet_friendly_note: note,
    source: 'osm',
    source_url: `https://www.openstreetmap.org/${el.type}/${el.id}`,
    confidence,
    status: 'published',
  };
}

// Map a full Overpass JSON response → places rows (unnamed elements dropped).
export function overpassToPlaces(overpassJson) {
  const elements = overpassJson?.elements ?? [];
  return elements.map(overpassElementToPlace).filter(Boolean);
}

// Map ONE curated JSON row → a places row. id is stable (slug of name+neighborhood), so re-loading
// upserts the same row. lat/lng stay null when the JSON has none (the runner geocodes those).
export function curatedRowToPlace(row) {
  return {
    id: `curated-${slugify(row.name, row.neighborhood)}`,
    name: row.name,
    category: row.category,
    neighborhood: nullifyBlank(row.neighborhood),
    city: row.city || 'Buenos Aires',
    address: nullifyBlank(row.address),
    lat: row.lat == null ? null : Number(row.lat),
    lng: row.lng == null ? null : Number(row.lng),
    website: nullifyBlank(row.website),
    instagram: nullifyBlank(row.instagram),
    phone: nullifyBlank(row.phone),
    pet_friendly_note: nullifyBlank(row.pet_friendly_note),
    source: 'curated',
    source_url: Array.isArray(row.source_urls) ? (nullifyBlank(row.source_urls[0]) ?? null) : null,
    confidence: row.confidence ?? null,
    status: 'published',
  };
}

// The ordered column list for an upsert — shared by the runner so INSERT columns and the row keys
// stay in lockstep. deleted_at is intentionally excluded (a re-import must never resurrect a row
// an admin hid/deleted by clobbering deleted_at; ON CONFLICT updates only these columns).
export const PLACE_COLUMNS = [
  'id', 'name', 'category', 'neighborhood', 'city', 'address', 'lat', 'lng',
  'website', 'instagram', 'phone', 'pet_friendly_note', 'source', 'source_url',
  'confidence', 'status',
];

// Geocode a curated row that has no coords, via the FREE OSM Nominatim API. Returns { lat, lng } on
// a hit, or null on miss/error — the caller inserts null coords rather than FABRICATING a location.
// `fetchImpl` is injected so tests mock it (incl. the null-coord path). The runner is responsible
// for Nominatim etiquette (≤1 req/s, descriptive User-Agent) around this call.
export async function geocodePlace({ address, name, city }, fetchImpl = fetch) {
  const q = [address || name, city, 'Argentina'].filter(Boolean).join(', ');
  const params = new URLSearchParams({ format: 'json', q, limit: '1' });
  try {
    const res = await fetchImpl(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { 'User-Agent': 'PawPi/1.0 (places seed loader; contact augusto@pawpi.info)' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const hit = Array.isArray(data) ? data[0] : null;
    if (!hit || hit.lat == null || hit.lon == null) return null;
    const lat = Number(hit.lat);
    const lng = Number(hit.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}
