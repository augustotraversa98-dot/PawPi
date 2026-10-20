import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import {
  stampSessionExpired,
  SESSION_EXPIRED_CODE,
  ERROR_CODE_HEADER,
} from './sessionExpiredCode';

// A tiny app shaped like the real one: the stamp middleware wraps whatever the routes return.
function makeApp() {
  const app = new Hono();
  app.use('/api/*', stampSessionExpired());
  // The standard per-route session guard (~380 routes answer exactly this).
  app.get('/api/pets', (c) => c.json({ error: 'Unauthorized' }, 401));
  // A route that answers 401 with a Response built by hand (as most routes do).
  app.get('/api/native', () => Response.json({ error: 'Unauthorized' }, { status: 401 }));
  app.get('/api/plain', (c) => c.text('nope', 401));
  app.get('/api/ok', (c) => c.json({ ok: true }));
  app.get('/api/forbidden', (c) => c.json({ error: 'Forbidden' }, 403));
  app.post('/api/providers/1/walk-pickup/redeem', (c) =>
    c.json({ error: 'Invalid or expired pickup code' }, 403),
  );
  app.get('/api/auth/token', (c) => c.json({ error: 'Unauthorized' }, 401));
  app.get('/api/internal/grafana-alert', (c) => c.json({ error: 'unauthorized' }, 401));
  app.post('/api/payments/webhooks/binance', (c) => c.json({ error: 'bad signature' }, 401));
  app.post('/api/recalls/ingest', (c) => c.json({ error: 'Unauthorized' }, 401));
  app.get('/api/already', (c) => c.json({ error: 'x', code: 'something_else' }, 401));
  return app;
}

describe('stampSessionExpired', () => {
  const app = makeApp();

  it('adds the code (header + body) to a session 401 and keeps the message', async () => {
    for (const path of ['/api/pets', '/api/native']) {
      const res = await app.request(path);
      expect(res.status).toBe(401);
      expect(res.headers.get(ERROR_CODE_HEADER)).toBe(SESSION_EXPIRED_CODE);
      expect(await res.json()).toEqual({ error: 'Unauthorized', code: 'session_expired' });
    }
  });

  it('stamps the header on a non-JSON 401 and keeps its body', async () => {
    const res = await app.request('/api/plain');
    expect(res.status).toBe(401);
    expect(res.headers.get(ERROR_CODE_HEADER)).toBe('session_expired');
    expect(await res.text()).toBe('nope');
  });

  it('leaves every non-401 response alone (a 403 business error is never a dead session)', async () => {
    for (const [path, status] of [
      ['/api/ok', 200],
      ['/api/forbidden', 403],
    ]) {
      const res = await app.request(path);
      expect(res.status).toBe(status);
      expect(res.headers.get(ERROR_CODE_HEADER)).toBeNull();
      expect(await res.json()).not.toHaveProperty('code');
    }
    const redeem = await app.request('/api/providers/1/walk-pickup/redeem', { method: 'POST' });
    expect(redeem.status).toBe(403);
    expect(redeem.headers.get(ERROR_CODE_HEADER)).toBeNull();
    expect(await redeem.json()).toEqual({ error: 'Invalid or expired pickup code' });
  });

  it('does not stamp machine-credential or sign-in-bridge 401s', async () => {
    const cases = [
      app.request('/api/auth/token'),
      app.request('/api/internal/grafana-alert'),
      app.request('/api/payments/webhooks/binance', { method: 'POST' }),
      app.request('/api/recalls/ingest', { method: 'POST', headers: { 'x-cron-secret': 'wrong' } }),
    ];
    for (const res of await Promise.all(cases)) {
      expect(res.status).toBe(401);
      expect(res.headers.get(ERROR_CODE_HEADER)).toBeNull();
      expect(await res.json()).not.toHaveProperty('code');
    }
  });

  it('never overwrites a code a route already set', async () => {
    const res = await app.request('/api/already');
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe('something_else');
  });
});
