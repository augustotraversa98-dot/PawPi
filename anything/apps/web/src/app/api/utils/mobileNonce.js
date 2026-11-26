// One-time nonce that ties GET /api/auth/mobile-return to a flow that /api/auth/mobile-start began in the SAME browser.
//
// mobile-start mints a random nonce, sets it as a short-lived HttpOnly cookie and puts the same value in the callbackUrl it
// hands to Auth.js. mobile-return only hands out the session token when the cookie and the URL value match, and always
// clears the cookie. A request that did not come through mobile-start (a bare link, another site sending the browser there)
// has neither the cookie nor the value, so it gets no token.
//
// Enforcement is opt-in: MOBILE_RETURN_REQUIRE_NONCE=1. Without it, mobile-return only LOGS a mismatch and behaves exactly as
// before, so deploying this cannot change Google sign-in until the owner turns it on.

export const NONCE_COOKIE = 'pawpi_mobile_nonce';
export const NONCE_PARAM = 'n';
const NONCE_TTL_SECONDS = 600;
const NONCE_PATH = '/api/auth';

export function newNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function readCookie(request, name) {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    if (part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

// Constant-time compare for two strings of any length; false for empty / non-string input.
export function nonceMatches(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length === 0 || b.length === 0) return false;
  let diff = a.length ^ b.length;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

function attrs(secure, maxAge) {
  return `Path=${NONCE_PATH}; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}
export const setNonceCookie = (value, secure) => `${NONCE_COOKIE}=${value}; ${attrs(secure, NONCE_TTL_SECONDS)}`;
export const clearNonceCookie = (secure) => `${NONCE_COOKIE}=; ${attrs(secure, 0)}`;

export const nonceEnforced = () => process.env.MOBILE_RETURN_REQUIRE_NONCE === '1';
