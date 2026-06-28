// Daily video-moment eligibility — server-authoritative, deterministic, no DB.
//
// Each day a random slice of users is "eligible" to post a video that day; everyone
// else can't (the daily "lucky user" moment). Eligibility is per (user, day): stable
// within a day, re-rolled daily, and never stored — it is COMPUTED from a hash so the
// same (userId, date) always yields the same answer and there is no call-time
// randomness to disagree across the GET probe and the POST enforcement.
//
// Mechanism: sha256(`${userId}:${dateStr}`), take the first 32 bits as an integer,
// mod 100, and compare against the rollout percentage. The hash is uniformly spread,
// so over a population the share of `true` tracks VIDEO_ROLLOUT_PCT. Changing the date
// changes the hash, so the eligible set rotates day to day.
//
// The percentage is config, not code: VIDEO_ROLLOUT_PCT (integer 0–100; default 10
// when unset or invalid). 0 = nobody is ever eligible, 100 = everybody — both fall out
// of the `value < pct` comparison naturally (value is 0–99): `< 0` is never true,
// `< 100` is always true.

import crypto from "node:crypto";

const DEFAULT_ROLLOUT_PCT = 10;

/**
 * The configured rollout percentage as an integer 0–100. Falls back to
 * DEFAULT_ROLLOUT_PCT when VIDEO_ROLLOUT_PCT is unset, non-numeric, or out of range.
 */
export function getRolloutPct() {
  const n = Number.parseInt(process.env.VIDEO_ROLLOUT_PCT ?? "", 10);
  if (!Number.isInteger(n) || n < 0 || n > 100) return DEFAULT_ROLLOUT_PCT;
  return n;
}

/**
 * isVideoEligible(userId, dateStr) -> boolean.
 *
 * Deterministic per (userId, dateStr). `rolloutPct` defaults to the env-configured
 * value; it's exposed as an optional argument purely so tests can sweep the
 * distribution without mutating process.env. The public contract is the 2-arg form.
 */
export function isVideoEligible(userId, dateStr, rolloutPct = getRolloutPct()) {
  const digest = crypto
    .createHash("sha256")
    .update(`${userId}:${dateStr}`)
    .digest("hex");
  const value = parseInt(digest.slice(0, 8), 16) % 100; // 0–99, uniform
  return value < rolloutPct;
}
