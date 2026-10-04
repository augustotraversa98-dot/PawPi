import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AREAS, areaForPath, KNOWN_API_PREFIXES } from './areas.js';
import { ALLOWED_OTHER_API_DIRS } from '../../observability/coverageGuard.js';

const API_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../app/api');

// The contract's area list (01-TELEMETRY-CONTRACT.md) -- spelled out so a drive-by edit to AREAS fails here.
const CONTRACT_AREAS = [
  'auth', 'pets', 'feed', 'health', 'services', 'providers', 'booking', 'payments', 'shop', 'forum',
  'walks', 'messages', 'training', 'adoption', 'insurance', 'telehealth', 'notifications', 'admin',
  'telemetry', 'other',
];

// Top-level /api dirs that are deliberately 'other' (each with its reason) live in ONE place, shared with the Step E coverage guard.
const ALLOWED_OTHER = ALLOWED_OTHER_API_DIRS;

function routeDirs() {
  // every top-level dir under src/app/api that contains at least one route.js
  const has = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).some((e) =>
      e.isDirectory() ? has(path.join(dir, e.name)) : e.name === 'route.js'
    );
  return fs
    .readdirSync(API_ROOT, { withFileTypes: true })
    .filter((e) => e.isDirectory() && has(path.join(API_ROOT, e.name)))
    .map((e) => e.name);
}

describe('areas', () => {
  it('AREAS is exactly the contract list', () => {
    expect([...AREAS]).toEqual(CONTRACT_AREAS);
  });

  it('every top-level directory under src/app/api maps to a real area (not "other" unless allow-listed)', () => {
    const dirs = routeDirs();
    expect(dirs.length).toBeGreaterThan(40);
    const bad = [];
    for (const dir of dirs) {
      const area = areaForPath(`/api/${dir}/x`);
      expect(AREAS).toContain(area);
      if (area === 'other' && !(dir in ALLOWED_OTHER)) bad.push(dir);
      if (dir in ALLOWED_OTHER) expect(area).toBe('other');
    }
    expect(bad, `map these in src/lib/telemetry/areas.js: ${bad.join(', ')}`).toEqual([]);
  });

  it('every mapped prefix still exists as a directory (no stale entries)', () => {
    const dirs = new Set(fs.readdirSync(API_ROOT));
    // 'telemetry' is reserved for the step-B ingest routes that do not exist yet
    const stale = KNOWN_API_PREFIXES.filter((p) => p !== 'telemetry' && !dirs.has(p));
    expect(stale).toEqual([]);
  });

  it.each([
    ['/api/auth/callback/google', 'auth'],
    ['/api/account/forgot-password', 'auth'],
    ['/api/pets', 'pets'],
    ['/api/pets/:id/profile', 'pets'],
    ['/api/pets/12/follow', 'feed'],
    ['/api/pets/12/telehealth-sessions', 'telehealth'],
    ['/api/pets/12/training-programs', 'training'],
    ['/api/pets/12/walk-pickup-token', 'walks'],
    ['/api/pets/12/shop-checkout', 'shop'],
    ['/api/posts/9/paw', 'feed'],
    ['/api/health/weight-logs', 'health'],
    ['/api/health/deep', 'telemetry'],
    ['/api/providers/3/book', 'booking'],
    ['/api/providers/3/shop-products', 'shop'],
    ['/api/providers/3/insurance-plans', 'insurance'],
    ['/api/providers/3/staff', 'providers'],
    ['/api/providers/public/some-slug', 'providers'],
    ['/api/vet-appointments', 'booking'],
    ['/api/me/bookings/5', 'booking'],
    ['/api/payments/webhooks/mercadopago', 'payments'],
    ['/api/shop/orders', 'shop'],
    ['/api/forum/threads/4/comments', 'forum'],
    ['/api/social-walks', 'walks'],
    ['/api/walk-requests/2', 'walks'],
    ['/api/dm-threads/1/messages', 'messages'],
    ['/api/threads/unread-count', 'messages'],
    ['/api/push-tokens', 'notifications'],
    ['/api/admin/reports', 'admin'],
    ['/api/client-diagnostics', 'telemetry'],
    ['/api/insurance-policies/1', 'insurance'],
    ['/api/adoption/listings', 'adoption'],
    ['/api/training/self-progress', 'training'],
  ])('%s -> %s', (p, area) => {
    expect(areaForPath(p)).toBe(area);
  });

  it('tolerates a query string / hash', () => {
    expect(areaForPath('/api/pets?x=1&email=a@b.com')).toBe('pets');
    expect(areaForPath('/api/pets/1#frag')).toBe('pets');
  });

  it.each([
    '/', '/account/signin', '/assets/index-abc123.js', '/favicon.ico', '/integrations/foo', '/api', '/api/',
    '/api/does-not-exist/1', '/apix/pets', '', undefined, null, 42, {},
  ])('non-API / unknown input %j -> other', (p) => {
    expect(areaForPath(p)).toBe('other');
  });

  it('never returns a value outside AREAS for hostile input', () => {
    for (const p of ['/api/__proto__/x', '/api/constructor', '/api/toString', '/api/hasOwnProperty/x', '/api/pets/../../x']) {
      expect(AREAS).toContain(areaForPath(p));
    }
  });
});
