// sessionHealth — how the app decides a 401 means "your session is dead".
//
// A 401 from our API used to mean "sign out" on ANY first-party route. But a 401 can come from a
// business rule, and a signed-in user was being logged out for it. The server now stamps every REAL
// session 401 with a stable code (anything/apps/web/src/app/api/utils/sessionExpiredCode.js):
//
//   header  X-Pawpi-Error-Code: session_expired      body  { …, code: "session_expired" }
//
// The rule (client side):
//   - a 401 that carries the code           -> the session is dead.
//   - a 401 WITHOUT the code                -> ask GET /api/session ONCE ("re-check"). Only a 401 from
//                                              that confirms the token is dead.
//   - anything else (network error, 5xx, a re-check that fails or times out, a 2xx) -> NOT dead.
//
// Dependency-free at import time (expo/fetch and the telemetry module are required lazily), so fetch.ts
// and the auth store can import this at startup without dragging the app graph into the entry file.

export const SESSION_EXPIRED_CODE = 'session_expired';
export const ERROR_CODE_HEADER = 'x-pawpi-error-code';
export const RECHECK_TIMEOUT_MS = 8000;
// After a re-check said the session is fine, a burst of business 401s must not re-check again.
export const RECHECK_ALIVE_COOLDOWN_MS = 30000;

const headerOf = (response, name) => {
  try {
    return response?.headers?.get?.(name) ?? null;
  } catch {
    return null;
  }
};

/** Sync check: the 401 carries the session_expired code in its header. */
export function hasSessionExpiredHeader(response) {
  return headerOf(response, ERROR_CODE_HEADER) === SESSION_EXPIRED_CODE;
}

/**
 * Does this (already received) response carry the session_expired code — header first, then a body
 * `code`. Reads from a clone, so the caller's body stays readable. Never throws.
 * @returns {Promise<boolean>}
 */
export async function carriesSessionExpiredCode(response) {
  if (hasSessionExpiredHeader(response)) return true;
  try {
    const body = await response?.clone?.()?.json?.();
    return body?.code === SESSION_EXPIRED_CODE;
  } catch {
    return false;
  }
}

let recheckInFlight = null;
let aliveUntil = 0;

/**
 * One re-check against GET /api/session with this token. Concurrent callers share one request; a
 * recent "alive" answer is reused for RECHECK_ALIVE_COOLDOWN_MS.
 * @returns {Promise<'dead'|'alive'|'unknown'>} 'dead' only on a 401 from the session endpoint.
 */
export function confirmSessionDead(jwt, { now = Date.now } = {}) {
  if (now() < aliveUntil) return Promise.resolve('alive');
  if (recheckInFlight) return recheckInFlight;
  recheckInFlight = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), RECHECK_TIMEOUT_MS);
    try {
      const base = process.env.EXPO_PUBLIC_BASE_URL || '';
      // eslint-disable-next-line global-require
      const { fetch: expoFetch } = require('expo/fetch');
      const res = await expoFetch(`${base}/api/session`, {
        method: 'GET',
        headers: { authorization: `Bearer ${jwt}` },
        signal: controller.signal,
      });
      if (res.status === 401) return 'dead';
      if (res.ok) {
        aliveUntil = now() + RECHECK_ALIVE_COOLDOWN_MS;
        return 'alive';
      }
      return 'unknown';
    } catch {
      return 'unknown';
    } finally {
      clearTimeout(timer);
    }
  })().finally(() => {
    recheckInFlight = null;
  });
  return recheckInFlight;
}

/**
 * Decide whether a 401 (or, at launch, a 403) means the stored token is dead.
 * @param {{ response?: any, hasCode?: boolean, jwt: string }} input
 * @returns {Promise<{ dead: boolean, via: 'code'|'recheck'|null, recheck?: 'alive'|'unknown' }>}
 */
export async function isSessionDead({ response, hasCode, jwt }) {
  const coded = hasCode ?? (await carriesSessionExpiredCode(response));
  if (coded) return { dead: true, via: 'code' };
  const outcome = await confirmSessionDead(jwt);
  if (outcome === 'dead') return { dead: true, via: 'recheck' };
  return { dead: false, via: null, recheck: outcome };
}

/** Anonymous auth diagnostics (registry event `auth_diag`). Never throws, never carries a token/id. */
export function trackAuthDiag(kind) {
  try {
    require('@/telemetry/track').track('auth_diag', { kind });
  } catch {
    // diagnostics must never affect auth
  }
}

let launchTokenReported = false;
/** Once per launch: did the cold-launch Keychain read find a stored token? */
export function reportLaunchToken(found) {
  if (launchTokenReported) return;
  launchTokenReported = true;
  trackAuthDiag(found ? 'launch_token_found' : 'launch_no_token');
}

// Test-only.
export function __resetSessionHealthForTests() {
  recheckInFlight = null;
  aliveUntil = 0;
  launchTokenReported = false;
}
