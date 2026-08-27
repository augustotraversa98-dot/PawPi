#!/usr/bin/env node
// PawPi directory loader — takes the real, deduped CABA+AMBA CSV
// (supabase/seed/directory/pawpi_directory_master.csv, 3,627 rows: providers +
// pet_friendly places) and upserts each row into `providers` + `provider_locations`.
//
// House model (see 0124_provider_claimable.sql):
//   - Every seeded row is owned by the SYSTEM "PawPi Directory" user_profile so
//     `providers.owner_user_profile_id` stays NOT NULL and 0024 RLS keeps its shape.
//   - Every seeded row is `status='published'` + `claim_status='unclaimed'` so the
//     app publicly discovers it and can render the "¿Es tu negocio?" claim CTA.
//   - Dedup / re-sync key is (external_source, external_id) — a partial UNIQUE
//     index from 0124. Re-running this loader is a no-op on unchanged rows.
//
// Provider-type mapping (drop the CSV `provider_type` value in verbatim):
//   'vet' | 'shop' | 'groomer' | 'pet_friendly'.
//
// ⚠️ RUN AS A BYPASSRLS ROLE — this loader does NOT stamp `app.current_user_id`
// (unlike scripts/demo-seed). The system directory user has NO provider_staff row,
// so `app_is_provider_admin(provider_id)` returns false for it and RLS would
// forbid provider_locations INSERTs under `pawpi_app`. Point DIRECTORY_DATABASE_URL
// (or DATABASE_URL) at Supabase's direct-connection `postgres` superuser URL, NOT
// at the pgbouncer `pawpi_app` pooler URL.
//
// Run from anything/apps/web (so `postgres` resolves from web/node_modules):
//   DIRECTORY_DATABASE_URL=postgres://postgres:...@... \
//     node ../../../supabase/seed/directory/load_master.mjs
//
// Env:
//   DIRECTORY_DATABASE_URL — preferred; a BYPASSRLS URL (e.g. Supabase direct-connection).
//   DATABASE_URL           — fallback if DIRECTORY_DATABASE_URL is unset.
//   DIRECTORY_CSV_PATH     — override CSV location (default: this file's sibling).
//   DATABASE_SSL=disable   — turn off SSL (dev/staging only).

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import Papa from "papaparse";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── env ──────────────────────────────────────────────────────────────────────
// Minimal .env parser — mirrors scripts/demo-seed/lib.mjs so operators can drop a
// DIRECTORY_DATABASE_URL into anything/apps/web/.env and this just picks it up.
function loadEnv(envPath) {
  const fromFile = {};
  if (existsSync(envPath)) {
    for (const rawLine of readFileSync(envPath, "utf8").split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      fromFile[key] = val;
    }
  }
  return { ...fromFile, ...process.env };
}

const WEB_DIR = join(__dirname, "..", "..", "..", "anything", "apps", "web");
const env = loadEnv(join(WEB_DIR, ".env"));
const CONN = env.DIRECTORY_DATABASE_URL || env.DATABASE_URL;
if (!CONN) {
  console.error(
    "Missing DIRECTORY_DATABASE_URL (or DATABASE_URL). Point at Supabase direct-connection.",
  );
  process.exit(1);
}
const CSV_PATH =
  env.DIRECTORY_CSV_PATH || join(__dirname, "pawpi_directory_master.csv");

// ── db ───────────────────────────────────────────────────────────────────────
function createSql(connectionString) {
  const u = new URL(connectionString);
  return postgres({
    host: u.hostname,
    port: u.port ? Number(u.port) : 5432,
    database: u.pathname.replace(/^\//, "") || "postgres",
    username: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    prepare: false,
    ssl: env.DATABASE_SSL === "disable" ? false : "require",
    max: 4,
    onnotice: () => {},
  });
}

// ── helpers ──────────────────────────────────────────────────────────────────
const ALLOWED_TYPES = new Set(["vet", "shop", "groomer", "pet_friendly"]);
const ALLOWED_SOURCES = new Set(["osm", "serpapi_gmaps", "manual", "import"]);

function slugify(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

// A CSV row can share a name with another row (Vetefarma, Kanguro Pet Shop, etc.), so
// slug uniqueness is guaranteed by suffixing the external_id when needed. External_ids
// are stable (osm-node-123 / SerpAPI place_ids), so re-runs converge on the same slug.
function slugFor(name, externalId, area) {
  const base = slugify(name) || "listing";
  const areaSuffix = area ? `-${slugify(area).slice(0, 20)}` : "";
  const idSuffix = externalId ? `-${slugify(externalId).slice(0, 12)}` : "";
  return `${base}${areaSuffix}${idSuffix}`.slice(0, 120);
}

function parseNumericOrNull(v) {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseHoursJson(v) {
  if (!v) return null;
  try {
    const parsed = typeof v === "string" ? JSON.parse(v) : v;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  const sql = createSql(CONN);
  const stats = {
    read: 0,
    skipped_bad_row: 0,
    skipped_bad_type: 0,
    skipped_bad_source: 0,
    inserted: 0,
    updated: 0,
    locations_upserted: 0,
    errors: 0,
  };

  try {
    // Locate the system directory profile (created by 0124).
    const [dir] = await sql`
      SELECT id FROM user_profiles WHERE username = 'pawpi_directory' LIMIT 1
    `;
    if (!dir) {
      throw new Error(
        "System 'pawpi_directory' profile not found — apply migration 0124 first.",
      );
    }
    const directoryProfileId = dir.id;
    console.log(`[loader] directory profile id=${directoryProfileId}`);

    const csvText = readFileSync(CSV_PATH, "utf8");
    const { data, errors: parseErrors } = Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
    });
    if (parseErrors.length) {
      console.warn(`[loader] papaparse: ${parseErrors.length} parse warnings`);
    }
    console.log(`[loader] read ${data.length} rows from ${CSV_PATH}`);

    for (const row of data) {
      stats.read += 1;

      const providerType = String(row.provider_type || "").trim();
      const externalSource = String(row.external_source || "").trim();
      const externalId = String(row.external_id || "").trim();
      const name = String(row.name || "").trim();

      if (!name || !externalSource || !externalId) {
        stats.skipped_bad_row += 1;
        continue;
      }
      if (!ALLOWED_TYPES.has(providerType)) {
        stats.skipped_bad_type += 1;
        continue;
      }
      if (!ALLOWED_SOURCES.has(externalSource)) {
        stats.skipped_bad_source += 1;
        continue;
      }

      const slug = slugFor(name, externalId, row.area);
      const source = externalSource; // 'osm' | 'serpapi_gmaps'

      try {
        // Upsert the provider row on the external key. ON CONFLICT preserves the
        // owner and never re-flips claim_status (a claimed row must never revert).
        const [prov] = await sql`
          INSERT INTO providers (
            owner_user_profile_id, provider_type, name, slug, status,
            source, external_source, external_id, claim_status
          )
          VALUES (
            ${directoryProfileId}, ${providerType}, ${name}, ${slug}, 'published',
            ${source}, ${externalSource}, ${externalId}, 'unclaimed'
          )
          ON CONFLICT (external_source, external_id)
            WHERE external_source IS NOT NULL AND external_id IS NOT NULL
          DO UPDATE SET
            name = EXCLUDED.name,
            provider_type = EXCLUDED.provider_type,
            updated_at = now()
          RETURNING id, (xmax = 0) AS inserted
        `;
        if (prov.inserted) stats.inserted += 1;
        else stats.updated += 1;

        // provider_locations has no external key of its own — we keep exactly one
        // "primary" location per seeded provider by upserting via a lookup + branch.
        const lat = parseNumericOrNull(row.lat);
        const lng = parseNumericOrNull(row.lng);
        const address = row.address || null;
        const phone = row.phone || null;
        const hoursJson = parseHoursJson(row.hours_json);
        const petPolicy = row.pet_policy || null;

        const [existingLoc] = await sql`
          SELECT id FROM provider_locations
          WHERE provider_id = ${prov.id}
          ORDER BY id ASC LIMIT 1
        `;
        if (existingLoc) {
          await sql`
            UPDATE provider_locations SET
              address = ${address},
              lat = ${lat},
              lng = ${lng},
              phone = ${phone},
              hours_json = ${hoursJson},
              pet_policy = ${petPolicy},
              updated_at = now()
            WHERE id = ${existingLoc.id}
          `;
        } else {
          await sql`
            INSERT INTO provider_locations (
              provider_id, name, address, lat, lng, phone, hours_json, pet_policy
            )
            VALUES (
              ${prov.id}, ${name}, ${address}, ${lat}, ${lng},
              ${phone}, ${hoursJson}, ${petPolicy}
            )
          `;
        }
        stats.locations_upserted += 1;
      } catch (err) {
        stats.errors += 1;
        console.error(
          `[loader] ${externalSource}/${externalId} — ${name}: ${err.message}`,
        );
      }
    }
  } finally {
    await sql.end({ timeout: 5 });
  }

  console.log("[loader] done", stats);
  if (stats.errors > 0) process.exit(2);
}

main().catch((err) => {
  console.error("[loader] fatal", err);
  process.exit(1);
});
