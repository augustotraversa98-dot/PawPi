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

// Was a Bearer token actually attached to this request? The server stamps `session_expired` on EVERY
// non-machine 401, including a request that arrived with no token at all — which is not a verdict on the
// stored session (H3 in docs/auth-logout-after-1.0.4-diagnosis.md). The fetch wrapper marks the responses it
// sent a token for; a code on an unmarked response is ignored.
const bearerSent = new WeakSet();

/** fetch wrapper: this response answers a request that carried the stored session's Bearer token. */
export function markBearerSent(response) {
  try {
    if (response && typeof response === 'object') bearerSent.add(response);
  } catch {
    // diagnostics-grade bookkeeping; never affects a request
  }
}

/** Did the request that produced `response` carry a Bearer token? */
export function wasBearerSent(response) {
  try {
    return !!response && typeof response === 'object' && bearerSent.has(response);
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
let launchReadOutcome = 'empty'; // 'empty' | 'timeout' | 'error' — why the cold-launch read produced no token
/** useAuth: the cold-launch Keychain read hit the 3 s guard / threw. Reported with the launch token verdict. */
export function noteLaunchRead(outcome) {
  launchReadOutcome = outcome;
}
/** Once per launch: did the cold-launch Keychain read find a stored token? (and, if not, why) */
export function reportLaunchToken(found) {
  if (launchTokenReported) return;
  launchTokenReported = true;
  if (found) return trackAuthDiag('launch_token_found');
  trackAuthDiag(
    launchReadOutcome === 'timeout'
      ? 'launch_read_timeout'
      : launchReadOutcome === 'error'
        ? 'launch_read_error'
        : 'launch_no_token',
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;
/**
 * auth_diag kind for how old the stored token was when the session was cleared (`tokenAt` = epoch ms the app
 * received it: sign-in or last refresh; absent for sessions stored before 1.0.5). Only a bucket leaves the device.
 * With the rolling refresh a healthy session is < 1 day old; a clear at ge30d is a genuine expiry, a clear
 * at lt1d/lt7d is the server rejecting a young token (revocation, secret rotation, a bug).
 */
export function clearedAgeKind(tokenAt, now = Date.now()) {
  if (typeof tokenAt !== 'number' || !Number.isFinite(tokenAt)) return 'cleared_age_unknown';
  const age = now - tokenAt;
  if (age < -60_000) return 'cleared_age_unknown'; // clock went backwards: no honest bucket
  if (age < DAY_MS) return 'cleared_age_lt1d';
  if (age < 7 * DAY_MS) return 'cleared_age_lt7d';
  if (age < 30 * DAY_MS) return 'cleared_age_lt30d';
  return 'cleared_age_ge30d';
}

// Test-only.
export function __resetSessionHealthForTests() {
  recheckInFlight = null;
  aliveUntil = 0;
  launchTokenReported = false;
  launchReadOutcome = 'empty';
}
