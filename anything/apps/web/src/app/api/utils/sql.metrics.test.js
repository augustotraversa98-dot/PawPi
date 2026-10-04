import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

// Real `sql.js` + real porsager, pointed at a closed port: no database, but every code path through the
// Proxy (tagged template, sql.unsafe, sql.json, request-tx delegation) is the production one.
const otel = vi.hoisted(() => {
  const calls = [];
  const make = (kind) => (name) => ({
    add: (v, attrs) => calls.push({ kind, name, attrs }),
    record: (v, attrs) => calls.push({ kind, name, attrs }),
  });
  return {
    calls,
    api: { metrics: { getMeter: () => ({ createCounter: make('counter'), createHistogram: make('histogram') }) } },
  };
});
vi.mock('@opentelemetry/api', () => otel.api);

let sql;
let runWithTx;
let pool;

beforeAll(async () => {
  vi.stubEnv('DATABASE_URL', 'postgres://user:pass@127.0.0.1:1/db');
  vi.stubEnv('DATABASE_SSL', 'disable');
  ({ default: sql, runWithTx, pool } = await import('./sql.js'));
});
afterAll(async () => {
  await pool?.end?.({ timeout: 0 });
  vi.unstubAllEnvs();
});

const ops = (name) => otel.calls.filter((c) => c.name === name).map((c) => c.attrs.op);

describe('sql proxy metrics', () => {
  it('tagged template: lazy, error propagates unchanged, error + duration recorded by op', async () => {
    otel.calls.length = 0;
    const q = sql`select 1 as one`;
    expect(typeof q.values).toBe('function'); // still porsager's Query
    expect(typeof q.cancel).toBe('function');
    expect(otel.calls).toHaveLength(0); // nothing until awaited
    await expect(q).rejects.toMatchObject({ code: 'ECONNREFUSED' });
    expect(ops('pawpi_db_query_duration_seconds')).toEqual(['select']);
    expect(ops('pawpi_db_errors_total')).toEqual(['select']);
  });

  it('sql.unsafe is observed too, op from the SQL string', async () => {
    otel.calls.length = 0;
    await expect(sql.unsafe('update t set a = $1', [1])).rejects.toMatchObject({ code: 'ECONNREFUSED' });
    expect(ops('pawpi_db_errors_total')).toEqual(['update']);
  });

  it('sql.json / helpers still work and are not treated as queries', () => {
    otel.calls.length = 0;
    const json = sql.json({ a: 1 });
    expect(json).toBeDefined();
    expect(otel.calls).toHaveLength(0);
    const helper = sql({ a: 1 }, 'a'); // insert/values helper form
    expect(helper).toBeDefined();
    expect(typeof sql.begin).toBe('function');
    expect(typeof sql.end).toBe('function');
  });

  it('inside a request transaction the call is delegated to the tx and still observed', async () => {
    otel.calls.length = 0;
    const rows = [{ ok: 1 }];
    // a minimal porsager-shaped tx: callable, returns a lazy thenable Query-like with handle()
    const fakeQuery = () => {
      const p = Promise.resolve(rows);
      p.handle = () => {};
      return p;
    };
    const tx = Object.assign((...args) => fakeQuery(...args), { json: (v) => ({ json: v }) });
    const out = await runWithTx(tx, async () => {
      expect(sql.json({ z: 1 })).toEqual({ json: { z: 1 } }); // get-trap delegated to the tx
      return sql`insert into t values (1)`;
    });
    expect(out).toBe(rows);
    expect(ops('pawpi_db_query_duration_seconds')).toEqual(['insert']);
    expect(ops('pawpi_db_errors_total')).toEqual([]);
  });
});
