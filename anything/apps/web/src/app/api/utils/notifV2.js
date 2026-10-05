import { withSavepoint } from "@/app/api/utils/requestContext";

// Notifications v2 — the server-side feature flag and the "fail soft" wrapper
// (docs/notifications-v2-design.md).
//
// FLAG: NOTIF_V2_ENABLED. Absent / empty / anything but a truthy word = OFF. It is read on every call (not
// memoised) so flipping the Railway variable + a restart is the whole switch, and unit tests can toggle it.
// With the flag OFF every v2 code path must be a no-op that issues NO query against a v2 table, column or
// function: production behaviour is exactly what it was before v2 merged.
//
// SOFT: the v2 migrations (0131+) are applied by hand AFTER the code merges, so with the flag ON but the
// schema missing, a v2 query throws 42P01 / 42883 / 42703. In a request transaction an uncaught query error
// poisons the WHOLE transaction (the actor's request would 500), so every v2 query runs inside `softV2`: a
// SAVEPOINT (withSavepoint) + try/catch, falling back to a caller-supplied value. A missing-schema error is
// remembered for a minute so we do not re-issue a query we know will fail.

const TRUTHY = new Set(["1", "true", "on", "yes", "enabled"]);

export function isNotifV2Enabled() {
  const raw = process.env.NOTIF_V2_ENABLED;
  return typeof raw === "string" && TRUTHY.has(raw.trim().toLowerCase());
}

const MISSING_SCHEMA_CODES = new Set(["42P01", "42883", "42703"]);
export function isMissingSchemaError(e) {
  return MISSING_SCHEMA_CODES.has(e?.code);
}

let schemaMissingUntil = 0;
const SCHEMA_BACKOFF_MS = 60_000;

/** Test seam: forget a remembered missing-schema state. */
export function __resetNotifV2SchemaStateForTests() {
  schemaMissingUntil = 0;
}

/**
 * Run a v2 DB operation without ever throwing or poisoning the surrounding transaction.
 * @template T
 * @param {() => Promise<T>} fn
 * @param {T} fallback returned on any failure (missing schema, DB error)
 * @returns {Promise<T>}
 */
export async function softV2(fn, fallback) {
  if (Date.now() < schemaMissingUntil) return fallback;
  try {
    return await withSavepoint(fn);
  } catch (e) {
    if (isMissingSchemaError(e)) {
      schemaMissingUntil = Date.now() + SCHEMA_BACKOFF_MS;
    } else {
      console.error("[notifV2] non-fatal:", e?.message);
    }
    return fallback;
  }
}

// ── per-user daily push cap ─────────────────────────────────────────────────
// Server-wide default; override with NOTIF_V2_DAILY_CAP (positive integer). Used by the owner push pipeline.
export const DEFAULT_DAILY_PUSH_CAP = 3;
export function dailyPushCap() {
  const n = Number.parseInt(process.env.NOTIF_V2_DAILY_CAP ?? "", 10);
  return Number.isInteger(n) && n > 0 && n <= 50 ? n : DEFAULT_DAILY_PUSH_CAP;
}
