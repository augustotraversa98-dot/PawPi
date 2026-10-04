import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

// Capture every instrument + call instead of talking to an SDK.
const otel = vi.hoisted(() => {
  const calls = [];
  const make = (kind) => (name) => ({
    add: (v, attrs) => calls.push({ kind, name, v, attrs }),
    record: (v, attrs) => calls.push({ kind, name, v, attrs }),
    addCallback: () => {},
  });
  return {
    calls,
    api: {
      metrics: {
        getMeter: () => ({
          createCounter: make('counter'),
          createHistogram: make('histogram'),
          createObservableGauge: make('gauge'),
        }),
      },
    },
  };
});
vi.mock('@opentelemetry/api', () => otel.api);

import { recordHttpRequest, httpLabels } from './httpMetrics.js';

beforeEach(() => {
  otel.calls.length = 0;
});

// A Hono app shaped like __create/index.ts: catch-all middlewares + an /api sub-app.
function buildApp() {
  const app = new Hono();
  app.onError((_e, c) => c.json({ error: 'x' }, 500)); // quiet, like prod's handler
  const seen = [];
  app.use('*', async (c, next) => {
    await next();
    seen.push({ path: c.req.path, matchedRoutes: c.req.matchedRoutes, status: c.res.status, method: c.req.method });
  });
  app.use('/api/*', async (c, next) => next());
  app.use('/api/auth/*', async (c, next) => next());
  const api = new Hono();
  api.get('/pets/:petId/profile', (c) => c.json({ ok: true }));
  api.get('/pets/:id', (c) => c.json({ ok: true }));
  api.post('/pets', (c) => c.json({ ok: true }, 201));
  api.get('/boom', () => {
    throw new Error('x');
  });
  app.route('/api', api);
  app.get('*', (c) => c.text('spa'));
  return { app, seen };
}

describe('recordHttpRequest', () => {
  it('records the counter + histogram with the matched TEMPLATE (not the raw path)', async () => {
    const { app, seen } = buildApp();
    const res = await app.request('/api/pets/12345/profile?token=secret@x.com');
    expect(res.status).toBe(200);
    const s = seen[0];
    recordHttpRequest({ ...s, seconds: 0.123 });

    const counter = otel.calls.find((c) => c.name === 'pawpi_http_requests_total');
    const hist = otel.calls.find((c) => c.name === 'pawpi_http_request_duration_seconds');
    expect(counter.attrs).toEqual({ area: 'pets', route: '/api/pets/:id/profile', method: 'GET', status_class: '2xx' });
    expect(counter.v).toBe(1);
    expect(hist.attrs).toEqual({ area: 'pets', route: '/api/pets/:id/profile', method: 'GET' });
    expect(hist.v).toBe(0.123);
  });

  it('POST create route + 2xx; area from the template', async () => {
    const { app, seen } = buildApp();
    await app.request('/api/pets', { method: 'POST' });
    recordHttpRequest({ ...seen[0], seconds: 0.01 });
    expect(otel.calls[0].attrs).toEqual({ area: 'pets', route: '/api/pets', method: 'POST', status_class: '2xx' });
  });

  it('SPA pages and assets are bucketed to /__page / area other', async () => {
    const { app, seen } = buildApp();
    await app.request('/account/signin');
    await app.request('/assets/index-9f8e7d6c.js');
    for (const s of seen) recordHttpRequest({ ...s, seconds: 0.001 });
    const attrs = otel.calls.filter((c) => c.name === 'pawpi_http_requests_total').map((c) => c.attrs);
    expect(attrs).toHaveLength(2);
    for (const a of attrs) expect(a).toMatchObject({ area: 'other', route: '/__page', method: 'GET', status_class: '2xx' });
  });

  it('unmatched /api paths are "unmatched" with a 4xx class, whatever the path', async () => {
    const { app, seen } = buildApp();
    // (the fixture's catch-all `app.get('*')` answers GETs, so use POST to reach a real 404)
    const res2 = await app.request('/api/zzz/987654321/anything?email=a@b.com', { method: 'POST' });
    expect(res2.status).toBe(404);
    recordHttpRequest({ ...seen[seen.length - 1], seconds: 0.001 });
    expect(otel.calls[0].attrs).toEqual({ area: 'other', route: 'unmatched', method: 'POST', status_class: '4xx' });
  });

  it('a thrown handler is still recorded (5xx)', async () => {
    const { app, seen } = buildApp();
    const res = await app.request('/api/boom');
    expect(res.status).toBe(500);
    recordHttpRequest({ ...seen[0], seconds: 0.001 });
    expect(otel.calls[0].attrs.status_class).toBe('5xx');
    expect(otel.calls[0].attrs.route).toBe('/api/boom');
  });

  it('never throws, even for garbage input', () => {
    expect(() => recordHttpRequest(undefined)).not.toThrow();
    expect(() => recordHttpRequest({})).not.toThrow();
    expect(() => recordHttpRequest({ method: {}, path: 5, matchedRoutes: 'x', status: 'y', seconds: NaN })).not.toThrow();
  });

  it('skips a non-finite duration but still counts the request', () => {
    recordHttpRequest({ method: 'GET', path: '/api/pets', matchedRoutes: [{ path: '/api/pets' }], status: 200, seconds: NaN });
    expect(otel.calls.map((c) => c.name)).toEqual(['pawpi_http_requests_total']);
  });
});

describe('httpLabels', () => {
  it('derives area from the route template, not the raw path', () => {
    const l = httpLabels({ method: 'GET', path: '/api/pets/1/follow', matchedRoutes: [{ path: '/api/pets/:petId/follow' }], status: 200 });
    expect(l.counter.area).toBe('feed');
  });
});
