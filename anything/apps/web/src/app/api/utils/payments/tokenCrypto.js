// tokenCrypto — encrypt provider payment OAuth tokens AT REST (ticket 2.16).
//
// Defense-in-depth on top of the provider-admin-only RLS on provider_payment_accounts:
// the MercadoPago access/refresh tokens are encrypted BEFORE they touch the database and
// decrypted only in-process when a charge/refund needs them, so a DB dump (or anyone with
// raw table access) never sees a usable token. No behavior change to checkout/refund/payout.
//
// AES-256-GCM via Node's built-in crypto (no new dependency). The key comes from the env
// var PAYMENTS_TOKEN_KEY (a 32-byte key, hex or base64 — see .env.example). A random IV is
// generated per encryption and stored together with the GCM auth tag and ciphertext.
//
// Output is VERSION-PREFIXED ("enc:v1:<base64>") so a read can tell ciphertext from any
// legacy plaintext row and future key rotation stays possible. decryptToken passes any
// non-prefixed value through unchanged, so pre-existing plaintext rows and the test harness
// never break.

import crypto from "node:crypto";

const PREFIX = "enc:v1:";
const ALGO = "aes-256-gcm";
const IV_BYTES = 12; // 96-bit IV — the GCM standard.
const TAG_BYTES = 16;

// A 503-shaped config error so the connect route maps a missing key to a clean 503
// ("not configured") instead of a 500 — matching how the payment layer treats unset rails.
export class TokenCryptoConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "TokenCryptoConfigError";
    this.status = 503;
  }
}

// Resolve the 32-byte key from PAYMENTS_TOKEN_KEY (hex OR base64). Read LAZILY (inside the
// function, not at module load) so the connect flow + tests can set it; throws a 503-shaped
// config error when missing or the wrong length.
function loadKey() {
  const raw = process.env.PAYMENTS_TOKEN_KEY;
  if (!raw) {
    throw new TokenCryptoConfigError(
      "PAYMENTS_TOKEN_KEY is not set — refusing to store a payment token in plaintext",
    );
  }
  const key = /^[0-9a-fA-F]{64}$/.test(raw)
    ? Buffer.from(raw, "hex")
    : Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new TokenCryptoConfigError(
      "PAYMENTS_TOKEN_KEY must be a 32-byte key (64 hex chars, or base64 of 32 bytes)",
    );
  }
  return key;
}

/**
 * encryptToken(plaintext) → "enc:v1:<base64>" | null.
 * null/undefined in → null out (so a null refresh_token stays null, never encrypted).
 * THROWS TokenCryptoConfigError (503-shaped) when PAYMENTS_TOKEN_KEY is missing — we refuse
 * to persist a secret in clear. This only fires inside the MP connect flow.
 */
export function encryptToken(plaintext) {
  if (plaintext == null) return null;
  const key = loadKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(String(plaintext), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

/**
 * decryptToken(stored) → plaintext | null.
 * null/undefined → null. A value WITHOUT the "enc:v1:" prefix is treated as legacy plaintext
 * and returned unchanged (no key needed) — so pre-existing rows + the harness keep working.
 * A prefixed value is decrypted (key required); a tampered ciphertext fails GCM auth and
 * the thrown error propagates (we never return a forged token).
 */
export function decryptToken(stored) {
  if (stored == null) return null;
  if (typeof stored !== "string" || !stored.startsWith(PREFIX)) {
    return stored; // legacy plaintext passthrough — no key required
  }
  const key = loadKey();
  const buf = Buffer.from(stored.slice(PREFIX.length), "base64");
  const iv = buf.subarray(0, IV_BYTES);
  const tag = buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = buf.subarray(IV_BYTES + TAG_BYTES);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
    "utf8",
  );
}
