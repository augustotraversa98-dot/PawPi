// Demo-seed runner helpers — the node-only side effects (env, DB, storage, image
// resize). Kept out of spec.mjs so spec stays pure + unit-testable. Imported only
// by index.mjs, which is run with `node`/`bun` from the web app dir so `postgres`
// and `argon2` resolve from web/node_modules.

import { readFileSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { execFileSync } from "node:child_process";
import postgres from "postgres";

const BUCKET = "media";

// ── env ──────────────────────────────────────────────────────────────────────

// Minimal .env parser (no dotenv dependency). Real process.env wins over the file,
// so an operator can override DATABASE_URL/SUPABASE_* on the command line.
export function loadEnv(envPath) {
  const fromFile = {};
  if (existsSync(envPath)) {
    const text = readFileSync(envPath, "utf8");
    for (const rawLine of text.split("\n")) {
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

// ── db ───────────────────────────────────────────────────────────────────────

// Mirrors src/app/api/utils/sql.js: parse the URL ourselves (porsager mishandles
// Supabase pooler usernames with a dot), prepare:false for pgbouncer, ssl 'require'
// unless DATABASE_SSL=disable.
export function createSql(connectionString, env = {}) {
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

/**
 * Run `fn(tx)` inside a transaction carrying the given DB identity — the exact
 * mechanism withRequestContext uses (set_config('app.current_user_id', id, true)),
 * so every write satisfies the FORCE-RLS owner/author policies as a REAL user
 * would. Pass identity=null for the few RLS-disabled tables (auth tables + user_profiles).
 */
export async function asIdentity(sql, identityId, fn) {
  return sql.begin(async (tx) => {
    if (identityId != null) {
      await tx`select set_config('app.current_user_id', ${String(identityId)}, true)`;
    }
    return fn(tx);
  });
}

// ── storage ──────────────────────────────────────────────────────────────────

let sipsAvailable = null;
function hasSips() {
  if (sipsAvailable !== null) return sipsAvailable;
  try {
    execFileSync("sips", ["--help"], { stdio: "ignore" });
    sipsAvailable = true;
  } catch {
    sipsAvailable = false;
  }
  return sipsAvailable;
}

/**
 * Resize/compress a JPEG to a temp file using macOS `sips` (no native dep).
 * Longest edge → maxEdge px, JPEG quality `quality`. Falls back to the original
 * path (with a warning) when sips is unavailable.
 */
export function resizeForUpload(srcPath, { maxEdge = 1600, quality = 72 } = {}) {
  if (!hasSips()) {
    console.warn(
      `  ⚠️  'sips' not found — uploading ${basename(srcPath)} at original size (resize skipped).`,
    );
    return srcPath;
  }
  const dir = mkdtempSync(join(tmpdir(), "pawpi-seed-"));
  const out = join(dir, basename(srcPath));
  execFileSync("sips", [
    "-Z", String(maxEdge),
    "-s", "format", "jpeg",
    "-s", "formatOptions", String(quality),
    srcPath,
    "--out", out,
  ], { stdio: "ignore" });
  return out;
}

/**
 * Upload a local image to the Supabase Storage `media` bucket at a DETERMINISTIC
 * objectPath (so re-runs upsert the same object → stable URLs, no orphans).
 * Returns the public URL — the same shape POST /api/upload returns.
 */
export async function uploadImage(env, localPath, objectPath, { resize = true } = {}) {
  const supabaseUrl = env.SUPABASE_URL?.replace(/\/+$/, "");
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  const sendPath = resize ? resizeForUpload(localPath) : localPath;
  const bytes = readFileSync(sendPath);
  const res = await fetch(
    `${supabaseUrl}/storage/v1/object/${BUCKET}/${objectPath}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        "Content-Type": "image/jpeg",
        "x-upsert": "true",
      },
      body: bytes,
    },
  );
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Storage upload failed (${res.status}): ${detail}`);
  }
  return `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${objectPath}`;
}

/** Best-effort delete of a seeded storage object (used by the reset path). */
export async function deleteStorageObject(env, objectPath) {
  const supabaseUrl = env.SUPABASE_URL?.replace(/\/+$/, "");
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return false;
  const res = await fetch(
    `${supabaseUrl}/storage/v1/object/${BUCKET}/${objectPath}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
    },
  );
  return res.ok;
}
