#!/usr/bin/env node
// PawPi curated pet-friendly places seed loader (ticket: places data foundation).
//
// Loads data/seed/places_curated.json into the places catalog, idempotently upserting on the TEXT
// id (curated-<slug>). Rows missing lat/lng are geocoded via the FREE OSM Nominatim API (≤1 req/s,
// descriptive User-Agent). On a geocode MISS the row is inserted with NULL coords — a coordinate is
// NEVER fabricated. Re-running produces NO duplicates.
//
// Run from anything/apps/web:
//   node scripts/places/seed-curated.mjs
// DB target: PLACES_DATABASE_URL if set, else DATABASE_URL (web/.env). Needs an admin/service
// connection (places is FORCE-RLS, no write policy). NOT run against prod here — Tats runs it.

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import { loadEnv, createSql, upsertPlaces, sleep } from './lib.mjs';
import { curatedRowToPlace, geocodePlace } from './parse.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_DIR = join(__dirname, '..', '..');
const SEED_FILE = join(WEB_DIR, 'data', 'seed', 'places_curated.json');

async function main() {
  const env = loadEnv(join(WEB_DIR, '.env'));
  const sql = createSql(env);
  try {
    const raw = JSON.parse(readFileSync(SEED_FILE, 'utf8'));
    const rows = raw.map(curatedRowToPlace);

    // Geocode the coord-less rows, one per second (Nominatim policy). A miss keeps null coords.
    let geocoded = 0;
    let missed = 0;
    for (const row of rows) {
      if (row.lat != null && row.lng != null) continue;
      const hit = await geocodePlace(row);
      if (hit) {
        row.lat = hit.lat;
        row.lng = hit.lng;
        geocoded += 1;
      } else {
        missed += 1;
        console.warn(`[seed-curated] no geocode for "${row.name}" — inserting with null coords.`);
      }
      await sleep(1100);
    }

    const written = await upsertPlaces(sql, rows);
    console.log(
      `[seed-curated] upserted ${written} places (geocoded ${geocoded}, ${missed} left null-coord).`,
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error('[seed-curated] failed:', e.message);
  process.exit(1);
});
