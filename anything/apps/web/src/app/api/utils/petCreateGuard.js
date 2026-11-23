// Duplicate-pet guard for POST /api/pets (family-sharing audit gap B8, docs/family-sharing-audit-2026-11.md).
//
// WHY. A lost response, a retry, a double tap or a transient empty list can make the app POST the SAME dog twice, and the
// route used to create two rows (only the handle was checked, and with no handle it simply picked another free one).
// Builds 30-32 send no idempotency key and cannot be changed, so the protection has to live on the server and work without
// any client cooperation.
//
// TWO guards, both scoped by the OWNER's user_profiles.id (never the auth id, never grants — a person who is only a
// family/caregiver on someone else's dog is unaffected and can still add their own):
//
//   1. Retry window (no client cooperation). A POST whose name matches — case- and whitespace-insensitive —
//      a pet THIS owner created within the last PET_CREATE_RETRY_WINDOW_SECONDS returns that existing pet (HTTP 200,
//      same body shape as the 201) instead of inserting. A same-named dog created long afterwards is a different dog and
//      is allowed. The existing row is returned UNCHANGED: a retry never edits it.
//   2. Idempotency-Key header (optional, for future clients). Same owner + same key = the same pet, forever (no window).
//      A key the owner has not used before means "this is a new attempt", so it is created even if the name matches a pet from
//      the last few minutes (the client explicitly said it is a distinct request). Stored in request_idempotency_keys
//      (migration 0138). Until 0138 is applied the key is silently ignored and guard 1 still applies.
//
// CONCURRENCY. Every POST first takes a TRANSACTION-level advisory lock keyed on the owner, so two simultaneous identical
// requests are serialised: the second one waits for the first one's COMMIT, then its lookup (a new READ COMMITTED
// statement) sees the committed row and returns it. The lock is released automatically at COMMIT/ROLLBACK, needs no
// migration and cannot leak. (The request runs in ONE transaction — see requestContext.js.)

import sql from "./sql";
import { withSavepoint } from "./requestContext";

/** A retry of the same create (lost response, double tap, onboarding re-submit) lands well inside this. */
export const PET_CREATE_RETRY_WINDOW_SECONDS = 300;

export const IDEMPOTENCY_SCOPE_PET_CREATE = "pet_create";

const UNDEFINED_TABLE = "42P01";

// Printable, URL-safe, bounded: UUIDs, ULIDs, base64url and "client:uuid" style keys all fit.
const KEY_PATTERN = /^[A-Za-z0-9_.:\-]{8,128}$/;

/**
 * Read the optional Idempotency-Key header.
 * @returns {{ key: string|null } | { error: string }}  key null = header absent (or blank).
 */
export function parseIdempotencyKey(headerValue) {
  if (headerValue == null) return { key: null };
  const key = String(headerValue).trim();
  if (key === "") return { key: null };
  if (!KEY_PATTERN.test(key)) {
    return { error: "That Idempotency-Key isn't valid. Use 8-128 letters, numbers, dashes or underscores." };
  }
  return { key };
}

/** Serialise this owner's pet creates for the rest of the request transaction. */
export async function lockOwnerForPetCreate(ownerUserId) {
  await sql`SELECT pg_advisory_xact_lock(hashtext('pet-create'), ${ownerUserId})`;
}

// Same normalisation on BOTH sides of the comparison (done by Postgres, so it cannot drift from JS/locale rules):
// trim, collapse any run of whitespace to one space, lowercase.
//   lower(btrim(regexp_replace(x, '[[:space:]]+', ' ', 'g')))
// (collapse FIRST, then trim: btrim alone only strips spaces, so a trailing tab/newline would survive. The POSIX class
// [[:space:]] is used on purpose: a backslash escape like \s inside a JS template literal is silently turned into a plain "s".)

/** This owner's most recent pet with the same normalised name created inside the retry window, or null. */
export async function findRecentSamePet(ownerUserId, name) {
  const rows = await sql`
    SELECT * FROM pets
    WHERE owner_user_id = ${ownerUserId}
      AND lower(btrim(regexp_replace(name, '[[:space:]]+', ' ', 'g')))
        = lower(btrim(regexp_replace(${name}::text, '[[:space:]]+', ' ', 'g')))
      AND created_at > now() - make_interval(secs => ${PET_CREATE_RETRY_WINDOW_SECONDS})
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `;
  return rows[0] || null;
}

/**
 * The pet a previous request with this key created for this owner, or null (also null when the key table is not
 * deployed yet, or the pet has since been removed).
 */
export async function findPetByIdempotencyKey(ownerUserId, key) {
  try {
    return await withSavepoint(async () => {
      const rows = await sql`
        SELECT p.* FROM request_idempotency_keys k
        JOIN pets p ON p.id = k.resource_id AND p.owner_user_id = k.owner_user_id
        WHERE k.owner_user_id = ${ownerUserId}
          AND k.scope = ${IDEMPOTENCY_SCOPE_PET_CREATE}
          AND k.idem_key = ${key}
        LIMIT 1
      `;
      return rows[0] || null;
    });
  } catch (e) {
    if (e?.code === UNDEFINED_TABLE) return null; // pre-0138: the key is ignored, the retry window still protects
    throw e;
  }
}

/** Remember key -> pet (upsert: a stale row whose pet was removed is simply re-pointed). Best effort pre-0138. */
export async function rememberPetIdempotencyKey(ownerUserId, key, petId) {
  try {
    await withSavepoint(async () => {
      await sql`
        INSERT INTO request_idempotency_keys (owner_user_id, scope, idem_key, resource_id)
        VALUES (${ownerUserId}, ${IDEMPOTENCY_SCOPE_PET_CREATE}, ${key}, ${petId})
        ON CONFLICT (owner_user_id, scope, idem_key) DO UPDATE SET resource_id = EXCLUDED.resource_id
      `;
    });
  } catch (e) {
    if (e?.code !== UNDEFINED_TABLE) throw e;
  }
}

/** Same name after normalisation — used to refuse an Idempotency-Key reused for a different dog. */
export function sameNormalisedName(a, b) {
  const norm = (s) => String(s ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  return norm(a) === norm(b);
}
