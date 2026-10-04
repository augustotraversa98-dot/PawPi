import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ pool: vi.fn(), gauge: { cb: null } }));
vi.mock('@/app/api/utils/sql', () => ({ pool: h.pool, default: h.pool }));
vi.mock('@opentelemetry/api', () => ({
  metrics: {
    getMeter: () => ({
      createObservableGauge: () => ({ addCallback: (cb) => (h.gauge.cb = cb) }),
    }),
  },
}));

import { runDeepHealth, appVersion } from './healthDeep.js';
import { GET } from '@/app/api/health/deep/route.js';

const gaugeValue = () => {
  let seen = [];
  h.gauge.cb?.({ observe: (v) => seen.push(v) });
  return seen;
};

beforeEach(() => {
  h.pool.mockReset();
  vi.unstubAllEnvs();
});

describe('GET /api/health/deep', () => {
  it('200 { ok, db_ms, version } when select 1 answers; no-store; gauge = 1', async () => {
    vi.stubEnv('RAILWAY_GIT_COMMIT_SHA', 'abcdef0123456789');
    h.pool.mockResolvedValue([{ ok: 1 }]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(['db_ms', 'ok', 'version']);
    expect(body.ok).toBe(true);
    expect(body.version).toBe('abcdef0');
    expect(Number.isInteger(body.db_ms)).toBe(true);
    expect(gaugeValue()).toEqual([1]);
    // the query is a bare `select 1` on the pool (never a request transaction)
    expect(h.pool).toHaveBeenCalledTimes(1);
    expect(h.pool.mock.calls[0][0].join(' ')).toMatch(/select 1/i);
  });

  it('503 { ok:false } when the query rejects; body leaks nothing; gauge = 0', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://user:SuperSecretPw@db.internal.example:5432/pawpi');
    h.pool.mockRejectedValue(new Error('connect ECONNREFUSED db.internal.example:5432 password=SuperSecretPw'));
    const res = await GET();
    expect(res.status).toBe(503);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const text = await res.text();
    const body = JSON.parse(text);
    expect(body.ok).toBe(false);
    expect(Object.keys(body).sort()).toEqual(['db_ms', 'ok', 'version']);
    expect(text).not.toMatch(/SuperSecretPw|db\.internal|ECONNREFUSED|postgres:\/\//);
    expect(gaugeValue()).toEqual([0]);
  });

  it('503 when the pool throws synchronously (DATABASE_URL unset stub)', async () => {
    h.pool.mockImplementation(() => {
      throw new Error('No database connection string was provided');
    });
    const res = await GET();
    expect(res.status).toBe(503);
    expect((await res.json()).ok).toBe(false);
  });

  it('version falls back to "dev"', async () => {
    vi.stubEnv('RAILWAY_GIT_COMMIT_SHA', '');
    h.pool.mockResolvedValue([]);
    expect((await (await GET()).json()).version).toBe('dev');
    expect(appVersion({})).toBe('dev');
    expect(appVersion({ RAILWAY_GIT_COMMIT_SHA: '1234567890' })).toBe('1234567');
  });

  it('needs no auth: the route imports only the probe (no auth stack, sql proxy or request wrapper)', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../app/api/health/deep/route.js');
    const imports = fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.startsWith('import '));
    expect(imports).toEqual(['import { runDeepHealth } from "@/lib/telemetry/healthDeep";']);
  });
});

describe('runDeepHealth timeout', () => {
  it('times out a hung query, cancels it, and reports ok:false', async () => {
    const cancel = vi.fn();
    const hung = Object.assign(new Promise(() => {}), { cancel });
    const t0 = Date.now();
    const r = await runDeepHealth({ query: () => hung, timeoutMs: 30, version: 'v' });
    expect(r.ok).toBe(false);
    expect(r.version).toBe('v');
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('a late rejection of the abandoned query does not become an unhandled rejection', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    let rejectLate;
    const late = new Promise((_, rej) => (rejectLate = rej));
    const r = await runDeepHealth({ query: () => late, timeoutMs: 10 });
    expect(r.ok).toBe(false);
    rejectLate(new Error('late'));
    await new Promise((r2) => setTimeout(r2, 20));
    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });

  it('defaults to a ~3s budget', async () => {
    const { DEEP_HEALTH_TIMEOUT_MS } = await import('./healthDeep.js');
    expect(DEEP_HEALTH_TIMEOUT_MS).toBe(3000);
  });
});
