// Pet @handle rules — the SERVER copy.
//
// The mobile client keeps a mirror in `mobile/src/utils/validateHandle.js`. The two MUST
// accept/reject exactly the same strings; both test suites run the same table of cases
// (search "HANDLE_PARITY_CASES") so a drift fails CI on whichever side changed.
//
// Everything here is pure (no DB) except `findFreeHandles`, which takes the taken-lookup as
// an argument so the collision paths are unit-testable without a database.

export const HANDLE_MIN_LENGTH = 3;
export const HANDLE_MAX_LENGTH = 20;

// Words nobody may claim as a pet handle: product/staff impersonation, routing words and
// generic system names. Lowercase. Mirrored on the client.
export const RESERVED_HANDLES = [
  'pawpi',
  'pawpiapp',
  'admin',
  'administrator',
  'moderator',
  'mod',
  'staff',
  'team',
  'support',
  'help',
  'official',
  'security',
  'billing',
  'privacy',
  'terms',
  'legal',
  'about',
  'contact',
  'settings',
  'login',
  'logout',
  'signup',
  'register',
  'search',
  'explore',
  'discover',
  'notifications',
  'messages',
  'feed',
  'home',
  'api',
  'www',
  'root',
  'system',
  'null',
  'undefined',
  'anonymous',
  'deleted',
  'everyone',
  'all',
  'me',
  'you',
  'vet',
  'vets',
];

/** Lowercase, trim and strip leading "@" — the only normalization, applied everywhere. */
export function normalizeHandle(raw) {
  return String(raw ?? '')
    .toLowerCase()
    .trim()
    .replace(/^@+/, '')
    .trim();
}

/**
 * Machine-readable reason a handle is not acceptable, or "" when it is. Codes (not copy) so the
 * client can show EN/ES text: empty | too_short | too_long | invalid_chars | reserved.
 */
export function handleFormatCode(raw) {
  const h = normalizeHandle(raw);
  if (h.length === 0) return 'empty';
  if (h.length < HANDLE_MIN_LENGTH) return 'too_short';
  if (h.length > HANDLE_MAX_LENGTH) return 'too_long';
  if (!/^[a-z0-9][a-z0-9_.]*$/.test(h)) return 'invalid_chars';
  if (RESERVED_HANDLES.includes(h)) return 'reserved';
  return '';
}

export function isValidHandle(raw) {
  return handleFormatCode(raw) === '';
}

// Letters/digits only, accents folded ("Pequeña" -> "pequena"), spaces dropped.
function slug(raw) {
  return String(raw ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

// Join a base and a suffix without ever exceeding the max length (the base is trimmed, the
// suffix is kept so variants stay distinct).
function join(base, suffix) {
  const room = HANDLE_MAX_LENGTH - suffix.length;
  return room < 1 ? suffix.slice(0, HANDLE_MAX_LENGTH) : `${base.slice(0, room)}${suffix}`;
}

/**
 * Deterministic, ordered candidate handles for a name. Order: the plain name, name + owner
 * initial, name + breed word, name + ".paws", then name + 2..60, then name + 100..109 (a long,
 * bounded tail so a free one always exists). Only VALID, non-reserved candidates are returned,
 * de-duplicated, in order. Same input -> same output (no randomness).
 */
export function handleCandidates({ name, ownerInitial, breed } = {}) {
  let base = slug(name);
  if (base.length === 0) base = 'pup';
  if (base.length < HANDLE_MIN_LENGTH) base = `${base}pup`.slice(0, HANDLE_MAX_LENGTH);
  const initial = slug(ownerInitial).slice(0, 1);
  const breedWord = slug(String(breed ?? '').trim().split(/\s+/)[0]).slice(0, 8);

  const list = [base];
  if (initial) list.push(join(base, initial));
  if (breedWord) list.push(join(base, `_${breedWord}`));
  list.push(join(base, '.paws'));
  for (let n = 2; n <= 60; n++) list.push(join(base, String(n)));
  for (let n = 100; n <= 109; n++) list.push(join(base, String(n)));

  const seen = new Set();
  return list.filter((c) => {
    if (seen.has(c) || !isValidHandle(c)) return false;
    seen.add(c);
    return true;
  });
}

/**
 * The first `count` candidates that are free. `fetchTaken(candidates)` must resolve to the
 * lowercase subset of `candidates` already in use (one batched query). Candidates are checked
 * in chunks so the common case is a single round trip.
 */
export async function findFreeHandles(candidates, fetchTaken, count = 1) {
  const free = [];
  const CHUNK = 24;
  for (let i = 0; i < candidates.length && free.length < count; i += CHUNK) {
    const chunk = candidates.slice(i, i + CHUNK);
    const taken = new Set((await fetchTaken(chunk)).map((h) => String(h).toLowerCase()));
    for (const c of chunk) {
      if (!taken.has(c) && free.length < count) free.push(c);
    }
  }
  return free;
}

/** Lookup used by the routes: which of `candidates` exist on a pet (case-insensitive). */
export async function takenAmong(sql, candidates) {
  if (candidates.length === 0) return [];
  const rows = await sql`
    SELECT lower(handle) AS handle FROM pets WHERE lower(handle) = ANY(${candidates})
  `;
  return rows.map((r) => r.handle);
}

/** Up to `count` free alternatives for a handle somebody else already holds. */
export async function alternativesFor(sql, handle, count = 3) {
  const candidates = handleCandidates({ name: normalizeHandle(handle) }).filter(
    (c) => c !== normalizeHandle(handle),
  );
  return findFreeHandles(candidates, (chunk) => takenAmong(sql, chunk), count);
}

/** True when a Postgres error is the unique-violation on pets.handle. */
export function isHandleUniqueViolation(error) {
  if (!error || error.code !== '23505') return false;
  const c = String(error.constraint_name || error.constraint || '');
  return c === '' || /handle/i.test(c);
}
