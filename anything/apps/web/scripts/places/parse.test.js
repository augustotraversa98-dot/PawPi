import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  OVERPASS_QUERY,
  slugify,
  overpassToPlaces,
  overpassElementToPlace,
  curatedRowToPlace,
  geocodePlace,
  osmIdFromUrl,
  dedupeCuratedAgainstOsm,
  PLACE_COLUMNS,
} from './parse.mjs';

// Pure-mapper tests for the places importer + seed loader (no network, no DB). The Overpass parser
// runs against a saved fixture; Nominatim is mocked via an injected fetch.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(path.join(__dirname, 'overpass.fixture.json'), 'utf8'),
);
const curated = JSON.parse(
  readFileSync(path.join(__dirname, '../../data/seed/places_curated.json'), 'utf8'),
);

describe('Overpass query', () => {
  it('is one query over the CABA+Zona Norte bbox, fetching dog=yes venues + dog parks', () => {
    expect(OVERPASS_QUERY).toContain('-34.72,-58.64,-34.38,-58.32');
    expect(OVERPASS_QUERY).toContain('"dog"="yes"');
    expect(OVERPASS_QUERY).toContain('cafe|restaurant|bar|pub|fast_food|bakery|ice_cream');
    expect(OVERPASS_QUERY).toContain('"leisure"="dog_park"');
    expect(OVERPASS_QUERY).toContain('out center tags');
  });
});

describe('overpassToPlaces (fixture)', () => {
  const rows = overpassToPlaces(fixture);

  it('drops the unnamed element (name is NOT NULL) and maps the rest', () => {
    expect(fixture.elements).toHaveLength(5);
    expect(rows).toHaveLength(4); // the un-named pub is skipped
    expect(rows.every((r) => r.name && r.name.length > 0)).toBe(true);
  });

  it('maps a well-tagged node → high confidence, category, id, neighborhood, coords', () => {
    const cafe = rows.find((r) => r.id === 'osm-node-4678791275');
    expect(cafe).toMatchObject({
      id: 'osm-node-4678791275',
      name: 'Espresso Costa',
      category: 'cafe',
      neighborhood: 'San Isidro', // addr:suburb
      city: 'Buenos Aires',
      address: 'Cosme Beccar 216',
      lat: -34.4714357,
      lng: -58.5137323,
      website: 'https://espressocosta.example',
      source: 'osm',
      source_url: 'https://www.openstreetmap.org/node/4678791275',
      confidence: 'high', // has a street address
      status: 'published',
      pet_friendly_note: 'Tagged dog=yes in OpenStreetMap.',
    });
  });

  it('takes way coords from `center` and → medium when no street address', () => {
    const way = rows.find((r) => r.id === 'osm-way-473633239');
    expect(way).toMatchObject({
      name: "Andy's",
      category: 'restaurant',
      neighborhood: 'San Isidro', // addr:city fallback
      lat: -34.4694002,
      lng: -58.5092865,
      address: null,
      confidence: 'medium',
    });
  });

  it('maps leisure=dog_park → park with the dog-park note', () => {
    const park = rows.find((r) => r.id === 'osm-node-11688432238');
    expect(park).toMatchObject({
      category: 'park',
      pet_friendly_note: 'Fenced off-leash dog park (leisure=dog_park) in OpenStreetMap.',
    });
  });

  it('collapses pub→bar and ice_cream→cafe', () => {
    // the pub is unnamed → dropped; verify the collapse directly on the element instead.
    const bar = overpassElementToPlace({
      type: 'node', id: 1, lat: 0, lon: 0,
      tags: { amenity: 'pub', dog: 'yes', name: 'Pub X' },
    });
    expect(bar.category).toBe('bar');
    const icecream = rows.find((r) => r.id === 'osm-node-9990002');
    expect(icecream.category).toBe('cafe');
  });

  it('is idempotent-friendly: re-mapping yields identical stable ids', () => {
    const again = overpassToPlaces(fixture);
    expect(again.map((r) => r.id)).toEqual(rows.map((r) => r.id));
  });
});

describe('curatedRowToPlace (real seed file)', () => {
  it('loads all 14 curated rows', () => {
    expect(curated).toHaveLength(14);
  });

  it('maps a coord-less row with a stable curated id + source_url from source_urls[0]', () => {
    const soffice = curatedRowToPlace(curated[0]);
    expect(soffice).toMatchObject({
      id: 'curated-soffice-pasteleria-san-isidro',
      name: 'Soffice Pastelería',
      category: 'bakery',
      neighborhood: 'San Isidro',
      city: 'Buenos Aires',
      source: 'curated',
      source_url: 'https://www.guiapetfriendly.com/item_detalle.php?id=47',
      confidence: 'high',
      status: 'published',
      lat: null,
      lng: null,
    });
    expect(soffice.website).toBeNull(); // "" → null
  });

  it('preserves real coordinates when present (never fabricated)', () => {
    const oveja = curatedRowToPlace(curated.find((r) => r.name === 'Oveja Negra'));
    expect(oveja.lat).toBe(-34.496972);
    expect(oveja.lng).toBe(-58.5464247);
  });

  it('every mapped row satisfies the DB enums (category/source/status/confidence)', () => {
    const CATS = ['restaurant', 'cafe', 'bakery', 'brewery', 'bar', 'park', 'hotel', 'market', 'shop', 'other'];
    for (const raw of curated) {
      const p = curatedRowToPlace(raw);
      expect(CATS).toContain(p.category);
      expect(p.source).toBe('curated');
      expect(p.status).toBe('published');
      expect(['high', 'medium', null]).toContain(p.confidence);
      expect(Object.keys(p).sort()).toEqual([...PLACE_COLUMNS].sort());
    }
  });

  it('produces stable ids across repeated mapping (idempotent upsert key)', () => {
    const a = curated.map(curatedRowToPlace).map((r) => r.id);
    const b = curated.map(curatedRowToPlace).map((r) => r.id);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(a.length); // no id collisions across the seed
  });
});

describe('osmIdFromUrl', () => {
  it('extracts osm-<type>-<id> from an OSM element URL, else null', () => {
    expect(osmIdFromUrl('https://www.openstreetmap.org/node/123')).toBe('osm-node-123');
    expect(osmIdFromUrl('https://www.openstreetmap.org/way/473633239')).toBe('osm-way-473633239');
    expect(osmIdFromUrl('https://www.guiapetfriendly.com/item_detalle.php?id=47')).toBeNull();
    expect(osmIdFromUrl(null)).toBeNull();
  });

  it('maps the real curated OSM-referencing rows to their expected twin ids', () => {
    const byName = (n) => curatedRowToPlace(curated.find((r) => r.name === n));
    expect(osmIdFromUrl(byName('Oveja Negra').source_url)).toBe('osm-node-1701185132');
    expect(osmIdFromUrl(byName("Andy's").source_url)).toBe('osm-way-473633239');
    expect(osmIdFromUrl(byName('Glück').source_url)).toBe('osm-node-4660373376');
    // Non-OSM curated sources have no twin.
    expect(osmIdFromUrl(byName('Soffice Pastelería').source_url)).toBeNull();
  });
});

describe('dedupeCuratedAgainstOsm', () => {
  it('drops curated rows whose source_url points at an OSM element present in the import; keeps the rest', () => {
    const osmRows = [{ id: 'osm-node-100' }, { id: 'osm-way-200' }];
    const curatedRows = [
      { id: 'curated-a', source_url: 'https://www.openstreetmap.org/node/100' }, // twin present → drop
      { id: 'curated-b', source_url: 'https://www.openstreetmap.org/way/200' }, // twin present → drop
      { id: 'curated-c', source_url: 'https://www.openstreetmap.org/node/999' }, // twin ABSENT → keep
      { id: 'curated-d', source_url: 'https://example.com/x' }, // non-OSM → keep
      { id: 'curated-e', source_url: null }, // no source → keep
    ];
    const { kept, dropped } = dedupeCuratedAgainstOsm(curatedRows, osmRows);
    expect(dropped.map((r) => r.id)).toEqual(['curated-a', 'curated-b']);
    expect(kept.map((r) => r.id)).toEqual(['curated-c', 'curated-d', 'curated-e']);
  });

  it('keeps every curated row when the OSM import is empty', () => {
    const curatedRows = curated.map(curatedRowToPlace);
    const { kept, dropped } = dedupeCuratedAgainstOsm(curatedRows, []);
    expect(dropped).toHaveLength(0);
    expect(kept).toHaveLength(curated.length);
  });

  it('given the real curated twins in the OSM set, keeps exactly the 5 no-twin rows', () => {
    const curatedRows = curated.map(curatedRowToPlace);
    // Simulate an OSM import that contains every OSM element the curated rows reference EXCEPT
    // Glück's (node 4660373376) — matching the live data where Glück has no OSM twin.
    const referencedOsmIds = curatedRows
      .map((r) => osmIdFromUrl(r.source_url))
      .filter((id) => id && id !== 'osm-node-4660373376');
    const osmRows = referencedOsmIds.map((id) => ({ id }));
    const { kept, dropped } = dedupeCuratedAgainstOsm(curatedRows, osmRows);
    expect(dropped).toHaveLength(9);
    expect(kept.map((r) => r.id).sort()).toEqual([
      'curated-gluck-san-isidro',
      'curated-ibis-pilar-pilar',
      'curated-plaza-castiglia-canil-san-isidro',
      'curated-soffice-pasteleria-san-isidro',
      'curated-suss-cupcake-cafe-san-isidro',
    ]);
  });
});

describe('slugify', () => {
  it('folds accents and non-alphanumerics to dashes', () => {
    expect(slugify('Café Bar Don Martín', 'San Isidro')).toBe('cafe-bar-don-martin-san-isidro');
    expect(slugify('Süss Cupcake Cafe', 'San Isidro')).toBe('suss-cupcake-cafe-san-isidro');
  });
});

describe('geocodePlace (Nominatim mocked)', () => {
  const ok = (lat, lon) =>
    vi.fn().mockResolvedValue({ ok: true, json: async () => [{ lat: String(lat), lon: String(lon) }] });

  it('returns { lat, lng } on a hit', async () => {
    const fetchImpl = ok(-34.5, -58.5);
    const res = await geocodePlace({ address: 'Martín y Omar 242', city: 'Buenos Aires' }, fetchImpl);
    expect(res).toEqual({ lat: -34.5, lng: -58.5 });
    // Sends a descriptive User-Agent (Nominatim policy).
    const [, opts] = fetchImpl.mock.calls[0];
    expect(opts.headers['User-Agent']).toMatch(/PawPi/);
  });

  it('returns null when Nominatim has no match (never fabricates a coordinate)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    expect(await geocodePlace({ address: 'Nowhere' }, fetchImpl)).toBeNull();
  });

  it('returns null on a non-OK response or a thrown fetch', async () => {
    expect(await geocodePlace({ address: 'X' }, vi.fn().mockResolvedValue({ ok: false }))).toBeNull();
    expect(await geocodePlace({ address: 'X' }, vi.fn().mockRejectedValue(new Error('net')))).toBeNull();
  });
});
