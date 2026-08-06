// scripts/places/lib.mjs — node-only side effects for the places importer + seed loader (env, DB,
// the ON CONFLICT upsert). Kept out of parse.mjs so parse.mjs stays pure + unit-testable. Imported
// only by the runners (import-osm.mjs / seed-curated.mjs), run with `node` from anything/apps/web so
// `postgres` resolves from web/node_modules. Mirrors scripts/demo-seed/lib.mjs.

import { readFileSync, existsSync } from 'node:fs';
import postgres from 'postgres';

// Minimal .env parser (no dotenv dep). Real process.env wins, so an operator can override
// DATABASE_URL on the command line. Same shape as demo-seed's loadEnv.
export function loadEnv(envPath) {
  const fromFile = {};
  if (existsSync(envPath)) {
    for (const rawLine of readFileSync(envPath, 'utf8').split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      fromFile[key] = val;
    }
  }
  return { ...fromFile, ...process.env };
}

// Open a postgres client against the catalog DB. Writes need an admin/service connection (the
// places table is FORCE-RLS with no write policy) — the same DATABASE_URL used to apply migrations.
export function createSql(env) {
  const url = env.PLACES_DATABASE_URL || env.DATABASE_URL;
  if (!url) throw new Error('No DATABASE_URL (or PLACES_DATABASE_URL) — set it in web/.env.');
  return postgres(url, { max: 1, idle_timeout: 5, onnotice: () => {} });
}

// Idempotent bulk upsert on the TEXT primary key. Re-running clobbers only the catalog columns and
// bumps updated_at; deleted_at is never touched, so a row an admin hid/deleted is not resurrected.
// Returns the number of rows written.
export async function upsertPlaces(sql, rows) {
  if (!rows.length) return 0;
  const written = await sql`
    insert into places ${sql(
      rows,
      'id', 'name', 'category', 'neighborhood', 'city', 'address', 'lat', 'lng',
      'website', 'instagram', 'phone', 'pet_friendly_note', 'source', 'source_url',
      'confidence', 'status',
    )}
    on conflict (id) do update set
      name = excluded.name,
      category = excluded.category,
      neighborhood = excluded.neighborhood,
      city = excluded.city,
      address = excluded.address,
      lat = excluded.lat,
      lng = excluded.lng,
      website = excluded.website,
      instagram = excluded.instagram,
      phone = excluded.phone,
      pet_friendly_note = excluded.pet_friendly_note,
      source = excluded.source,
      source_url = excluded.source_url,
      confidence = excluded.confidence,
      status = excluded.status,
      updated_at = now()
    returning id
  `;
  return written.length;
}

// Nominatim etiquette: ≤1 request/second. Small awaitable sleep for the geocode loop.
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
