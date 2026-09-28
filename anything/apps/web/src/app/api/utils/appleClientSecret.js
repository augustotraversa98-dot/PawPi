// appleClientSecret — builds Apple's Sign in with Apple client-secret JWT (ticket N6).
//
// Apple does not accept a static client secret like Google. It must be an ES256 JWT signed
// with a private key downloaded once from the Apple Developer portal (a Sign in with Apple
// key, .p8 format), and Apple caps its lifetime at 6 months (15,777,000 seconds). Hand-pasting
// a pre-built JWT into an env var is a trap: it works today and silently breaks in ~6 months
// with no obvious cause (Apple sign-in just stops working).
//
// This module builds the JWT fresh from the raw key material instead, so it can never go
// stale — oauthProviders.js calls it on every provider-list build. Deliberately synchronous
// (node:crypto's ES256 `sign()` is sync for EC keys) so callers don't need to change from sync
// to async — no new dependency needed either (jose et al. are async-only for signing).

import { createPrivateKey, sign as cryptoSign } from "node:crypto";

const APPLE_AUD = "https://appleid.apple.com";
// 180 days — comfortably under Apple's 6-month (15,777,000s) cap, and irrelevant anyway
// since this is regenerated on every call: there is no stored JWT to go stale.
const APPLE_SECRET_TTL_SECONDS = 15552000;

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

// Normalize PEM key material that arrived through an env var. Railway (and most PaaS
// dashboards / `.env` loaders) store multi-line secrets as a single line with the newlines
// written as the two literal characters backslash-n. node:crypto's PEM parser needs REAL
// newlines, so a flattened value fails with `error:1E08010C:DECODER routines::unsupported`
// — the exact break we hit in production. Convert the escaped forms back to real newlines and
// strip any wrapping quotes a copy-paste may have left. A key that already contains real
// newlines is unchanged (no literal `\n` to replace), so this is safe either way.
export function normalizePem(key) {
  if (typeof key !== "string") return key;
  let out = key.trim();
  // Strip a single pair of wrapping quotes ("...") or ('...') if present.
  if (
    (out.startsWith('"') && out.endsWith('"')) ||
    (out.startsWith("'") && out.endsWith("'"))
  ) {
    out = out.slice(1, -1);
  }
  // Turn escaped CRLF / LF sequences into real newlines. Order matters: handle the
  // escaped-carriage-return + escaped-newline pair before the lone escaped newline.
  out = out.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\\r/g, "\n");
  return out;
}

// teamId: Apple Developer Team ID (10 chars). keyId: the Sign in with Apple key's Key ID
// (10 chars). privateKey: the full .p8 file contents (PEM, "-----BEGIN PRIVATE KEY-----...").
// clientId: the Services ID (same value as AUTH_APPLE_ID). now: unix seconds, injectable for
// tests. Throws on malformed key material — callers decide how to degrade.
export function buildAppleClientSecret({
  teamId,
  keyId,
  privateKey,
  clientId,
  now = Math.floor(Date.now() / 1000),
}) {
  if (!teamId || !keyId || !privateKey || !clientId) {
    throw new Error("buildAppleClientSecret: teamId, keyId, privateKey, and clientId are all required");
  }

  const header = { alg: "ES256", kid: keyId, typ: "JWT" };
  const payload = {
    iss: teamId,
    iat: now,
    exp: now + APPLE_SECRET_TTL_SECONDS,
    aud: APPLE_AUD,
    sub: clientId,
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;

  // Apple's .p8 key is PKCS#8 PEM — node:crypto parses it directly. `dsaEncoding:
  // "ieee-p1363"` is required: JOSE's ES256 wants the raw fixed-length r||s signature, not
  // the DER encoding node:crypto produces by default. normalizePem() first repairs a
  // flattened env value (literal "\n") so a single-line secret can't silently break parsing.
  const key = createPrivateKey(normalizePem(privateKey));
  const signature = cryptoSign("sha256", Buffer.from(signingInput), {
    key,
    dsaEncoding: "ieee-p1363",
  });

  return `${signingInput}.${signature.toString("base64url")}`;
}
