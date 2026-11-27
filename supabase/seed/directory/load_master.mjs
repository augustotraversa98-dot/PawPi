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
//   - A re-run refreshes ONLY listings that are still claim_status='unclaimed'. Once a
//     business has claimed its listing (or the claim is pending), the loader writes
//     nothing for it, neither the providers row nor its location: the owner's data is
//     the source of truth from then on, not Google's. No field is exempt.
//   - Google's opening hours are converted to the app's shape (hours.mjs). Hours that
//     cannot be read are stored empty and listed in the output; when Google gives none,
//     a listing keeps the hours it already has (e.g. from enrichment).
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
// Run from the repo root (needs anything/apps/web/node_modules):
//   DIRECTORY_DATABASE_URL=postgres://postgres:...@... \
//     node supabase/seed/directory/load_master.mjs
//
// Env:
//   DIRECTORY_DATABASE_URL — preferred; a BYPASSRLS URL (e.g. Supabase direct-connection).
//   DATABASE_URL           — fallback if DIRECTORY_DATABASE_URL is unset.
//   DIRECTORY_CSV_PATH     — override CSV location (default: this file's sibling).
//   DATABASE_SSL=disable   — turn off SSL (dev/staging only).

import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { cleanWebsite } from "./backfill_website_url.mjs";
import { normalizeGoogleHours } from "./hours.mjs";
import { CSV_PATH, SEED_DIR, loadEnv, readCsv, webRequire } from "./lib.mjs";

const WEB_DIR = join(SEED_DIR, "..", "..", "..", "anything", "apps", "web");

// ── db ───────────────────────────────────────────────────────────────────────
function createSql(connectionString, env) {
  const postgres = webRequire("postgres");
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

/** The CSV's hours_json cell → normalizeGoogleHours' answer, with already-converted hours passed through. */
function listingHours(cell) {
  if (!cell) return { status: "empty", hours: null, problems: [] };
  let raw;
  try {
    raw = JSON.parse(cell);
  } catch {
    return { status: "unreadable", hours: null, problems: [{ day: null, value: cell }] };
  }
  const read = normalizeGoogleHours(raw);
  return read.status === "other" ? { ...read, hours: raw } : read;
}

// ── load ─────────────────────────────────────────────────────────────────────
/**
 * Insert or refresh one listing and its primary location, in one transaction.
 * Returns "inserted", "updated" or "skipped_claimed". The upsert locks an existing
 * row whether or not it updates it, so a claim approved meanwhile waits for this
 * transaction; a listing that is not unclaimed gets no write at all.
 */
async function upsertListing(sql, listing, directoryProfileId) {
  const { providerType, name, externalSource, externalId, slug, website } = listing;
  const { address, lat, lng, phone, hours, petPolicy } = listing;
  return sql.begin(async (tx) => {
    const hoursJson = hours.hours === null ? null : tx.json(hours.hours);
    // Upsert the provider row on the external key. ON CONFLICT preserves the
    // owner and never re-flips claim_status (a claimed row must never revert).
    // website_url is set on INSERT only; existing rows are filled by
    // backfill_website_url.mjs, which re-checks claim_status.
    const [prov] = await tx`
      INSERT INTO providers (
        owner_user_profile_id, provider_type, name, slug, status,
        source, external_source, external_id, claim_status, website_url
      )
      VALUES (
        ${directoryProfileId}, ${providerType}, ${name}, ${slug}, 'published',
        ${externalSource}, ${externalSource}, ${externalId}, 'unclaimed',
        ${website}
      )
      ON CONFLICT (external_source, external_id)
        WHERE external_source IS NOT NULL AND external_id IS NOT NULL
      DO UPDATE SET
        name = EXCLUDED.name,
        provider_type = EXCLUDED.provider_type,
        updated_at = now()
      WHERE providers.claim_status = 'unclaimed'
      RETURNING id, (xmax = 0) AS inserted
    `;
    // No row back: the listing exists and is no longer unclaimed.
    if (!prov) return "skipped_claimed";

    // provider_locations has no external key of its own — we keep exactly one
    // "primary" location per seeded provider by upserting via a lookup + branch.
    const [existingLoc] = await tx`
      SELECT id FROM provider_locations
      WHERE provider_id = ${prov.id}
      ORDER BY id ASC LIMIT 1
    `;
    if (existingLoc) {
      await tx`
        UPDATE provider_locations l SET
          address = ${address},
          lat = ${lat},
          lng = ${lng},
          phone = ${phone},
          hours_json = CASE WHEN ${hours.status === "empty"} THEN l.hours_json ELSE ${hoursJson}::jsonb END,
          pet_policy = ${petPolicy},
          updated_at = now()
        WHERE l.id = ${existingLoc.id}
          AND EXISTS (
            SELECT 1 FROM providers p
            WHERE p.id = l.provider_id AND p.claim_status = 'unclaimed'
          )
      `;
    } else {
      await tx`
        INSERT INTO provider_locations (
          provider_id, name, address, lat, lng, phone, hours_json, pet_policy
        )
        VALUES (
          ${prov.id}, ${name}, ${address}, ${lat}, ${lng},
          ${phone}, ${hoursJson}, ${petPolicy}
        )
      `;
    }
    return prov.inserted ? "inserted" : "updated";
  });
}

/** Load CSV rows (as papaparse reads them) and report what happened to each. */
export async function loadRows(sql, rows) {
  const stats = {
    read: 0,
    skipped_bad_row: 0,
    skipped_bad_type: 0,
    skipped_bad_source: 0,
    inserted: 0,
    updated: 0,
    skipped_claimed: 0,
    errors: 0,
    // Listings written with hours that could not be read: stored empty, for a person to look at.
    unreadable_hours: [],
  };

  // Locate the system directory profile (created by 0124).
  const [dir] = await sql`
    SELECT id FROM user_profiles WHERE username = 'pawpi_directory' LIMIT 1
  `;
  if (!dir) {
    throw new Error(
      "System 'pawpi_directory' profile not found — apply migration 0124 first.",
    );
  }

  for (const row of rows) {
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

    const hours = listingHours(row.hours_json);
    try {
      const outcome = await upsertListing(
        sql,
        {
          providerType,
          name,
          externalSource,
          externalId,
          slug: slugFor(name, externalId, row.area),
          website: cleanWebsite(row.website),
          address: row.address || null,
          lat: parseNumericOrNull(row.lat),
          lng: parseNumericOrNull(row.lng),
          phone: row.phone || null,
          hours,
          petPolicy: row.pet_policy || null,
        },
        dir.id,
      );
      stats[outcome] += 1;
      if (outcome !== "skipped_claimed" && hours.status === "unreadable") {
        stats.unreadable_hours.push({ external_id: externalId, name, problems: hours.problems });
      }
    } catch (err) {
      stats.errors += 1;
      console.error(
        `[loader] ${externalSource}/${externalId} — ${name}: ${err.message}`,
      );
    }
  }
  return stats;
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  // Operators can drop a DIRECTORY_DATABASE_URL into anything/apps/web/.env.
  const env = loadEnv(join(WEB_DIR, ".env"));
  const conn = env.DIRECTORY_DATABASE_URL || env.DATABASE_URL;
  if (!conn) {
    throw new Error(
      "Missing DIRECTORY_DATABASE_URL (or DATABASE_URL). Point at Supabase direct-connection.",
    );
  }
  const rows = readCsv();
  console.log(`[loader] read ${rows.length} rows from ${CSV_PATH}`);

  const sql = createSql(conn, env);
  let stats;
  try {
    stats = await loadRows(sql, rows);
  } finally {
    await sql.end({ timeout: 5 });
  }

  const { unreadable_hours: unreadable, ...counts } = stats;
  console.log("[loader] done", { ...counts, unreadable_hours: unreadable.length });
  for (const listing of unreadable) {
    console.warn(`[loader] hours left empty — ${listing.external_id} ${listing.name}:`, JSON.stringify(listing.problems));
  }
  if (stats.errors > 0) process.exit(2);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error("[loader] fatal", err.message);
    process.exit(1);
  });
}
