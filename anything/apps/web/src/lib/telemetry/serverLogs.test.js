// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLokiShipper } from './loki.js';
import { templateFromRoutePath } from './routes.js';
import {
  createServerLogger,
  createTokenBucket,
  levelForStatus,
  logSettingsFromEnv,
  parseLevel,
  redactText,
  LOG_JOB,
  LOG_FIELDS,
  LOG_LABELS,
} from './serverLogs.js';

const LOKI_ENV = { GRAFANA_LOKI_URL: 'https://logs.example.net', GRAFANA_LOKI_USER: '1', GRAFANA_LOKI_TOKEN: 'glc_x' };
const API_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../app/api');

/** Logger wired to a recording fake shipper (no network, no timers). */
function make({ env = LOKI_ENV, random = () => 0, t = { v: 1_700_000_000_000 } } = {}) {
  const pushed = [];
  const stdout = [];
  const shipper = { push: (labels, line) => (pushed.push({ labels, line, obj: JSON.parse(line) }), true) };
  const logger = createServerLogger({
    shipper,
    getEnv: () => env,
    now: () => t.v,
    random,
    writeStdout: (l) => stdout.push(l),
  });
  return { logger, pushed, stdout, t };
}
const req = (over = {}) => ({
  method: 'GET',
  path: '/api/pets/123/profile',
  matchedRoutes: [{ path: '*' }, { path: '/api/pets/:petId/profile' }],
  status: 200,
  durationMs: 12.4,
  requestId: '3f2b8c1e-9a4d-4e7b-8c55-0d1f2a3b4c5d',
  ...over,
});

describe('redactText', () => {
  it.each([
    ['mail jane.doe+x@example.co.uk now', 'jane.doe+x@example.co.uk'],
    ['Authorization: Bearer abc.def-ghi_123~+/=', 'abc.def-ghi_123'],
    ['token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.SflKxwRJSMeKKF2QT4fw', 'eyJhbGciOiJIUzI1NiJ9'],
    ['Basic dXNlcjpwYXNzd29yZA==', 'dXNlcjpwYXNzd29yZA'],
    ['key glc_0123456789abcdef0123456789abcdef0123', '0123456789abcdef0123456789abcdef'],
    ['session 3f2b8c1e-9a4d-4e7b-8c55-0d1f2a3b4c5d', '3f2b8c1e'],
    ['GET /x?token=abc&email=a@b.com', 'token=abc'],
  ])('scrubs %j', (input, secret) => {
    const out = redactText(input);
    expect(out).not.toContain(secret);
    expect(out).not.toMatch(/@[a-z]+\./);
  });

  it('keeps ordinary bounded text, caps length, strips control chars, never throws', () => {
    expect(redactText('GET /api/pets/:id/profile -> 200')).toBe('GET /api/pets/:id/profile -> 200');
    expect(redactText('x'.repeat(10) + ' ' + 'y '.repeat(300)).length).toBeLessThanOrEqual(203);
    expect(redactText('a\nb\u0000c')).toBe('a b c');
    expect(redactText(undefined)).toBe('');
    expect(redactText({ toString() { throw new Error('x'); } })).toBe('[unprintable]');
  });

  it('does not alter ANY real route template (so msg/route stay readable and dashboards keep matching)', () => {
    const files = [];
    (function walk(dir) {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (e.name === 'route.js') files.push(path.relative(path.resolve(API_ROOT, '..'), path.dirname(full)));
      }
    })(API_ROOT);
    expect(files.length).toBeGreaterThan(100);
    for (const rel of files) {
      const tpl = templateFromRoutePath('/' + rel.replace(/\\/g, '/'));
      expect(redactText(tpl), tpl).toBe(tpl);
    }
  });
});

describe('levels', () => {
  it('level by status: 5xx error, 4xx warn, else info', () => {
    expect([200, 204, 302, 304, 0].map(levelForStatus)).toEqual(['info', 'info', 'info', 'info', 'info']);
    expect([400, 401, 404, 429, 499].map(levelForStatus)).toEqual(Array(5).fill('warn'));
    expect([500, 503, 599].map(levelForStatus)).toEqual(Array(3).fill('error'));
  });

  it('LOG_LEVEL: default info, case-insensitive, junk falls back to info', () => {
    expect(parseLevel(undefined)).toBe('info');
    expect(parseLevel('WARN')).toBe('warn');
    expect(parseLevel(' error ')).toBe('error');
    expect(parseLevel('verbose')).toBe('info');
    expect(parseLevel('__proto__')).toBe('info');
  });

  it('the level filter drops lines below LOG_LEVEL', () => {
    const { logger, pushed } = make({ env: { ...LOKI_ENV, LOG_LEVEL: 'warn' } });
    expect(logger.logRequest(req({ status: 200 }))).toBe('level');
    expect(logger.logRequest(req({ status: 404 }))).toBe('shipped');
    expect(logger.logRequest(req({ status: 500 }))).toBe('shipped');
    expect(pushed.map((p) => p.obj.level)).toEqual(['warn', 'error']);
    const e = make({ env: { ...LOKI_ENV, LOG_LEVEL: 'error' } });
    expect(e.logger.logRequest(req({ status: 404 }))).toBe('level');
    expect(e.logger.logRequest(req({ status: 502 }))).toBe('shipped');
  });
});

describe('line schema + labels', () => {
  it('ships exactly {ts,level,msg,route,status,request_id,duration_ms,method} with labels only {job,level,area}', () => {
    const { logger, pushed } = make();
    expect(logger.logRequest(req())).toBe('shipped');
    const { labels, obj } = pushed[0];
    expect(Object.keys(obj)).toEqual(['ts', 'level', 'msg', 'route', 'status', 'request_id', 'duration_ms', 'method']);
    expect(obj).toEqual({
      ts: new Date(1_700_000_000_000).toISOString(),
      level: 'info',
      msg: 'GET /api/pets/:id/profile -> 200',
      route: '/api/pets/:id/profile',
      status: 200,
      request_id: '3f2b8c1e-9a4d-4e7b-8c55-0d1f2a3b4c5d',
      duration_ms: 12,
      method: 'GET',
    });
    expect(labels).toEqual({ job: LOG_JOB, level: 'info', area: 'pets' });
    expect(Object.keys(labels).sort()).toEqual(['area', 'job', 'level']);
    // the constants the coverage guard checks dashboards against are the real schema
    expect(Object.keys(obj)).toEqual([...LOG_FIELDS]);
    expect(Object.keys(labels)).toEqual([...LOG_LABELS]);
  });

  it('labels are valid for the real shipper (job/level/area survive its sanitiser) and nothing else is indexed', async () => {
    const sent = [];
    const shipper = createLokiShipper({
      getConfig: () => ({ url: 'https://l/loki/api/v1/push', user: 'u', token: 't' }),
      fetchImpl: (url, init) => (sent.push(JSON.parse(init.body)), Promise.resolve({ ok: true })),
      flushMs: 1,
    });
    const logger = createServerLogger({ shipper, getEnv: () => LOKI_ENV });
    expect(logger.logRequest(req({ status: 503 }))).toBe('shipped');
    await shipper.flush();
    expect(sent[0].streams[0].stream).toEqual({ area: 'pets', job: 'pawpi-web', level: 'error' });
    expect(JSON.parse(sent[0].streams[0].values[0][1]).level).toBe('error');
  });

  it('route is the TEMPLATE, never the raw path; page traffic is /__page; unknown /api is unmatched', () => {
    const { logger, pushed } = make();
    logger.logRequest(req({ path: '/account/signin', matchedRoutes: [], status: 200 }));
    logger.logRequest(req({ path: '/api/nope/98765', matchedRoutes: [], status: 404 }));
    expect(pushed.map((p) => p.obj.route)).toEqual(['/__page', 'unmatched']);
    expect(pushed[1].labels.area).toBe('other');
  });

  it('NO query string, body, header, cookie, token, email or user id ever reaches the line', () => {
    const { logger, pushed, stdout } = make({ env: { ...LOKI_ENV, LOG_STDOUT: 'true' } });
    const hostile = {
      method: 'POST',
      path: '/api/pets/42/profile?email=jane@example.com&token=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig&access_token=secret',
      matchedRoutes: [{ path: '/api/pets/:petId/profile' }],
      status: 200,
      durationMs: 5,
      requestId: 'jane@example.com',
      // things a careless caller might pass: must never be read
      body: '{"password":"hunter2"}',
      headers: { authorization: 'Bearer abc.def.ghi', cookie: 'session=zzz' },
      query: { email: 'jane@example.com' },
      userId: 777,
    };
    logger.logRequest(hostile);
    const text = pushed[0].line;
    for (const forbidden of ['jane', 'example.com', 'eyJ', 'secret', 'hunter2', 'Bearer', 'session=zzz', 'access_token', '42', '777', '?']) {
      expect(text, forbidden).not.toContain(forbidden);
    }
    expect(pushed[0].obj.request_id).toBeNull(); // an unsafe request id is dropped, not scrubbed
    expect(stdout).toEqual([text]);
  });

  it('request_id keeps only safe tokens', () => {
    const { logger, pushed } = make();
    for (const id of ['abc-123_X', 'a b', '', undefined, 'x'.repeat(65), 'é', '../etc']) logger.logRequest(req({ requestId: id }));
    expect(pushed.map((p) => p.obj.request_id)).toEqual(['abc-123_X', null, null, null, null, null, null]);
  });

  it('weird input yields a valid bounded line, never an exception', () => {
    const { logger, pushed } = make();
    expect(() => logger.logRequest(req({ status: 'abc', durationMs: -5, method: 'BREW' }))).not.toThrow();
    expect(() => logger.logRequest(null)).not.toThrow();
    expect(() => logger.logRequest(undefined)).not.toThrow();
    expect(pushed[0].obj).toMatchObject({ status: 0, duration_ms: 0, method: 'OTHER', level: 'info' });
  });
});

describe('no-op + kill switch', () => {
  it.each([
    ['no Loki env at all', {}],
    ['only the URL', { GRAFANA_LOKI_URL: 'https://l' }],
    ['URL + user but no token', { GRAFANA_LOKI_URL: 'https://l', GRAFANA_LOKI_USER: 'u' }],
    ['LOG_SHIP_ENABLED=false', { ...LOKI_ENV, LOG_SHIP_ENABLED: 'false' }],
    ['LOG_SHIP_ENABLED=FALSE', { ...LOKI_ENV, LOG_SHIP_ENABLED: 'FALSE' }],
  ])('%s -> nothing is built, queued or printed', (_n, env) => {
    const { logger, pushed, stdout } = make({ env });
    expect(logger.logRequest(req({ status: 500 }))).toBe('off');
    expect(pushed).toEqual([]);
    expect(stdout).toEqual([]);
  });

  it('the real default shipper does nothing without env (no timer, no fetch)', async () => {
    const fetchImpl = vi.fn();
    const shipper = createLokiShipper({ getConfig: () => null, fetchImpl, flushMs: 1 });
    const logger = createServerLogger({ shipper, getEnv: () => ({}) });
    logger.logRequest(req());
    await shipper.flush();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(shipper.stats().pending).toBe(0);
  });

  it('LOG_STDOUT=true prints even without Loki (opt-in) and the kill switch only stops shipping, not stdout', () => {
    const { logger, pushed, stdout } = make({ env: { LOG_STDOUT: 'true' } });
    expect(logger.logRequest(req())).toBe('shipped');
    expect(stdout).toHaveLength(1);
    expect(pushed).toEqual([]);
  });

  it('settings parse defensively', () => {
    expect(logSettingsFromEnv({})).toEqual({ shipEnabled: true, level: 'info', sample2xx: 1, maxLinesPerSec: 20, maxErrorLinesPerSec: 50, stdout: false });
    expect(logSettingsFromEnv({ LOG_SAMPLE_2XX: '7', LOG_MAX_LINES_PER_SEC: '-3' })).toMatchObject({ sample2xx: 1, maxLinesPerSec: 0 });
    expect(logSettingsFromEnv({ LOG_SAMPLE_2XX: 'abc', LOG_MAX_LINES_PER_SEC: '' })).toMatchObject({ sample2xx: 1, maxLinesPerSec: 20 });
  });
});

describe('token bucket', () => {
  it('allows the burst, refuses beyond it, refills over time', () => {
    const t = { v: 0 };
    const b = createTokenBucket({ ratePerSec: 2, burst: 4, now: () => t.v });
    expect([1, 2, 3, 4, 5, 6].map(() => b.take())).toEqual([true, true, true, true, false, false]);
    t.v += 500; // +1 token
    expect(b.take()).toBe(true);
    expect(b.take()).toBe(false);
    t.v += 60_000; // refill is capped at burst
    expect([1, 2, 3, 4, 5].map(() => b.take())).toEqual([true, true, true, true, false]);
  });

  it('rate 0 refuses everything; a clock going backwards never mints tokens', () => {
    const t = { v: 1000 };
    expect(createTokenBucket({ ratePerSec: 0, burst: 0, now: () => t.v }).take()).toBe(false);
    const b = createTokenBucket({ ratePerSec: 1, burst: 1, now: () => t.v });
    expect(b.take()).toBe(true);
    t.v = 0;
    expect(b.take()).toBe(false);
  });
});

describe('sampling + rate cap protect the free tier', () => {
  it('LOG_SAMPLE_2XX=0 drops every 2xx/3xx line but ALWAYS ships 4xx/5xx and slow requests', () => {
    const { logger, pushed } = make({ env: { ...LOKI_ENV, LOG_SAMPLE_2XX: '0' }, random: () => 0.5 });
    expect(logger.logRequest(req({ status: 200 }))).toBe('sampled');
    expect(logger.logRequest(req({ status: 304 }))).toBe('sampled');
    expect(logger.logRequest(req({ status: 404 }))).toBe('shipped');
    expect(logger.logRequest(req({ status: 500 }))).toBe('shipped');
    expect(logger.logRequest(req({ status: 200, durationMs: 1500 }))).toBe('shipped'); // slow-request panel stays complete
    expect(pushed).toHaveLength(3);
    expect(logger.stats()).toMatchObject({ sampledOut: 2, shipped: 3 });
  });

  it('fractional sample keeps the configured share', () => {
    let r = 0;
    const { logger, pushed } = make({ env: { ...LOKI_ENV, LOG_SAMPLE_2XX: '0.25', LOG_MAX_LINES_PER_SEC: '1000' }, random: () => (r += 0.1) % 1 });
    for (let i = 0; i < 100; i++) logger.logRequest(req());
    expect(pushed.length).toBeGreaterThan(15);
    expect(pushed.length).toBeLessThan(35);
  });

  it('LOG_MAX_LINES_PER_SEC caps 2xx lines (burst then refill), errors use their own bucket', () => {
    const { logger, pushed, t } = make({ env: { ...LOKI_ENV, LOG_MAX_LINES_PER_SEC: '5' } });
    const results = Array.from({ length: 30 }, () => logger.logRequest(req()));
    expect(results.filter((x) => x === 'shipped')).toHaveLength(10); // burst = 2x rate
    expect(results.filter((x) => x === 'rate')).toHaveLength(20);
    expect(logger.logRequest(req({ status: 500 }))).toBe('shipped'); // not starved by the 2xx flood
    t.v += 1000;
    expect(logger.logRequest(req())).toBe('shipped');
    expect(pushed.length).toBe(12);
    expect(logger.stats().rateLimited).toBe(20);
  });

  it('a 4xx flood (scanner) is capped too, so it can not burn the log quota', () => {
    const { logger } = make({ env: { ...LOKI_ENV, LOG_MAX_ERROR_LINES_PER_SEC: '10' } });
    const out = Array.from({ length: 200 }, () => logger.logRequest(req({ status: 404 })));
    expect(out.filter((x) => x === 'shipped')).toHaveLength(20);
    expect(out.filter((x) => x === 'rate')).toHaveLength(180);
  });
});

describe('bounded buffer', () => {
  it('under a flood the shipper queue never exceeds its cap and the oldest lines are dropped', () => {
    const shipper = createLokiShipper({
      getConfig: () => ({ url: 'https://l/loki/api/v1/push', user: 'u', token: 't' }),
      fetchImpl: () => new Promise(() => {}), // never answers
      maxQueue: 50,
      maxBatch: 1000, // no early flush
      flushMs: 60_000,
    });
    const logger = createServerLogger({ shipper, getEnv: () => ({ ...LOKI_ENV, LOG_MAX_ERROR_LINES_PER_SEC: '1000' }), now: (() => { let n = 0; return () => 1_700_000_000_000 + n++ * 10; })() });
    for (let i = 0; i < 400; i++) logger.logRequest(req({ status: 500 }));
    expect(shipper.stats().pending).toBeLessThanOrEqual(50);
    expect(shipper.stats().dropped).toBeGreaterThan(0);
    shipper.reset();
  });

  it('a shipper that throws can not break the caller', () => {
    const logger = createServerLogger({ shipper: { push: () => { throw new Error('boom'); } }, getEnv: () => LOKI_ENV });
    expect(logger.logRequest(req())).toBe('error');
    expect(logger.stats().errors).toBe(1);
  });
});
