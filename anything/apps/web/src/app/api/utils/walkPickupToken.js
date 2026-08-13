// Walk-pickup token helpers (ticket B3) — a STATELESS, HMAC-signed, short-lived token the owner
// renders as a QR at pickup. The walker scans it; the redeem route verifies it server-side, then
// atomically deducts a credit + checks in the walk.
//
// Stateless by design (no table): the payload { owner_user_id, pet_id, provider_id, exp } is
// base64url(JSON) and an HMAC-SHA256 signature over that, joined by a dot. Verification recomputes
// the signature (timing-safe) and checks expiry. Same crypto family as tokenCrypto.js /
// passwordResetToken.js (node:crypto). Low-value + 5-min TTL, so replay protection is TTL-only in
// v1 (a one-time-use store is a later hardening — flagged in test-backlog).

import crypto from "node:crypto";

/** Default lifetime of a pickup token — short by design (a handover proof, not a session). */
export const PICKUP_TOKEN_TTL_SECONDS = 5 * 60;

// The signing secret. Prefer the app auth secret; fall back to the payments token key, then a dev
// constant so local/test signing+verification stay self-consistent within one deployment.
function pickupSecret() {
  return (
    process.env.AUTH_SECRET ||
    process.env.PAYMENTS_TOKEN_KEY ||
    "pawpi-walk-pickup-dev-secret"
  );
}

function hmac(part) {
  return crypto.createHmac("sha256", pickupSecret()).update(part).digest("base64url");
}

/**
 * Sign a pickup token. payload MUST carry owner_user_id, pet_id, provider_id (numbers). exp is
 * stamped here (now + ttl). Returns `<base64url(payload)>.<base64url(sig)>`.
 */
export function signPickupToken(payload, { ttlSeconds = PICKUP_TOKEN_TTL_SECONDS, now = Date.now() } = {}) {
  const body = {
    owner_user_id: payload.owner_user_id,
    pet_id: payload.pet_id,
    provider_id: payload.provider_id,
    exp: Math.floor(now / 1000) + ttlSeconds,
  };
  const part = Buffer.from(JSON.stringify(body)).toString("base64url");
  return `${part}.${hmac(part)}`;
}

/**
 * Verify a pickup token. Returns the decoded payload { owner_user_id, pet_id, provider_id, exp }
 * when the signature is valid AND not expired; otherwise null (tampered / malformed / expired).
 */
export function verifyPickupToken(token, { now = Date.now() } = {}) {
  if (typeof token !== "string" || token.indexOf(".") === -1) return null;
  const [part, sig] = token.split(".");
  if (!part || !sig) return null;

  const expected = hmac(part);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  let body;
  try {
    body = JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (
    !body ||
    typeof body.exp !== "number" ||
    body.exp < Math.floor(now / 1000) ||
    !Number.isFinite(Number(body.owner_user_id)) ||
    !Number.isFinite(Number(body.pet_id)) ||
    !Number.isFinite(Number(body.provider_id))
  ) {
    return null;
  }
  return body;
}
