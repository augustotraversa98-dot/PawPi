#!/usr/bin/env node
// PawPi OSM/Overpass places importer (ticket: places data foundation).
//
// Fetches pet-friendly venues (dog=yes cafes/restaurants/bars/etc. + leisure=dog_park) from the
// FREE OpenStreetMap/Overpass API over a CABA + Zona Norte bounding box, maps each element to a
// places row, and idempotently upserts on the TEXT id (osm-<type>-<id>). Re-running produces NO
// duplicates. Overpass etiquette: ONE query, a descriptive User-Agent, a generous timeout.
//
// Run from anything/apps/web (so `postgres` resolves):
//   node scripts/places/import-osm.mjs
// DB target: PLACES_DATABASE_URL if set, else DATABASE_URL (web/.env). Needs an admin/service
// connection (places is FORCE-RLS, no write policy). NOT run against prod here — Tats runs it.

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadEnv, createSql, upsertPlaces } from './lib.mjs';
import { OVERPASS_ENDPOINT, OVERPASS_QUERY, overpassToPlaces } from './parse.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_DIR = join(__dirname, '..', '..');

async function main() {
  const env = loadEnv(join(WEB_DIR, '.env'));
  const sql = createSql(env);
  try {
    console.log('[import-osm] querying Overpass…');
    const res = await fetch(OVERPASS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'PawPi/1.0 (pet-friendly places importer; contact augusto@pawpi.info)',
      },
      body: new URLSearchParams({ data: OVERPASS_QUERY }),
    });
    if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
    const json = await res.json();
    const rows = overpassToPlaces(json);
    console.log(`[import-osm] ${json.elements?.length ?? 0} elements → ${rows.length} mappable places`);
    const written = await upsertPlaces(sql, rows);
    console.log(`[import-osm] upserted ${written} places (idempotent on id).`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error('[import-osm] failed:', e.message);
  process.exit(1);
});
