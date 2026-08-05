#!/usr/bin/env node
// Generate supabase/seed/places_seed.sql — a ready-to-paste DATA SEED for the places catalog.
//
// WHY a .sql file (not the importer runner): places is FORCE-RLS with no write policy, so the app's
// pawpi_app connection can't write it. Tats pastes this file into the Supabase SQL editor, which
// runs as `postgres` and bypasses FORCE-RLS — exactly like hand-applying a migration. It lives in
// supabase/seed/ (NOT migrations/) so the integration harness never auto-applies it.
//
// This script does the READ-ONLY external work — one Overpass query (CABA + Zona Norte, dog=yes
// venues + dog parks) and Nominatim geocoding for coord-less curated rows (≤1 req/s, descriptive
// User-Agent, NULL on miss — never fabricated) — then writes idempotent
// INSERT … ON CONFLICT (id) DO UPDATE upserts. It does NOT touch any database.
//
// Run from anything/apps/web:  node scripts/places/generate-seed-sql.mjs

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import {
  OVERPASS_ENDPOINT, OVERPASS_QUERY, overpassToPlaces,
  curatedRowToPlace, geocodePlace, PLACE_COLUMNS,
} from './parse.mjs';
import { sleep } from './lib.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_DIR = join(__dirname, '..', '..');
const REPO_ROOT = join(WEB_DIR, '..', '..', '..');
const SEED_JSON = join(WEB_DIR, 'data', 'seed', 'places_curated.json');
const OUT_DIR = join(REPO_ROOT, 'supabase', 'seed');
const OUT_FILE = join(OUT_DIR, 'places_seed.sql');

// ── SQL literal helpers ───────────────────────────────────────────────────────
const sqlStr = (v) => (v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
const sqlNum = (v) => {
  if (v == null) return 'NULL';
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : 'NULL';
};
// column name → how to render that place[col] as a SQL literal
const NUMERIC = new Set(['lat', 'lng']);
const literalFor = (col, val) => (NUMERIC.has(col) ? sqlNum(val) : sqlStr(val));

// One idempotent upsert statement for a place row.
function upsertStatement(place) {
  const cols = PLACE_COLUMNS; // id,name,category,neighborhood,city,address,lat,lng,website,instagram,phone,pet_friendly_note,source,source_url,confidence,status
  const values = cols.map((c) => literalFor(c, place[c])).join(', ');
  const setClause = cols
    .filter((c) => c !== 'id')
    .map((c) => `${c} = EXCLUDED.${c}`)
    .join(',\n    ');
  return (
    `INSERT INTO places (${cols.join(', ')})\n` +
    `  VALUES (${values})\n` +
    `  ON CONFLICT (id) DO UPDATE SET\n    ${setClause},\n    updated_at = now();`
  );
}

async function fetchOverpass() {
  const res = await fetch(OVERPASS_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'PawPi/1.0 (pet-friendly places importer; contact augusto@pawpi.info)',
    },
    body: new URLSearchParams({ data: OVERPASS_QUERY }),
  });
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
  return res.json();
}

async function main() {
  // 1. OSM
  console.log('[gen] querying Overpass…');
  const overpassJson = await fetchOverpass();
  const osmRows = overpassToPlaces(overpassJson);
  const osmElements = overpassJson.elements?.length ?? 0;
  console.log(`[gen] Overpass: ${osmElements} elements → ${osmRows.length} mappable OSM places`);

  // 2. Curated + geocode
  const curatedRaw = JSON.parse(readFileSync(SEED_JSON, 'utf8'));
  const curatedRows = curatedRaw.map(curatedRowToPlace);
  let geocoded = 0;
  const nullCoord = [];
  for (const row of curatedRows) {
    if (row.lat != null && row.lng != null) continue;
    const hit = await geocodePlace(row);
    if (hit) {
      row.lat = hit.lat;
      row.lng = hit.lng;
      geocoded += 1;
      console.log(`[gen] geocoded "${row.name}" → ${hit.lat},${hit.lng}`);
    } else {
      console.warn(`[gen] NO geocode for "${row.name}" — NULL coords (not fabricated)`);
    }
    await sleep(1100); // Nominatim ≤1 req/s
  }

  const all = [...osmRows, ...curatedRows];
  for (const p of all) if (p.lat == null || p.lng == null) nullCoord.push(p);

  // 3. Emit SQL
  const header =
    `-- supabase/seed/places_seed.sql — PawPi pet-friendly places DATA SEED (generated).\n` +
    `--\n` +
    `-- DATA seed, NOT a schema migration: it lives in supabase/seed/ so the integration harness\n` +
    `-- (which globs supabase/migrations/) never auto-applies it. Paste it into the Supabase SQL\n` +
    `-- editor — it runs as \`postgres\`, which bypasses the FORCE row-level security on \`places\`\n` +
    `-- (the table has a public-read policy and NO write policy, so only an admin/service role can\n` +
    `-- populate it — same reason a migration is hand-applied).\n` +
    `--\n` +
    `-- IDEMPOTENT + re-runnable: every row is an INSERT … ON CONFLICT (id) DO UPDATE, keyed on the\n` +
    `-- stable text id (osm-<type>-<id> / curated-<slug>). Re-running refreshes fields + updated_at;\n` +
    `-- it never duplicates and never resurrects a hidden/deleted row's deleted_at. Wrapped in a\n` +
    `-- transaction so it is all-or-nothing.\n` +
    `--\n` +
    `-- Sources: OpenStreetMap/Overpass (dog=yes venues + leisure=dog_park over CABA + Zona Norte)\n` +
    `-- and data/seed/places_curated.json (coord-less rows geocoded via OSM Nominatim; misses left\n` +
    `-- NULL — never fabricated). Regenerate with: node scripts/places/generate-seed-sql.mjs\n` +
    `--\n` +
    `-- Rows: ${all.length} total (${osmRows.length} osm, ${curatedRows.length} curated).\n\n` +
    `BEGIN;\n\n`;

  const body = all.map(upsertStatement).join('\n\n') + '\n';
  const footer = `\nCOMMIT;\n`;

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_FILE, header + body + footer, 'utf8');

  // Report data (printed for the human summary).
  const groupBy = (rows, key) =>
    rows.reduce((m, r) => ((m[r[key] ?? 'null'] = (m[r[key] ?? 'null'] ?? 0) + 1), m), {});
  const withCoords = all.filter((r) => r.lat != null && r.lng != null).length;
  console.log('\n===== REPORT =====');
  console.log('file:', OUT_FILE);
  console.log('total rows:', all.length);
  console.log('by source:', JSON.stringify(groupBy(all, 'source')));
  console.log('by category:', JSON.stringify(groupBy(all, 'category')));
  console.log('by neighborhood:', JSON.stringify(groupBy(all, 'neighborhood')));
  console.log(`coords: ${withCoords} with, ${all.length - withCoords} NULL`);
  console.log('geocoded this run:', geocoded);
  console.log('NULL-coord rows:', JSON.stringify(nullCoord.map((r) => ({ id: r.id, name: r.name, source: r.source }))));
}

main().catch((e) => {
  console.error('[gen] FAILED:', e.message);
  process.exit(1);
});
