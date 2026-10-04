import { describe, it, expect } from 'vitest';
import { createSlidingWindowLimiter, ipKey } from './ingestLimiter.js';

const req = (headers) => new Request('http://x/api/telemetry/events', { method: 'POST', headers });

describe('createSlidingWindowLimiter', () => {
  it('allows `limit` hits per window, then rejects, then recovers as the window slides', () => {
    let t = 1000;
    const l = createSlidingWindowLimiter({ limit: 3, windowMs: 1000, now: () => t });
    expect([l.hit('a'), l.hit('a'), l.hit('a'), l.hit('a')]).toEqual([true, true, true, false]);
    expect(l.hit('b')).toBe(true); // keys are independent
    t += 999;
    expect(l.hit('a')).toBe(false); // still inside the window (rejected hits are not recorded)
    t += 2;
    expect(l.hit('a')).toBe(true);
  });

  it('does not limit an unknowable subject', () => {
    const l = createSlidingWindowLimiter({ limit: 1, windowMs: 1000 });
    for (let i = 0; i < 5; i++) expect(l.hit(null)).toBe(true);
    expect(l.hit('')).toBe(true);
    expect(l.size()).toBe(0);
  });

  it('is BOUNDED: a flood of distinct keys never exceeds maxKeys', () => {
    let t = 0;
    const l = createSlidingWindowLimiter({ limit: 2, windowMs: 60_000, maxKeys: 50, now: () => t++ });
    for (let i = 0; i < 5000; i++) {
      expect(l.hit(`k${i}`)).toBe(true);
      expect(l.size()).toBeLessThanOrEqual(50);
    }
    // the newest keys survived eviction and are still limited
    expect(l.hit('k4999')).toBe(true);
    expect(l.hit('k4999')).toBe(false);
  });

  it('sweeps expired keys before evicting live ones', () => {
    let t = 0;
    const l = createSlidingWindowLimiter({ limit: 1, windowMs: 100, maxKeys: 3, now: () => t });
    l.hit('a'); l.hit('b');
    t = 500; // a and b are expired
    l.hit('c'); l.hit('d');
    expect(l.size()).toBeLessThanOrEqual(3);
    expect(l.hit('d')).toBe(false); // d (live) was kept
  });
});

describe('ipKey', () => {
  it('is a salted hash: stable per address, never the address itself', () => {
    const a = ipKey(req({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }));
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(a).toBe(ipKey(req({ 'x-forwarded-for': '203.0.113.7' }))); // first hop only
    expect(a).not.toBe(ipKey(req({ 'x-forwarded-for': '203.0.113.8' })));
    expect(a).not.toContain('203');
    expect(ipKey(req({ 'x-real-ip': '198.51.100.2' }))).toMatch(/^[0-9a-f]{16}$/);
  });

  it('is null (=> not limited) when there is no address', () => {
    expect(ipKey(req({}))).toBeNull();
    expect(ipKey(req({ 'x-forwarded-for': 'x'.repeat(200) }))).toBeNull();
    expect(ipKey(null)).toBeNull();
  });
});
