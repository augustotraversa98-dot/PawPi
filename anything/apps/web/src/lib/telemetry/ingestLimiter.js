// In-memory sliding-window rate limiter for POST /api/telemetry/events (per install_id AND per client IP).
//
// In memory ON PURPOSE: telemetry must never depend on the database, and a few seconds of per-instance slack is
// fine for abuse control. The map is BOUNDED (maxKeys): when full, expired keys are swept and then the oldest
// keys are evicted, so a flood of fake install ids / IPs can use at most a fixed amount of memory (the cost is
// that an evicted key starts a fresh window -- we fail open rather than grow).
//
// PRIVACY: the client IP is NEVER stored, logged or emitted. `ipKey` turns it into a salted SHA-256 prefix held
// only as a key inside the limiter map; the salt is random per process, so the keys are meaningless elsewhere.

import { createHash, randomBytes } from 'node:crypto';

const SALT = randomBytes(16);

/** A salted, truncated hash of the caller's address (or null when it cannot be determined). Never the raw IP. */
export function ipKey(request) {
  try {
    const xff = request?.headers?.get?.('x-forwarded-for');
    let ip = xff ? xff.split(',')[0].trim() : '';
    if (!ip) ip = request?.headers?.get?.('x-real-ip')?.trim() || '';
    if (!ip || ip.length > 64) return null;
    return createHash('sha256').update(SALT).update(ip).digest('hex').slice(0, 16);
  } catch {
    return null;
  }
}

/**
 * @param {{limit: number, windowMs: number, maxKeys?: number, now?: () => number}} opts
 * @returns {{ hit(key: string): boolean, size(): number, clear(): void }}  hit() === false means "over the limit"
 */
export function createSlidingWindowLimiter({ limit, windowMs, maxKeys = 10_000, now = Date.now }) {
  const hits = new Map(); // key -> number[] of timestamps (ascending), at most `limit` long

  function makeRoom(t) {
    for (const [k, ts] of hits) if (ts.length === 0 || t - ts[ts.length - 1] >= windowMs) hits.delete(k);
    // still full: evict oldest-inserted keys (Map iterates in insertion order)
    for (const k of hits.keys()) {
      if (hits.size < maxKeys) break;
      hits.delete(k);
    }
  }

  return {
    hit(key) {
      try {
        if (typeof key !== 'string' || !key) return true; // unknowable subject: do not limit
        const t = now();
        let ts = hits.get(key);
        if (!ts) {
          if (hits.size >= maxKeys) makeRoom(t);
          ts = [];
          hits.set(key, ts);
        }
        while (ts.length && t - ts[0] >= windowMs) ts.shift();
        if (ts.length >= limit) return false; // rejected hits are not recorded: the window drains on its own
        ts.push(t);
        return true;
      } catch {
        return true; // fail open
      }
    },
    size: () => hits.size,
    clear: () => hits.clear(),
  };
}
