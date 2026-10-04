// Guard: NO metric label value may look unbounded (ids, query strings, emails, uuids, raw paths).
// Drives every label-producing function (route normalizer, area map, status/method buckets, business
// helper, db op classifier) over a battery of hostile inputs and asserts what would reach the exporter.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const otel = vi.hoisted(() => {
  const calls = [];
  const mk = () => (name) => ({
    add: (v, attrs) => calls.push({ name, attrs }),
    record: (v, attrs) => calls.push({ name, attrs }),
    addCallback: () => {},
  });
  return {
    calls,
    api: { metrics: { getMeter: () => ({ createCounter: mk(), createHistogram: mk(), createObservableGauge: mk() }) } },
  };
});
vi.mock('@opentelemetry/api', () => otel.api);

import { AREAS } from './areas.js';
import { recordHttpRequest } from './httpMetrics.js';
import { templateFromRoutePath } from './routes.js';
import { recordBusinessEvent, BUSINESS_EVENTS, BUSINESS_OUTCOMES, BUSINESS_METHODS } from './business.js';
import { classifySqlOp, DB_OPS } from './dbMetrics.js';

const API_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../app/api');

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Why a label value looks unbounded, or null if it is fine. */
function unboundedReason(value) {
  const v = String(value);
  if (v.length > 120) return 'too long';
  if (/[?&=#@%\s]/.test(v)) return 'contains ? & = # @ % or whitespace';
  if (UUID_RE.test(v)) return 'contains a uuid';
  if (v.split('/').some((seg) => /^\d+$/.test(seg))) return 'has a digits-only segment';
  if (/[0-9a-f]{12,}/i.test(v)) return 'contains a long hex run';
  if (/[^\x20-\x7e]/.test(v)) return 'non-ascii / control chars';
  return null;
}

const NASTY_PATHS = [
  '/api/pets/123456/profile',
  '/api/pets/123456/profile?token=eyJhbGciOi&email=jane@example.com',
  '/api/pets/3f2b8c1e-9a4d-4e7b-8c55-0d1f2a3b4c5d/follow',
  '/api/pets/0123456789abcdef0123456789abcdef',
  '/api/providers/public/happy-paws-9',
  '/api/places/ChIJN1t_tDeuEmsRUsoyG83frY4/reviews',
  '/api/users/jane@example.com',
  '/api/zzz/987654321',
  '/api/' + 'a'.repeat(5000),
  '/api/pets/' + 'x'.repeat(5000),
  '/api/pets/%E2%9C%93%00/profile',
  '/api/pets/‮\u0000/profile',
  '/api/auth/callback/google?code=4/0AX4XfWh&state=abc',
  '/assets/index-9f8e7d6c5b4a.js',
  '/account/signin?next=%2Fpets%2F42',
  '/pets/42/profile',
  '/',
  '',
  '/api',
  '/api/../../etc/passwd',
  '/api//pets///1',
  '/api/pets/1;DROP TABLE pets',
];
const NASTY_METHODS = ['GET', 'post', 'PROPFIND', 'x'.repeat(1000), 'a@b.com', '', undefined, 42];
const NASTY_STATUS = [200, 201, 204, 302, 404, 500, 503, 0, 99, 600, -1, NaN, undefined, '200?x=1', 'a@b.com'];

beforeEach(() => {
  otel.calls.length = 0;
});

describe('metric label cardinality', () => {
  it('http labels are bounded for hostile paths/methods/statuses (matched or not)', () => {
    const matchedSets = [
      undefined,
      [],
      [{ path: '*' }, { path: '/api/*' }],
      [{ path: '*' }, { path: '/api/*' }, { path: '/api/pets/:petId/profile' }],
    ];
    for (const p of NASTY_PATHS)
      for (const m of NASTY_METHODS)
        for (const s of NASTY_STATUS)
          for (const matchedRoutes of matchedSets) recordHttpRequest({ method: m, path: p, matchedRoutes, status: s, seconds: 0.01 });

    expect(otel.calls.length).toBeGreaterThan(1000);
    const offenders = new Set();
    const distinct = { area: new Set(), route: new Set(), method: new Set(), status_class: new Set() };
    for (const { attrs } of otel.calls) {
      expect(Object.keys(attrs).every((k) => k in distinct)).toBe(true); // no unexpected label keys
      for (const [k, v] of Object.entries(attrs)) {
        distinct[k].add(v);
        const why = unboundedReason(v);
        if (why) offenders.add(`${k}=${JSON.stringify(v).slice(0, 80)} (${why})`);
      }
      expect(AREAS).toContain(attrs.area);
    }
    expect([...offenders]).toEqual([]);
    // and the value SETS are small, however many hostile inputs went in
    expect(distinct.method.size).toBeLessThanOrEqual(8);
    expect(distinct.status_class.size).toBeLessThanOrEqual(6);
    expect(distinct.route.size).toBeLessThanOrEqual(NASTY_PATHS.length);
  });

  it('every real route template (all route.js files) is a clean label', () => {
    const templates = [];
    (function walk(dir, rel) {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) walk(path.join(dir, e.name), `${rel}/${e.name}`);
        else if (e.name === 'route.js') templates.push(templateFromRoutePath(`/api${rel}`));
      }
    })(API_ROOT, '');
    expect(templates.length).toBeGreaterThan(100);
    const bad = templates.filter((t) => unboundedReason(t) || /\[|\]|\{|\}/.test(t));
    expect(bad).toEqual([]);
  });

  it('business labels only ever come from the closed lists, whatever is passed', () => {
    for (const e of [...BUSINESS_EVENTS, 'x', 'a@b.com', '12345', undefined])
      for (const o of [...BUSINESS_OUTCOMES, 'x', '?', undefined])
        for (const m of [...BUSINESS_METHODS, 'x', 'jane@example.com', undefined]) recordBusinessEvent(e, o, m);
    expect(otel.calls.length).toBeGreaterThan(0);
    for (const { attrs } of otel.calls) {
      expect(BUSINESS_EVENTS).toContain(attrs.event);
      expect(BUSINESS_OUTCOMES).toContain(attrs.outcome);
      expect(BUSINESS_METHODS).toContain(attrs.method);
      for (const v of Object.values(attrs)) expect(unboundedReason(v)).toBeNull();
    }
  });

  it('db op label is always one of the five ops, never SQL', () => {
    const sqls = [
      "select * from users where email = 'a@b.com'",
      'insert into pets values (123456)',
      'x'.repeat(10000),
      "'; drop table users; --",
      '3f2b8c1e-9a4d-4e7b-8c55-0d1f2a3b4c5d',
    ];
    for (const s of sqls) expect(DB_OPS).toContain(classifySqlOp(s));
  });

  it('the checker itself catches unbounded-looking values', () => {
    for (const bad of ['/api/pets/12345', '/api/x?y=1', 'a@b.com', '/api/pets/3f2b8c1e-9a4d-4e7b-8c55-0d1f2a3b4c5d', '/api/pets/0123456789abcdef0123', 'a b']) {
      expect(unboundedReason(bad), bad).not.toBeNull();
    }
    for (const good of ['/api/pets/:id/profile', '/__page', 'unmatched', 'GET', '2xx', 'pets', 'overflow', '/api/auth/*']) {
      expect(unboundedReason(good), good).toBeNull();
    }
  });
});
