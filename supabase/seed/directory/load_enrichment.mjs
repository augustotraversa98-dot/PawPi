#!/usr/bin/env node
// Loads the REVIEWED output of tinyfish_enrich.py into the unclaimed directory listings.
//
// What it writes, and only for a listing that is still claim_status='unclaimed' at write time (the
// statement itself locks and re-checks the row):
//   • providers.bio                 only when empty
//   • provider_services             source='auto_enriched'; a service whose normalised name already
//                                   exists for that provider is skipped, so reruns add nothing
//   • provider_locations.hours_json only when we have NO hours at all (Google's hours win otherwise)
// It never writes logo_url or any image_urls column: photos are left for the business that claims.
// Text is written only if the pull found it, word for word, on the business's own site (the *_on_site
// marks from tinyfish_enrich.py); no price unless that on-site price text says exactly that peso amount.
//
// Usage (from the repo root; needs anything/apps/web/node_modules):
//   node supabase/seed/directory/load_enrichment.mjs --export-universe    # eligible rows → enrich_universe.json
//   node supabase/seed/directory/load_enrichment.mjs --dry-run            # show what would be written
//   node supabase/seed/directory/load_enrichment.mjs                      # write (DIRECTORY_DATABASE_URL)
//   node supabase/seed/directory/load_enrichment.mjs --sql out.sql        # or emit SQL for the SQL editor
//   --in <results.json>   (default: tinyfish_results.json in OUT_DIR, else this folder)
//   --only <external_id,external_id,…>

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { SEED_DIR, connect, parseArgs, runStatement, writeSqlScript } from "./lib.mjs";

export const UNIVERSE_SQL = `
select id, external_id, claim_status, website_url
from providers
where provider_type = 'vet' and source = 'serpapi_gmaps' and claim_status = 'unclaimed'
  and website_url is not null
order by id
`;

// Same normalisation as nameKey() below: accents folded, case and punctuation ignored. Plain
// replace() rather than normalize()/translate(), so it behaves the same whatever the server encoding
// (the test database is not UTF8). Decomposed accents are dropped by the final character class.
const FOLD = { a: "áàäâãåÁÀÄÂÃÅ", e: "éèëêÉÈËÊ", i: "íìïîÍÌÏÎ", o: "óòöôõÓÒÖÔÕ", u: "úùüûÚÙÜÛ", n: "ñÑ", c: "çÇ" };
const keySql = (column) => {
  const folded = Object.entries(FOLD).reduce(
    (expr, [plain, accented]) =>
      [...accented].reduce((inner, ch) => `replace(${inner}, '${ch}', '${plain}')`, expr),
    column,
  );
  return `regexp_replace(lower(${folded}), '[^a-z0-9]+', '', 'g')`;
};

export const ENRICH_SQL = `
with input as (
  select * from jsonb_to_recordset($1::text::jsonb)
    as i(external_id text, bio text, services jsonb, hours jsonb)
),
target as materialized (
  select p.id, i.bio, i.services, i.hours
    from providers p
    join input i on i.external_id = p.external_id
   where p.external_source = 'serpapi_gmaps'
     and p.provider_type = 'vet'
     and p.claim_status = 'unclaimed'
     for update of p
),
bio_written as (
  update providers p
     set bio = t.bio, updated_at = now()
    from target t
   where p.id = t.id
     and p.claim_status = 'unclaimed'
     and t.bio is not null
     and coalesce(btrim(p.bio), '') = ''
  returning p.id
),
incoming as (
  select distinct on (t.id, k.key)
         t.id as provider_id, e.item->>'name' as name, e.item->>'description' as description,
         (e.item->>'price_cents')::integer as price_cents, k.key, e.ord
    from target t
   cross join lateral jsonb_array_elements(coalesce(t.services, '[]'::jsonb)) with ordinality as e(item, ord)
   cross join lateral (select ${keySql("e.item->>'name'")} as key) k
   where k.key <> ''
   order by t.id, k.key, e.ord
),
services_written as (
  insert into provider_services (provider_id, name, description, price_cents, source)
  select n.provider_id, n.name, n.description, n.price_cents, 'auto_enriched'
    from incoming n
   where not exists (
     select 1 from provider_services s
      where s.provider_id = n.provider_id and ${keySql("s.name")} = n.key
   )
   order by n.provider_id, n.ord
  returning price_cents
),
hours_written as (
  update provider_locations l
     set hours_json = t.hours, updated_at = now()
    from target t
   where l.id = (select min(m.id) from provider_locations m where m.provider_id = t.id)
     and jsonb_typeof(t.hours) = 'object'
     and (l.hours_json is null or l.hours_json = '{}'::jsonb)
  returning l.id
)
select (select count(*) from input)::int as input_providers,
       (select count(*) from target)::int as still_unclaimed,
       (select count(*) from bio_written)::int as bios_written,
       (select count(*) from services_written)::int as services_inserted,
       (select count(price_cents) from services_written)::int as services_with_price,
       (select count(*) from hours_written)::int as hours_written
`;

// ── validation (pure) ────────────────────────────────────────────────────────
const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const MAX_PRICE_ARS = 20_000_000; // price_cents is int4
const MAX_SERVICES = 40;

const collapse = (v) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");

export function nameKey(name) {
  return String(name ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function text(value, min, max) {
  const s = collapse(value);
  if (s.length < min || s.length > max) return null;
  if (/^(null|none|n\/a)$/i.test(s)) return null;
  return s;
}

/**
 * Integer cents, or null. A number is accepted ONLY when the quoted price text is a single fixed
 * peso amount equal to it: no "desde"/ranges, no other currency, no second number.
 */
export function priceCents(priceArs, priceText) {
  if (typeof priceArs !== "number" || !Number.isFinite(priceArs)) return null;
  if (priceArs <= 0 || priceArs > MAX_PRICE_ARS) return null;
  const quoted = collapse(priceText).toLowerCase();
  if (!quoted) return null;
  if (/desde|a partir|from|hasta|aprox|entre|u\$|us\$|usd|d[oó]lar|€|eur/.test(quoted)) return null;
  if (!/\$|\bars\b|\bpesos?\b/.test(quoted)) return null;
  // Argentine notation: "." groups thousands, "," marks decimals.
  const numbers = quoted.match(/\d[\d.,]*/g)?.map((n) => n.replace(/[.,]+$/, ""));
  if (!numbers || numbers.length !== 1) return null;
  if (!/^(\d{1,3}(\.\d{3})+|\d+)(,\d{1,2})?$/.test(numbers[0])) return null;
  const quotedValue = Number(numbers[0].replace(/\./g, "").replace(",", "."));
  if (Math.abs(quotedValue - priceArs) > 0.005) return null;
  return Math.round(priceArs * 100);
}

const siteHost = (url) => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
};

/** Site hours → the app's hours_json shape ({ mon: {open, close} | [..] | "closed" }), or null. */
export function cleanHours(hours) {
  if (!hours || typeof hours !== "object" || Array.isArray(hours)) return null;
  const time = /^([01]?\d|2[0-3]):[0-5]\d$/;
  const out = {};
  let openDays = 0;
  for (const day of DAYS) {
    const value = hours[day];
    if (value === "closed") {
      out[day] = "closed";
      continue;
    }
    if (value == null) continue;
    const list = Array.isArray(value) ? value : [value];
    const ok = list.every(
      (r) => r && time.test(r.open ?? "") && time.test(r.close ?? "") && r.open !== r.close,
    );
    if (!ok || list.length === 0) return null; // half-read hours are worse than none
    const ranges = list.map((r) => ({ open: r.open.padStart(5, "0"), close: r.close.padStart(5, "0") }));
    out[day] = ranges.length === 1 ? ranges[0] : ranges;
    openDays += 1;
  }
  return openDays > 0 ? out : null;
}

/** One result record → the row we are willing to write, or null. Unknown fields are never copied. */
export function normalizeRecord(record) {
  if (record?.outcome !== "success" || !record.data || !record.external_id) return null;
  const host = siteHost(record.website_url);
  const seen = new Set();
  const services = [];
  for (const s of record.data.services ?? []) {
    if (s?.name_on_site !== true) continue;
    const name = text(s.name, 2, 100);
    const key = nameKey(name);
    if (!name || !key || seen.has(key)) continue;
    // A service read on some other website is not evidence about this business.
    const readOn = s.source_url ? siteHost(s.source_url) : null;
    if (readOn && host && readOn !== host && !readOn.endsWith(`.${host}`)) continue;
    seen.add(key);
    services.push({
      name,
      description: s.description_on_site === true ? text(s.description, 3, 500) : null,
      price_cents:
        readOn && s.price_text_on_site === true ? priceCents(s.price_ars, s.price_text) : null,
    });
    if (services.length === MAX_SERVICES) break;
  }
  const row = {
    external_id: record.external_id,
    bio: record.data.bio_on_site === true ? text(record.data.bio, 20, 1000) : null,
    services,
    hours: cleanHours(record.data.hours),
  };
  return row.bio || row.services.length || row.hours ? row : null;
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outDir = process.env.OUT_DIR || SEED_DIR;

  if (args["export-universe"]) {
    const sql = await connect();
    try {
      const rows = await sql.unsafe(UNIVERSE_SQL);
      const path = join(outDir, "enrich_universe.json");
      writeFileSync(path, JSON.stringify([...rows], null, 2));
      console.log(`[enrichment] ${rows.length} eligible vets → ${path}`);
    } finally {
      await sql.end({ timeout: 5 });
    }
    return;
  }

  const input = typeof args.in === "string" ? args.in : join(outDir, "tinyfish_results.json");
  let records = JSON.parse(readFileSync(input, "utf8"));
  if (typeof args.only === "string") {
    const only = new Set(args.only.split(",").map((s) => s.trim()));
    records = records.filter((r) => only.has(r.external_id));
  }
  const rows = records.map(normalizeRecord).filter(Boolean);
  const services = rows.flatMap((r) => r.services);
  console.log("[enrichment] from the results file:", {
    results: records.length,
    loadable: rows.length,
    bios: rows.filter((r) => r.bio).length,
    services: services.length,
    services_with_price: services.filter((s) => s.price_cents !== null).length,
    with_site_hours: rows.filter((r) => r.hours).length,
  });

  if (args["dry-run"]) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }
  if (rows.length === 0) return;
  if (typeof args.sql === "string") {
    writeSqlScript(args.sql, ENRICH_SQL, rows);
    console.log(`[enrichment] wrote ${args.sql} — run it in the Supabase SQL editor`);
    return;
  }
  const sql = await connect();
  try {
    console.log("[enrichment] done", await runStatement(sql, ENRICH_SQL, rows));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error("[enrichment] fatal:", err.message);
    process.exit(1);
  });
}
