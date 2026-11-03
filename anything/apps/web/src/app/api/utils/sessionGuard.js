import { getToken as authGetToken, encode as authEncode } from '@auth/core/jwt';
import { isValidAuthUserId } from './authUserId.js';
import { SESSION_EXPIRED_CODE } from './sessionExpiredCode.js';

// Session JWT lifetime + rolling refresh, and the per-request session guard that enforces both.
//
// History: A-05 (#554) cut the session JWT from 30 to 7 days but nothing ever re-issued it, so every
// user was signed out exactly 7 days after their last sign-in however often they used the app
// (docs/auth-logout-after-1.0.4-diagnosis.md). Now:
//   - the lifetime is AUTH_JWT_MAX_AGE_SECONDS (default 30 days);
//   - an authenticated Bearer request whose token is older than AUTH_JWT_REFRESH_AFTER_SECONDS
//     (default 24 h) gets a freshly minted token in the X-Pawpi-Refreshed-Token response header. The app
//     stores it; builds that predate the header ignore it and behave exactly as before.
// The token is minted exactly like the sign-in one (same salt, same payload, fresh iat/exp/jti), so
// auth_users.token_invalidated_at (compared with `iat`) still kills every token issued before a revocation.

export const DEFAULT_JWT_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
export const DEFAULT_JWT_REFRESH_AFTER_SECONDS = 24 * 60 * 60;
// Upper bound so a typo in the env can never mint multi-year tokens.
export const MAX_JWT_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;
export const REFRESHED_TOKEN_HEADER = 'X-Pawpi-Refreshed-Token';

const toPositiveInt = (value) => {
  if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) return null;
  const n = Number(value.trim());
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};

/**
 * Lifetime + refresh threshold from the environment. Invalid / non-positive values fall back to the
 * defaults. The threshold must be below the lifetime (otherwise a token would expire before it could
 * ever be refreshed): when it is not, it falls back to the default, or to half the lifetime if even
 * the default does not fit (short device-test lifetimes).
 * @returns {{ maxAge: number, refreshAfter: number }}
 */
export function resolveJwtLifetimes(env = process.env) {
  const maxAge = Math.min(
    toPositiveInt(env.AUTH_JWT_MAX_AGE_SECONDS) ?? DEFAULT_JWT_MAX_AGE_SECONDS,
    MAX_JWT_MAX_AGE_SECONDS,
  );
  let refreshAfter = toPositiveInt(env.AUTH_JWT_REFRESH_AFTER_SECONDS) ?? DEFAULT_JWT_REFRESH_AFTER_SECONDS;
  if (refreshAfter >= maxAge) {
    refreshAfter = Math.min(DEFAULT_JWT_REFRESH_AFTER_SECONDS, Math.floor(maxAge / 2)) || 1;
  }
  return { maxAge, refreshAfter };
}

const hasBearer = (headers) => {
  const value = headers?.get?.('authorization') ?? '';
  return value.split(' ')[0] === 'Bearer' && value.split(' ')[1]?.length > 0;
};

const isSecureRequest = (c, env) =>
  Boolean(env.AUTH_URL?.startsWith('https') || c.req.header('x-forwarded-proto') === 'https');

// Attach the header (and keep any shared cache from storing a response that carries a credential).
function setRefreshedToken(c, token) {
  const apply = (headers) => {
    headers.set(REFRESHED_TOKEN_HEADER, token);
    headers.set('Cache-Control', 'private, no-store');
  };
  const res = c.res;
  try {
    apply(res.headers);
  } catch {
    // immutable headers (a Response that came straight from fetch/proxy): rebuild it, body untouched
    const headers = new Headers(res.headers);
    apply(headers);
    c.res = new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  }
}

/**
 * Hono middleware for /api/*: (1) 401 ghost sessions and revoked tokens, (2) after the handler, hand
 * a refreshed token to a Bearer client whose token has aged past the refresh threshold. Never refreshes
 * on a 4xx/5xx, a revoked token, an unauthenticated request or /api/auth/*. Every step except the two
 * 401s fails open: the guard must never turn a good request into an error.
 *
 * Dependencies are injectable for tests; production passes nothing.
 */
export function sessionGuard({
  getToken = authGetToken,
  encode = authEncode,
  loadRevocation = () => import('./tokenRevocation.js'),
  env = process.env,
  now = () => Math.floor(Date.now() / 1000),
} = {}) {
  return async (c, next) => {
    if (c.req.path.startsWith('/api/auth/')) return next();
    const secureCookie = isSecureRequest(c, env);
    let payload = null;
    let sub;
    let iat;
    try {
      // Read the token exactly as the per-route auth() shim does (Bearer header OR cookie),
      // so a mobile Bearer ghost token can't slip past a guard that reads a different source.
      payload = await getToken({ req: c.req.raw, secret: env.AUTH_SECRET, secureCookie });
      sub = payload?.sub ?? undefined;
      iat = typeof payload?.iat === 'number' ? payload.iat : undefined;
    } catch {
      // undecodable token → unauthenticated; the per-route auth() will 401 it
    }
    // Ghost session (non-integer/UUID sub): FAIL CLOSED with 401 before any handler or query
    // touches the id (a 22P02 would abort the request tx and 500). Independent of iat.
    if (sub != null && !isValidAuthUserId(sub)) {
      return c.json(
        { error: 'Your session has expired. Please sign in again.', code: SESSION_EXPIRED_CODE },
        401,
      );
    }
    let isTokenRevoked = null;
    if (sub != null && iat != null) {
      try {
        ({ isTokenRevoked } = await loadRevocation());
        if (await isTokenRevoked(sub, iat)) {
          return c.json(
            { error: 'Your session has expired. Please sign in again.', code: SESSION_EXPIRED_CODE },
            401,
          );
        }
      } catch {
        // revocation lookup is fail-open — a DB blip must never lock everyone out
        isTokenRevoked = null;
      }
    }

    await next();

    // Rolling refresh. Only after a successful response, only for a Bearer client, only when we could
    // prove the token is not revoked (isTokenRevoked loaded and answered above).
    try {
      if (!isTokenRevoked || sub == null || iat == null || !payload) return;
      if (!env.AUTH_SECRET || !hasBearer(c.req.raw.headers)) return;
      const status = c.res?.status ?? 0;
      if (status < 200 || status >= 400) return;
      const { maxAge, refreshAfter } = resolveJwtLifetimes(env);
      if (now() - iat < refreshAfter) return;
      // Re-check: the request we just served may itself have revoked this token (password reset,
      // sign-out-everywhere). A token minted now would carry a fresh iat and outlive the cutoff.
      if (await isTokenRevoked(sub, iat)) return;
      // eslint-disable-next-line no-unused-vars
      const { iat: _iat, exp: _exp, jti: _jti, ...claims } = payload;
      const salt = secureCookie ? '__Secure-authjs.session-token' : 'authjs.session-token';
      const token = await encode({ token: claims, secret: env.AUTH_SECRET, salt, maxAge });
      setRefreshedToken(c, token);
    } catch {
      // refresh is best-effort; the request already succeeded
    }
  };
}
