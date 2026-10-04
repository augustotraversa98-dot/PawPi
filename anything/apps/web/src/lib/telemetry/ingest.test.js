import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const otel = vi.hoisted(() => {
  const calls = [];
  const mk = () => (name) => ({
    add: (v, attrs) => calls.push({ name, v, attrs }),
    record: (v, attrs) => calls.push({ name, v, attrs }),
  });
  return { calls, api: { metrics: { getMeter: () => ({ createCounter: mk(), createHistogram: mk() }) } } };
});
vi.mock('@opentelemetry/api', () => otel.api);

import { handleIngest, handleConfig, telemetryConfig, lokiLine, lokiLabels, deps, INSTALL_LIMIT, IP_LIMIT } from './ingest.js';
import { createSlidingWindowLimiter } from './ingestLimiter.js';
import { createLokiShipper } from './loki.js';
import { __resetAppVersionsForTests } from './clientMetrics.js';
import { LIMITS } from './registry.js';
import { PII_KEY_RE } from './ingestSchema.js';
import { POST as routePOST } from '../../app/api/telemetry/events/route.js';
import { GET as routeGET } from '../../app/api/telemetry/config/route.js';

const INSTALL = '3f2b8c1e-9a4d-4e7b-8c55-0d1f2a3b4c5d';
const envelope = (events, over = {}) => ({
  install_id: INSTALL,
  session_id: '0b9a3d1f-6c2e-4d8a-9f10-2a3b4c5d6e7f',
  app_version: '1.4.2',
  build: '25',
  platform: 'ios',
  os_major: '17',
  locale: 'es-AR',
  sent_at: '2026-10-04T12:00:00.000Z',
  events,
  ...over,
});
const GOOD = [
  { name: 'session_start', t: 0, props: { cold: true } },
  { name: 'screen_view', t: 50, props: { screen: '/health' } },
  { name: 'api_call', t: 80, props: { area: 'pets', route: '/api/pets/:id', status_class: '2xx', ms_bucket: 'lt300' } },
];
const post = (body, headers = {}) =>
  new Request('http://localhost/api/telemetry/events', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
const ingestCalls = () => otel.calls.filter((c) => c.name === 'pawpi_telemetry_ingest_total').map((c) => [c.attrs.result, c.v]);

function testDeps(over = {}) {
  const pushed = [];
  return {
    pushed,
    d: {
      installLimiter: createSlidingWindowLimiter({ limit: 5, windowMs: 60_000 }),
      ipLimiter: createSlidingWindowLimiter({ limit: 20, windowMs: 60_000 }),
      shipper: { push: (labels, line) => (pushed.push({ labels, line }), true) },
      env: () => ({}),
      now: () => 0,
      ...over,
    },
  };
}

beforeEach(() => {
  otel.calls.length = 0;
  __resetAppVersionsForTests();
});

describe('POST: happy path', () => {
  it('204; metrics for each accepted event; one Loki line each', async () => {
    const { d, pushed } = testDeps();
    const res = await handleIngest(post(envelope(GOOD)), d);
    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
    expect(ingestCalls()).toEqual([['accepted', 3]]);
    expect(otel.calls.filter((c) => c.name === 'pawpi_client_events_total')).toHaveLength(3);
    expect(otel.calls.some((c) => c.name === 'pawpi_client_sessions_total')).toBe(true);
    expect(otel.calls.some((c) => c.name === 'pawpi_client_api_duration_seconds')).toBe(true);
    expect(pushed).toHaveLength(3);
  });

  it('mixed batch: valid kept, unknown dropped, PII/malformed invalid -- each counted per event', async () => {
    const { d, pushed } = testDeps();
    const events = [
      GOOD[0],
      { name: 'purchase', t: 1, props: {} },
      { name: 'screen_view', t: 1, props: { screen: '/health', email: 'a@b.com' } },
      { name: 'screen_view', t: 1, props: { screen: '/nope' } },
      'garbage',
      GOOD[1],
    ];
    const res = await handleIngest(post(envelope(events)), d);
    expect(res.status).toBe(204);
    expect(Object.fromEntries(ingestCalls())).toEqual({ accepted: 2, dropped: 2, invalid: 2 });
    expect(pushed).toHaveLength(2);
  });

  it('an empty batch is fine', async () => {
    const { d } = testDeps();
    expect((await handleIngest(post(envelope([])), d)).status).toBe(204);
  });
});

describe('POST: envelope / size validation', () => {
  it('invalid JSON / bad envelope -> 400 (counted invalid)', async () => {
    const { d } = testDeps();
    for (const body of ['{nope', '', 'null', '[]', '42', '"x"', '{}', envelope(GOOD, { install_id: 'nope' }), envelope(GOOD, { platform: 'win' }), envelope(GOOD, { events: 'x' })]) {
      const res = await handleIngest(post(body), d);
      expect(res.status, String(body).slice(0, 40)).toBe(400);
      expect((await res.json()).error).toMatch(/^invalid_/);
    }
    expect(otel.calls.every((c) => c.attrs.result === 'invalid')).toBe(true);
  });

  it('more than 50 events -> 400', async () => {
    const { d } = testDeps();
    const res = await handleIngest(post(envelope(Array.from({ length: 51 }, () => GOOD[0]))), d);
    expect(res.status).toBe(400);
    expect((await handleIngest(post(envelope(Array.from({ length: 50 }, () => GOOD[0]))), d)).status).toBe(204);
  });

  it('413 on a huge declared content-length, before parsing', async () => {
    const { d } = testDeps();
    const res = await handleIngest(post('{}', { 'content-length': String(LIMITS.maxBodyBytes + 1) }), d);
    expect(res.status).toBe(413);
  });

  it('413 on an oversize ACTUAL body even when content-length lies or is missing', async () => {
    const { d } = testDeps();
    const big = JSON.stringify(envelope([], { padding: 'x'.repeat(LIMITS.maxBodyBytes + 10) }));
    expect((await handleIngest(post(big), d)).status).toBe(413);
    expect((await handleIngest(post(big, { 'content-length': '10' }), d)).status).toBe(413);
  });

  it('the stream is cancelled once it crosses the limit (not buffered whole)', async () => {
    const { d } = testDeps();
    let pulled = 0;
    const chunk = new TextEncoder().encode('x'.repeat(8 * 1024));
    const stream = new ReadableStream({
      pull(c) {
        if (++pulled > 1000) return c.close();
        c.enqueue(chunk);
      },
    });
    const req = new Request('http://localhost/api/telemetry/events', { method: 'POST', body: stream, duplex: 'half' });
    expect((await handleIngest(req, d)).status).toBe(413);
    expect(pulled).toBeLessThan(20);
  });

  it('a body of exactly the limit is not 413', async () => {
    const { d } = testDeps();
    const base = JSON.stringify(envelope([], { p: '' }));
    const body = JSON.stringify(envelope([], { p: 'x'.repeat(LIMITS.maxBodyBytes - base.length) }));
    expect(Buffer.byteLength(body)).toBe(LIMITS.maxBodyBytes);
    expect((await handleIngest(post(body), d)).status).toBe(204);
  });
});

describe('POST: rate limiting', () => {
  it('per install_id: 429 after the limit, other installs unaffected; counted rate_limited per request', async () => {
    const { d, pushed } = testDeps();
    for (let i = 0; i < 5; i++) expect((await handleIngest(post(envelope(GOOD)), d)).status).toBe(204);
    const limited = await handleIngest(post(envelope(GOOD)), d);
    expect(limited.status).toBe(429);
    expect((await limited.json()).error).toBe('rate_limited');
    expect(ingestCalls().filter(([r]) => r === 'rate_limited')).toEqual([['rate_limited', 1]]);
    expect(pushed).toHaveLength(15); // the limited request recorded nothing
    const other = '8d7c6b5a-4f3e-4a1b-9c2d-1e0f9a8b7c6d';
    expect((await handleIngest(post(envelope(GOOD, { install_id: other })), d)).status).toBe(204);
  });

  it('per IP: many install ids behind one address are still limited; another address is not', async () => {
    const { d } = testDeps();
    const uuid = (i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
    const statuses = [];
    for (let i = 0; i < 25; i++) statuses.push((await handleIngest(post(envelope(GOOD, { install_id: uuid(i) }), { 'x-forwarded-for': '203.0.113.7' }), d)).status);
    expect(statuses.filter((s) => s === 204)).toHaveLength(20);
    expect(statuses.filter((s) => s === 429)).toHaveLength(5);
    expect((await handleIngest(post(envelope(GOOD, { install_id: uuid(99) }), { 'x-forwarded-for': '203.0.113.8' }), d)).status).toBe(204);
  });

  it('the per-IP check runs before the body is parsed (garbage flood is cheap)', async () => {
    const { d } = testDeps({ ipLimiter: createSlidingWindowLimiter({ limit: 1, windowMs: 60_000 }) });
    const h = { 'x-forwarded-for': '198.51.100.1' };
    expect((await handleIngest(post('{nope', h), d)).status).toBe(400);
    expect((await handleIngest(post('{nope', h), d)).status).toBe(429);
  });

  it('limiter maps are bounded and the real limits are sane', () => {
    expect(INSTALL_LIMIT.maxKeys).toBeLessThanOrEqual(50_000);
    expect(IP_LIMIT.maxKeys).toBeLessThanOrEqual(50_000);
    expect(INSTALL_LIMIT.limit).toBeGreaterThanOrEqual(10);
    expect(IP_LIMIT.limit).toBeGreaterThan(INSTALL_LIMIT.limit);
  });
});

describe('kill switch + config', () => {
  it('TELEMETRY_INGEST_ENABLED=false: 204 immediately, nothing recorded or shipped, counted dropped', async () => {
    const { d, pushed } = testDeps({ env: () => ({ TELEMETRY_INGEST_ENABLED: 'false' }) });
    const res = await handleIngest(post('{nope'), d); // not even parsed
    expect(res.status).toBe(204);
    expect(otel.calls).toEqual([{ name: 'pawpi_telemetry_ingest_total', v: 1, attrs: { result: 'dropped' } }]);
    expect(pushed).toHaveLength(0);
  });

  it('any other value leaves ingest on', async () => {
    for (const v of [undefined, '', 'true', '0', 'FALSE']) {
      otel.calls.length = 0;
      const { d, pushed } = testDeps({ env: () => ({ TELEMETRY_INGEST_ENABLED: v }) });
      await handleIngest(post(envelope(GOOD)), d);
      expect(pushed.length, String(v)).toBe(3);
    }
  });

  it('telemetryConfig: enabled flag and sampleRate clamped 0..1, default 1', () => {
    expect(telemetryConfig({})).toEqual({ enabled: true, sampleRate: 1 });
    expect(telemetryConfig({ TELEMETRY_INGEST_ENABLED: 'false' })).toEqual({ enabled: false, sampleRate: 1 });
    expect(telemetryConfig({ TELEMETRY_SAMPLE_RATE: '0.25' }).sampleRate).toBe(0.25);
    expect(telemetryConfig({ TELEMETRY_SAMPLE_RATE: '0' }).sampleRate).toBe(0);
    expect(telemetryConfig({ TELEMETRY_SAMPLE_RATE: '7' }).sampleRate).toBe(1);
    expect(telemetryConfig({ TELEMETRY_SAMPLE_RATE: '-3' }).sampleRate).toBe(0);
    for (const bad of ['abc', 'NaN', '', 'Infinity']) expect(telemetryConfig({ TELEMETRY_SAMPLE_RATE: bad }).sampleRate, bad).toBe(1);
  });

  it('GET /api/telemetry/config: JSON + 5 minute public cache', async () => {
    const res = handleConfig({ ...deps, env: () => ({ TELEMETRY_SAMPLE_RATE: '0.5' }) });
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=300');
    expect(await res.json()).toEqual({ enabled: true, sampleRate: 0.5 });
  });
});

describe('Loki output: no PII', () => {
  const ENV = { install_id: INSTALL, session_id: '0b9a3d1f-6c2e-4d8a-9f10-2a3b4c5d6e7f', app_version: '1.4.2', build: '25', platform: 'ios', os_major: '17', locale: 'es-AR', sent_at: 'x' };
  const BANNED_WORDS = new Set(['ip', 'ips', 'email', 'name', 'user', 'phone', 'address', 'lat', 'lng', 'latitude', 'longitude', 'location', 'text', 'token', 'password', 'handle', 'pet', 'account', 'auth', 'device', 'idfa', 'idfv']);
  const keysOf = (o, out = []) => {
    if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) (out.push(k), keysOf(v, out));
    return out;
  };

  it('labels are ONLY job/event/app_version/platform', () => {
    const labels = lokiLabels({ name: 'tap', t: 1, props: { target: 'back', screen: '/' } }, ENV);
    expect(Object.keys(labels).sort()).toEqual(['app_version', 'event', 'job', 'platform']);
    expect(labels).toEqual({ job: 'pawpi-client', event: 'tap', app_version: '1.4.2', platform: 'ios' });
    expect(lokiLabels({ name: 'tap', props: {} }, { ...ENV, app_version: 'evil@x.com' }).app_version).toBe('other');
  });

  it('a line carries the documented fields and no banned key or IP, even with a hostile request', async () => {
    const shipped = [];
    const fetchImpl = vi.fn((url, init) => (shipped.push(JSON.parse(init.body)), Promise.resolve({ ok: true })));
    const shipper = createLokiShipper({ getConfig: () => ({ url: 'https://l/loki/api/v1/push', user: 'u', token: 't' }), fetchImpl, maxBatch: 1000, flushMs: 100_000 });
    const { d } = testDeps({ shipper });
    await handleIngest(
      post(envelope(GOOD), { 'x-forwarded-for': '203.0.113.99', 'x-real-ip': '203.0.113.98', authorization: 'Bearer secret.jwt.value', cookie: 'sid=abc', 'user-agent': 'Mozilla/5.0 jane' }),
      d,
    );
    await shipper.flush();
    const streams = shipped.flatMap((b) => b.streams);
    const lines = streams.flatMap((s) => s.values.map((v) => v[1]));
    expect(lines).toHaveLength(3);
    for (const s of streams) expect(Object.keys(s.stream).sort()).toEqual(['app_version', 'event', 'job', 'platform']);
    for (const raw of lines) {
      const line = JSON.parse(raw);
      expect(Object.keys(line).sort()).toEqual(['app_version', 'build', 'event', 'install_id', 'locale', 'os_major', 'platform', 'props', 'screen', 'sent_at', 'session_id', 't']);
      for (const key of keysOf(line)) for (const word of key.toLowerCase().split('_')) expect(BANNED_WORDS.has(word), key).toBe(false);
      expect(raw).not.toMatch(/203\.0\.113|secret\.jwt|sid=abc|Mozilla|jane/);
    }
    expect(JSON.stringify(shipped)).not.toMatch(/203\.0\.113/);
  });

  it('lokiLine screen context', () => {
    expect(lokiLine({ name: 'screen_view', t: 1, props: { screen: '/health' } }, ENV).screen).toBe('/health');
    expect(lokiLine({ name: 'nav_unexpected_redirect', t: 1, props: { from: '/services', to: '/onboarding', reason: 'other' } }, ENV).screen).toBe('/services');
    expect(lokiLine({ name: 'opt_out', t: 1, props: {} }, ENV).screen).toBeNull();
  });

  it('the client IP is never logged or emitted', async () => {
    const spies = ['log', 'info', 'warn', 'error', 'debug'].map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    const { d } = testDeps();
    await handleIngest(post(envelope(GOOD), { 'x-forwarded-for': '203.0.113.50' }), d);
    await handleIngest(post('{nope', { 'x-forwarded-for': '203.0.113.50' }), d);
    for (let i = 0; i < 40; i++) await handleIngest(post(envelope(GOOD), { 'x-forwarded-for': '203.0.113.50' }), d); // trips 429s too
    const seen = JSON.stringify([...spies.flatMap((s) => s.mock.calls), otel.calls]);
    expect(seen).not.toContain('203.0.113.50');
    spies.forEach((s) => s.mockRestore());
  });
});

describe('never 5xx', () => {
  const GARBAGE = [
    '', '{', '}', 'null', 'true', '0', '[]', '[[]]', '[null]', '{"events":null}', '{"events":{}}', '"string"', 'undefined', 'NaN', '\u0000\u0001', '{"a":',
    '{"install_id":1e999,"events":[]}', '{"t":1e999}', '{"events":[1e999,-1e999,{"t":1e999,"name":"opt_out"}]}',
    JSON.stringify(envelope([{ name: 'opt_out', t: 1e308, props: {} }])),
    JSON.stringify(envelope([{ name: 'opt_out', t: Number.MAX_SAFE_INTEGER, props: {} }])),
    JSON.stringify(envelope([{ name: 'screen_view', t: 1, props: { screen: { a: { b: { c: [1, 2, { d: 3 }] } } } } }])),
    JSON.stringify(envelope([{ name: 'screen_view', t: 1, props: [[[[[]]]]] }])),
    JSON.stringify(envelope([null, undefined, 1, 'x', [], {}, { name: null }, { name: {}, t: {} }])),
    JSON.stringify(envelope(Array.from({ length: 50 }, () => ({ name: { toString: 1 }, t: 1, props: { __proto__: { x: 1 } } })))),
    '{"__proto__":{"polluted":true},"constructor":{"prototype":{"x":1}},"events":[]}',
    JSON.stringify(envelope([], { os_major: { a: 1 }, build: [], locale: {}, sent_at: {} })),
    '[' .repeat(5000) + ']'.repeat(5000), // deep nesting
    '{"a":'.repeat(2000) + '1' + '}'.repeat(2000),
    '\uD800', 'é'.repeat(1000),
  ];

  it.each(GARBAGE.map((g, i) => [i, JSON.stringify(g.slice(0, 30))]))('garbage #%i %s', async (i) => {
    const { d } = testDeps();
    const res = await handleIngest(post(GARBAGE[i]), d);
    expect(res.status).toBeLessThan(500);
    expect([204, 400, 413, 429]).toContain(res.status);
    expect({}.polluted).toBeUndefined();
  });

  it('a bug inside the handler degrades to 204, not 5xx', async () => {
    const { d } = testDeps({ installLimiter: { hit: () => { throw new Error('boom'); } } });
    const res = await handleIngest(post(envelope(GOOD)), d);
    expect(res.status).toBe(204);
    const { d: d2 } = testDeps({ shipper: { push: () => { throw new Error('loki boom'); } } });
    expect((await handleIngest(post(envelope(GOOD)), d2)).status).toBe(204);
    expect((await handleIngest({ headers: null }, d)).status).toBe(204);
    expect((await handleIngest(undefined, d)).status).toBe(204);
  });

  it('a Loki shipper whose fetch rejects never affects the response', async () => {
    const shipper = createLokiShipper({ getConfig: () => ({ url: 'https://l', user: 'u', token: 't' }), fetchImpl: () => Promise.reject(new Error('down')), maxBatch: 1, flushMs: 5 });
    const { d } = testDeps({ shipper });
    expect((await handleIngest(post(envelope(GOOD)), d)).status).toBe(204);
    await shipper.flush();
  });
});

describe('route files (real deps, env-driven)', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
    deps.installLimiter.clear();
    deps.ipLimiter.clear();
  });

  it('POST /api/telemetry/events: 204 with Loki unset (no-op), 400 on garbage', async () => {
    delete process.env.GRAFANA_LOKI_URL;
    expect((await routePOST(post(envelope(GOOD)))).status).toBe(204);
    expect((await routePOST(post('{nope'))).status).toBe(400);
  });

  it('POST honours TELEMETRY_INGEST_ENABLED=false from process.env', async () => {
    process.env.TELEMETRY_INGEST_ENABLED = 'false';
    const res = await routePOST(post('{nope'));
    expect(res.status).toBe(204);
  });

  it('GET /api/telemetry/config reads process.env', async () => {
    process.env.TELEMETRY_INGEST_ENABLED = 'false';
    process.env.TELEMETRY_SAMPLE_RATE = '0.1';
    const res = await routeGET();
    expect(await res.json()).toEqual({ enabled: false, sampleRate: 0.1 });
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=300');
  });

  it('the route files stay DB-free and PII regex is exported for reuse', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const here = path.dirname(fileURLToPath(import.meta.url));
    for (const p of ['events', 'config']) {
      const src = fs.readFileSync(path.join(here, '../../app/api/telemetry', p, 'route.js'), 'utf8');
      expect(/utils\/sql|requestContext/.test(src)).toBe(false);
    }
    expect(PII_KEY_RE.test('email')).toBe(true);
  });
});
