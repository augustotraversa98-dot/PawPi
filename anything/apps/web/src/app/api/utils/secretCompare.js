// Constant-time secret comparison for header-gated endpoints (AUDIT_2026-09 A-36).
// `a !== b` short-circuits on the first differing byte, which leaks the match length
// through timing. Length mismatch is decided without touching the bytes; equal-length
// inputs go through crypto.timingSafeEqual.
import crypto from "node:crypto";

export function secretEquals(provided, expected) {
  if (typeof provided !== "string" || typeof expected !== "string" || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
