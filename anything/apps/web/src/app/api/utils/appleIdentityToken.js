// appleIdentityToken — verify an Apple "Sign in with Apple" identity token issued to the
// NATIVE app (audience = the iOS bundle id, e.g. com.pawpi.app).
//
// This is the server side of the native Apple flow: the phone signs in with the native
// AppleAuthentication button and POSTs the resulting `identityToken` (a JWT signed by Apple)
// plus the RAW nonce it generated. We must never trust that token blindly — anyone can POST a
// string — so we cryptographically verify it against Apple's published public keys before
// treating its `sub` as an identity.
//
// Apple identity tokens are RS256-signed. We verify with node:crypto only (no new dependency,
// matching appleClientSecret.js) by importing the matching JWK from Apple's JWKS as a public
// key and checking the RSA-SHA256 signature over `<header>.<payload>`. Then we assert:
//   * iss  === https://appleid.apple.com
//   * aud  includes the expected clientId (our bundle id / native audience)
//   * exp  is in the future
//   * nonce, if the token carries one, equals sha256hex(rawNonce) — Apple echoes the value the
//     client passed as the request nonce, and the client passes sha256(rawNonce), so a matching
//     rawNonce proves this token was minted for THIS sign-in attempt (replay protection).
//
// Everything is injectable (fetch, clock, jwks) so the happy / blocked / nonce-mismatch paths
// are unit-testable with a throwaway RSA keypair and no network.

import { createPublicKey, createHash, verify as cryptoVerify } from "node:crypto";

export const APPLE_ISSUER = "https://appleid.apple.com";
export const APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys";

// Cache Apple's JWKS briefly. Apple rotates these keys and the set is tiny; a short TTL keeps
// us from fetching on every sign-in without pinning a key that Apple has retired.
const JWKS_TTL_MS = 60 * 60 * 1000; // 1 hour
let _jwksCache = { keys: null, fetchedAt: 0 };

// Test-only: drop the cached JWKS so a test can inject a fresh key set.
export function __resetAppleJwksCacheForTests() {
  _jwksCache = { keys: null, fetchedAt: 0 };
}

async function fetchAppleJwks(fetchImpl, now) {
  if (_jwksCache.keys && now - _jwksCache.fetchedAt < JWKS_TTL_MS) {
    return _jwksCache.keys;
  }
  const res = await fetchImpl(APPLE_JWKS_URL);
  if (!res?.ok) {
    throw new Error(`Apple JWKS fetch failed with status ${res?.status}`);
  }
  const body = await res.json();
  if (!body || !Array.isArray(body.keys)) {
    throw new Error("Apple JWKS response missing keys[]");
  }
  _jwksCache = { keys: body.keys, fetchedAt: now };
  return body.keys;
}

function decodeSegment(segment) {
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
}

/**
 * Verify an Apple identity token and return its decoded payload, or THROW on any failure.
 *
 * @param {object} args
 * @param {string} args.identityToken  The compact JWT from AppleAuthentication.signInAsync.
 * @param {string} [args.rawNonce]     The raw (unhashed) nonce the client generated.
 * @param {string} args.clientId       Expected audience (the native bundle id, AUTH_APPLE_ID).
 * @param {number} [args.now]          Unix seconds (injectable clock).
 * @param {Function} [args.fetchImpl]  fetch implementation (injectable).
 * @param {Array}  [args.jwks]         Pre-supplied JWKS key array (injectable; skips fetch).
 * @returns {Promise<object>} the verified token payload ({ sub, email, is_private_email, ... })
 */
export async function verifyAppleIdentityToken({
  identityToken,
  rawNonce,
  clientId,
  now = Math.floor(Date.now() / 1000),
  fetchImpl = fetch,
  jwks = null,
}) {
  if (!identityToken || typeof identityToken !== "string") {
    throw new Error("appleIdentityToken: missing identityToken");
  }
  if (!clientId) {
    throw new Error("appleIdentityToken: missing expected clientId (aud)");
  }

  const parts = identityToken.split(".");
  if (parts.length !== 3) {
    throw new Error("appleIdentityToken: malformed token (expected 3 segments)");
  }
  const [headerB64, payloadB64, signatureB64] = parts;

  let header;
  let payload;
  try {
    header = decodeSegment(headerB64);
    payload = decodeSegment(payloadB64);
  } catch {
    throw new Error("appleIdentityToken: token header/payload is not valid base64url JSON");
  }

  if (header.alg !== "RS256") {
    throw new Error(`appleIdentityToken: unexpected alg ${header.alg} (expected RS256)`);
  }

  const keys = jwks || (await fetchAppleJwks(fetchImpl, now));
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) {
    throw new Error(`appleIdentityToken: no Apple key matches kid ${header.kid}`);
  }

  const publicKey = createPublicKey({ key: jwk, format: "jwk" });
  const signatureValid = cryptoVerify(
    "RSA-SHA256",
    Buffer.from(`${headerB64}.${payloadB64}`),
    publicKey,
    Buffer.from(signatureB64, "base64url"),
  );
  if (!signatureValid) {
    throw new Error("appleIdentityToken: signature verification failed");
  }

  if (payload.iss !== APPLE_ISSUER) {
    throw new Error(`appleIdentityToken: bad iss ${payload.iss}`);
  }

  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audiences.includes(clientId)) {
    throw new Error(`appleIdentityToken: aud ${JSON.stringify(payload.aud)} does not include ${clientId}`);
  }

  if (typeof payload.exp !== "number" || payload.exp <= now) {
    throw new Error("appleIdentityToken: token is expired");
  }

  // Nonce binding. Apple echoes back whatever the client set as the request nonce; our client
  // sets sha256(rawNonce), so the token's nonce claim must equal sha256hex(rawNonce). If the
  // token carries a nonce we REQUIRE a matching rawNonce — a token minted with a nonce but
  // presented without one is a replay attempt.
  if (payload.nonce != null) {
    if (!rawNonce) {
      throw new Error("appleIdentityToken: token carries a nonce but no rawNonce was supplied");
    }
    const expected = createHash("sha256").update(rawNonce).digest("hex");
    if (payload.nonce !== expected) {
      throw new Error("appleIdentityToken: nonce mismatch");
    }
  }

  return payload;
}
