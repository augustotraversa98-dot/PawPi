// Shared helpers for the directory seed scripts (load_master.mjs, backfill_website_url.mjs, load_enrichment.mjs).
//
// `postgres` and `papaparse` are resolved from anything/apps/web/node_modules (Node resolves a bare
// import from the importing FILE's folder, which has no node_modules of its own).
//
// Every write is ONE parameterised statement that takes the whole batch as a single jsonb value, so
// the two ways of running it are identical:
//   • connected:  DIRECTORY_DATABASE_URL (a BYPASSRLS role, like load_master.mjs)
//   • --sql FILE: the same statement written to a file, to paste into the Supabase SQL editor

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const SEED_DIR = dirname(fileURLToPath(import.meta.url));
const WEB_DIR = join(SEED_DIR, "..", "..", "..", "anything", "apps", "web");
/** `require` as the web app resolves packages: these scripts have no node_modules of their own. */
export const webRequire = createRequire(join(WEB_DIR, "package.json"));

export const CSV_PATH =
  process.env.DIRECTORY_CSV_PATH || join(SEED_DIR, "pawpi_directory_master.csv");

/** This folder's .env under the real process env (the process env wins). */
export function loadEnv(envPath = join(SEED_DIR, ".env")) {
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

export function readCsv(path = CSV_PATH) {
  const Papa = webRequire("papaparse");
  return Papa.parse(readFileSync(path, "utf8"), { header: true, skipEmptyLines: true }).data;
}

/**
 * Connect with DIRECTORY_DATABASE_URL only. No DATABASE_URL fallback on purpose: that one is the
 * app's RLS-bound role, under which these updates match nothing and report success.
 */
export async function connect(env = loadEnv()) {
  const conn = env.DIRECTORY_DATABASE_URL;
  if (!conn) {
    throw new Error(
      "DIRECTORY_DATABASE_URL is not set (a BYPASSRLS URL, e.g. Supabase's direct connection). " +
        "Set it, or use --sql <file> and run that file in the Supabase SQL editor.",
    );
  }
  const postgres = webRequire("postgres");
  const u = new URL(conn);
  const sql = postgres({
    host: u.hostname,
    port: u.port ? Number(u.port) : 5432,
    database: u.pathname.replace(/^\//, "") || "postgres",
    username: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    prepare: false,
    ssl: env.DATABASE_SSL === "disable" ? false : "require",
    max: 1,
    onnotice: () => {},
  });
  const [role] = await sql`
    select (rolsuper or rolbypassrls) as ok from pg_roles where rolname = current_user
  `;
  if (!role?.ok) {
    await sql.end({ timeout: 5 });
    throw new Error("DIRECTORY_DATABASE_URL must be a BYPASSRLS role; this one is bound by RLS.");
  }
  return sql;
}

// Serialises concurrent runs: the second one's statement starts (and takes its snapshot) only after
// the first has committed, so its "does this already exist?" checks see the first one's rows.
const LOCK_SQL = "select pg_advisory_xact_lock(hashtext('directory_seed_write'))";

/** Run one batch statement (`$1::text::jsonb` placeholder) inside a locked transaction. */
export async function runStatement(sql, statement, payload) {
  return sql.begin(async (tx) => {
    await tx.unsafe(LOCK_SQL);
    const rows = await tx.unsafe(statement, [JSON.stringify(payload)]);
    return rows[0];
  });
}

/**
 * The same statement as a self-contained SQL script. The payload (scraped, untrusted text) goes in a
 * dollar-quoted literal whose random tag cannot occur inside it.
 */
export function toSqlScript(statement, payload) {
  const json = JSON.stringify(payload);
  let tag;
  do {
    tag = `$j${randomBytes(8).toString("hex")}$`;
  } while (json.includes(tag));
  const bound = statement.replace("$1::text::jsonb", () => `${tag}${json}${tag}::jsonb`);
  return `begin;\n${LOCK_SQL};\n${bound.trim()};\ncommit;\n`;
}

export function writeSqlScript(path, statement, payload) {
  writeFileSync(path, toSqlScript(statement, payload), "utf8");
}

/** `--flag value` / `--flag` parser; enough for these scripts. */
export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith("--")) continue;
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      out[argv[i].slice(2)] = next;
      i += 1;
    } else {
      out[argv[i].slice(2)] = true;
    }
  }
  return out;
}
