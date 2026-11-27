#!/usr/bin/env node
// One-off conversion of the directory hours already stored in Google's format (load_master.mjs used to write them
// as serpapi_pull.py scraped them) into the app's shape (hours.mjs).
//
// A location is rewritten only if its listing is STILL unclaimed (checked by the UPDATE itself) and its hours are
// still exactly the ones that were converted, so a claimed business's hours are never touched and a second run
// changes nothing. Hours that cannot be read are emptied and listed for a person to look at.
//
// Usage (from the repo root; needs anything/apps/web/node_modules):
//   node supabase/seed/directory/normalize_hours.mjs --dry-run       # counts and the unreadable list, no write
//   node supabase/seed/directory/normalize_hours.mjs                 # write (DIRECTORY_DATABASE_URL)
//   node supabase/seed/directory/normalize_hours.mjs --sql out.sql   # or emit SQL for the SQL editor
//   --only <external_id,external_id,…>                               # limit to some listings
// The rows to convert are read from the database when DIRECTORY_DATABASE_URL is set; otherwise (and always for
// --sql) from the CSV, whose hours are what the loader stored.

import { pathToFileURL } from "node:url";
import { connect, loadEnv, parseArgs, readCsv, runStatement, writeSqlScript } from "./lib.mjs";
import { normalizeGoogleHours } from "./hours.mjs";

export const NORMALIZE_SQL = `
with input as (
  select * from jsonb_to_recordset($1::text::jsonb) as i(external_id text, before jsonb, after jsonb)
),
target as materialized (
  select l.id, i.after
    from providers p
    join input i on i.external_id = p.external_id
    join provider_locations l on l.provider_id = p.id and l.hours_json = i.before
   where p.external_source = 'serpapi_gmaps'
     and p.claim_status = 'unclaimed'
     for update of p
),
written as (
  update provider_locations l
     set hours_json = t.after, updated_at = now()
    from target t, providers p
   where l.id = t.id
     and p.id = l.provider_id
     and p.claim_status = 'unclaimed'
  returning l.hours_json
)
select (select count(*) from input)::int as input_rows,
       (select count(*) from written)::int as updated,
       (select count(*) from written where hours_json is null)::int as emptied
`;

/**
 * [{ external_id, name, hours }] → what to write ({ external_id, before, after }) and which could not be read.
 * Hours that are empty or already in the app's shape are left out.
 */
export function planConversion(listings) {
  const changes = [];
  const unreadable = [];
  for (const { external_id, name, hours } of listings) {
    const read = normalizeGoogleHours(hours);
    if (read.status !== "converted" && read.status !== "unreadable") continue;
    changes.push({ external_id, before: hours, after: read.hours });
    if (read.status === "unreadable") unreadable.push({ external_id, name, problems: read.problems });
  }
  return { changes, unreadable };
}

/** The CSV's Google listings with their stored hours. */
export function csvListings(rows) {
  const out = [];
  for (const row of rows) {
    if (String(row.external_source ?? "").trim() !== "serpapi_gmaps" || !row.hours_json) continue;
    let hours;
    try {
      hours = JSON.parse(row.hours_json);
    } catch {
      continue;
    }
    out.push({ external_id: String(row.external_id).trim(), name: row.name, hours });
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const toFile = typeof args.sql === "string";
  const fromDb = !toFile && Boolean(loadEnv().DIRECTORY_DATABASE_URL);
  if (!toFile && !fromDb && !args["dry-run"]) {
    throw new Error("Set DIRECTORY_DATABASE_URL to write, or use --sql <file> or --dry-run.");
  }
  const sql = fromDb ? await connect() : null;
  try {
    let listings = sql
      ? await sql`
          select p.external_id, p.name, l.hours_json as hours
            from provider_locations l join providers p on p.id = l.provider_id
           where p.external_source = 'serpapi_gmaps' and p.claim_status = 'unclaimed'
             and l.hours_json is not null`
      : csvListings(readCsv());
    if (typeof args.only === "string") {
      const only = new Set(args.only.split(",").map((s) => s.trim()));
      listings = listings.filter((l) => only.has(l.external_id));
    }
    const { changes, unreadable } = planConversion(listings);
    console.log(`[hours] source: ${sql ? "database" : "CSV"}`, {
      listings: listings.length,
      to_convert: changes.length - unreadable.length,
      unreadable: unreadable.length,
    });
    for (const listing of unreadable) {
      console.warn(`[hours] cannot read — ${listing.external_id} ${listing.name}:`, JSON.stringify(listing.problems));
    }
    if (args["dry-run"] || changes.length === 0) return;

    if (toFile) {
      writeSqlScript(args.sql, NORMALIZE_SQL, changes);
      console.log(`[hours] wrote ${args.sql} — run it in the Supabase SQL editor`);
      return;
    }
    console.log("[hours] done", await runStatement(sql, NORMALIZE_SQL, changes));
  } finally {
    await sql?.end({ timeout: 5 });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error("[hours] fatal:", err.message);
    process.exit(1);
  });
}
