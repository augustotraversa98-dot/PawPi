#!/usr/bin/env node
// One-off backfill: load_master.mjs never wrote the CSV's `website` column, so every seeded
// serpapi_gmaps listing has providers.website_url NULL. This sets it from
// pawpi_directory_master.csv, matched on (external_source, external_id).
//
// Only rows that are STILL unclaimed (checked by the UPDATE itself) and have no website_url are
// touched, so it is idempotent and can never overwrite a business's own edit.
//
// Usage (from the repo root; needs anything/apps/web/node_modules):
//   node supabase/seed/directory/backfill_website_url.mjs                 # write (DIRECTORY_DATABASE_URL)
//   node supabase/seed/directory/backfill_website_url.mjs --sql out.sql   # or emit SQL for the SQL editor
//   node supabase/seed/directory/backfill_website_url.mjs --dry-run       # counts from the CSV only
//   --only <external_id,external_id,…>                                    # limit to some listings

import { pathToFileURL } from "node:url";
import { connect, parseArgs, readCsv, runStatement, writeSqlScript } from "./lib.mjs";

export const BACKFILL_SQL = `
with updated as (
  update providers p
     set website_url = i.website, updated_at = now()
    from jsonb_to_recordset($1::text::jsonb) as i(external_id text, website text)
   where p.external_source = 'serpapi_gmaps'
     and p.external_id = i.external_id
     and p.claim_status = 'unclaimed'
     and coalesce(btrim(p.website_url), '') = ''
  returning p.id
)
select (select count(*) from updated)::int as updated
`;

/** A website value we are willing to store: an http(s) URL, kept exactly as scraped. */
export function cleanWebsite(value) {
  const url = String(value ?? "").trim();
  if (url.length > 500 || !/^https?:\/\/[^\s<>"']+$/i.test(url)) return null;
  return url;
}

/** CSV rows → [{ external_id, website }] for the serpapi_gmaps listings that have one. */
export function websitePairs(rows) {
  const byId = new Map();
  for (const row of rows) {
    if (String(row.external_source ?? "").trim() !== "serpapi_gmaps") continue;
    const externalId = String(row.external_id ?? "").trim();
    const website = cleanWebsite(row.website);
    if (externalId && website) byId.set(externalId, website);
  }
  return [...byId].map(([external_id, website]) => ({ external_id, website }));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let pairs = websitePairs(readCsv());
  if (typeof args.only === "string") {
    const only = new Set(args.only.split(",").map((s) => s.trim()));
    pairs = pairs.filter((p) => only.has(p.external_id));
  }
  console.log(`[backfill] ${pairs.length} serpapi_gmaps listings have a website in the CSV`);
  if (args["dry-run"]) return;

  if (typeof args.sql === "string") {
    writeSqlScript(args.sql, BACKFILL_SQL, pairs);
    console.log(`[backfill] wrote ${args.sql} — run it in the Supabase SQL editor`);
    return;
  }

  const sql = await connect();
  try {
    const count = async () =>
      (
        await sql`
          select count(website_url)::int as n from providers
          where external_source = 'serpapi_gmaps'
        `
      )[0].n;
    const before = await count();
    const { updated } = await runStatement(sql, BACKFILL_SQL, pairs);
    const after = await count();
    console.log(`[backfill] done`, { before, updated, after });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error("[backfill] fatal:", err.message);
    process.exit(1);
  });
}
