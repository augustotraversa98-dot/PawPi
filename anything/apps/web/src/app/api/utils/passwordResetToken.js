// Password-reset token helpers (shared by the forgot-password and reset-password routes).
//
// The token the user receives is 32 random bytes, base64url-encoded. What the DB stores is its
// SHA-256 hash (migration 0069) — so a database dump, a backup, or an admin reading the
// admin-SELECT policy yields nothing that can be redeemed. Verification is a hash-and-lookup:
// the plaintext exists only in the email and in the URL the user clicks.
//
// SHA-256 (not argon2) is correct here and only here: the token is 256 bits of CSPRNG output, so
// there is no dictionary to attack and no reason to pay a slow-hash cost on every lookup. The
// USER'S PASSWORD is still argon2-hashed by the reset route — that is a different secret with a
// very different threat model.

import crypto from "node:crypto";

/** How long a reset link stays redeemable. Short by design — this is a recovery path, not a login. */
export const RESET_TOKEN_TTL_MINUTES = 30;

/** A fresh, unguessable reset token (the value that goes in the email link, never to the DB). */
export function generateResetToken() {
  return crypto.randomBytes(32).toString("base64url");
}

/**
 * The stored form of a token. Non-strings and empties hash to null so a malformed request can
 * never produce a lookup key that accidentally matches a row.
 */
export function hashResetToken(token) {
  if (typeof token !== "string" || token.length === 0) return null;
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** The expiry instant for a token minted now. */
export function resetTokenExpiry(now = new Date()) {
  return new Date(now.getTime() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);
}

/**
 * The absolute origin the reset link should point at.
 *
 * APP_BASE_URL FIRST, deliberately: deriving a link purely from the request's Host header is the
 * classic host-header-poisoning hole — an attacker POSTs to /api/account/forgot-password with
 * `Host: evil.test` and the victim is emailed a real token pointed at the attacker's server. With
 * APP_BASE_URL set (it is, on Railway), the link is pinned to our own origin no matter what the
 * request claims. The forwarded/request fallback keeps local + LAN dev working, where the whole
 * point is that the origin varies.
 */
export function resolveAppOrigin(request) {
  const configured = process.env.APP_BASE_URL;
  if (configured) return configured.replace(/\/+$/, "");

  const forwardedProto = request?.headers?.get?.("x-forwarded-proto");
  const forwardedHost =
    request?.headers?.get?.("x-forwarded-host") || request?.headers?.get?.("host");
  if (forwardedHost) {
    const proto = forwardedProto || "http";
    return `${proto}://${forwardedHost}`;
  }

  try {
    return new URL(request.url).origin;
  } catch {
    return "";
  }
}

/** The full link emailed to the user. */
export function buildResetLink(origin, token) {
  return `${origin}/account/reset-password?token=${encodeURIComponent(token)}`;
}
