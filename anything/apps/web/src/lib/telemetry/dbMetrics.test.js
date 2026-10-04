import { describe, it, expect, vi, beforeEach } from 'vitest';

const otel = vi.hoisted(() => {
  const calls = [];
  const make = (kind) => (name) => ({
    add: (v, attrs) => calls.push({ kind, name, v, attrs }),
    record: (v, attrs) => calls.push({ kind, name, v, attrs }),
  });
  return {
    calls,
    api: { metrics: { getMeter: () => ({ createCounter: make('counter'), createHistogram: make('histogram') }) } },
  };
});
vi.mock('@opentelemetry/api', () => otel.api);

// The REAL porsager Query class (what `sql\`...\`` returns): built by an actual `postgres` instance (lazy --
// nothing connects until a query is awaited) and then driven by a fake handler, so no database is needed.
import postgres from 'postgres';
import { classifySqlOp, observeQuery, sqlTextOf, DB_OPS } from './dbMetrics.js';

beforeEach(() => {
  otel.calls.length = 0;
});

const fakeDb = postgres({ host: '127.0.0.1', port: 1, max: 1, prepare: false });
const tpl = (text) => Object.assign([text], { raw: [text] });
function makeQuery(text, behaviour, canceller = () => {}) {
  const q = fakeDb(tpl(text)); // real porsager Query
  const handler = vi.fn((query) => behaviour(query));
  q.handler = handler;
  q.canceller = canceller;
  return { q, handler };
}

describe('classifySqlOp', () => {
  it.each([
    ['select 1', 'select'],
    ['  \n\tSELECT * FROM pets', 'select'],
    ['-- leading comment\nselect 1', 'select'],
    ['/* block */ select 1', 'select'],
    ['(select 1) union (select 2)', 'select'],
    ['INSERT INTO pets (a) values (1)', 'insert'],
    ['update pets set a = 1', 'update'],
    ['DELETE FROM pets', 'delete'],
    ['with x as (select 1) select * from x', 'select'],
    ['with x as (insert into t values (1) returning id) select * from x', 'insert'],
    ['WITH x AS (update t set a=1 returning id) select 1', 'update'],
    ['with x as (delete from t returning id) select 1', 'delete'],
    ["select set_config('app.current_user_id', $1, true)", 'select'],
    ['begin', 'other'],
    ['savepoint s1', 'other'],
    ['create table x()', 'other'],
    ['call foo()', 'other'],
    ['', 'other'],
    ['   ', 'other'],
    ['12345', 'other'],
  ])('%j -> %s', (text, op) => {
    expect(classifySqlOp(text)).toBe(op);
  });

  it('never returns anything outside DB_OPS and never throws', () => {
    for (const v of [undefined, null, 5, {}, [], 'selectx', 'selects 1', "'; drop table x;--", 'x'.repeat(100000)]) {
      expect(DB_OPS).toContain(classifySqlOp(v));
    }
  });

  it('sqlTextOf handles template arrays, strings and helper args', () => {
    expect(sqlTextOf(['select ', ' from x'])).toBe('select   from x');
    expect(sqlTextOf('select 1')).toBe('select 1');
    expect(sqlTextOf({ a: 1 })).toBe('');
    expect(sqlTextOf(undefined)).toBe('');
  });
});

describe('observeQuery', () => {
  it('records duration with the op label on success and returns the SAME object, lazily', async () => {
    const { q, handler } = makeQuery('select * from pets where id = $1', (query) => query.resolve([{ id: 1 }]));
    const returned = observeQuery(q, q.strings);
    expect(returned).toBe(q);
    await new Promise((r) => setTimeout(r, 5));
    expect(handler).not.toHaveBeenCalled(); // still lazy: nothing ran, nothing recorded
    expect(otel.calls).toHaveLength(0);

    const rows = await q;
    expect(rows).toEqual([{ id: 1 }]);
    expect(handler).toHaveBeenCalledTimes(1);
    const dur = otel.calls.filter((c) => c.name === 'pawpi_db_query_duration_seconds');
    expect(dur).toHaveLength(1);
    expect(dur[0].attrs).toEqual({ op: 'select' });
    expect(dur[0].v).toBeGreaterThanOrEqual(0);
    expect(otel.calls.some((c) => c.name === 'pawpi_db_errors_total')).toBe(false);
  });

  it('counts errors by op, propagates the SAME error, and does not leak an unhandled rejection', async () => {
    const boom = Object.assign(new Error('duplicate key'), { code: '23505' });
    const { q } = makeQuery('INSERT INTO pets (a) values (1)', (query) => query.reject(boom));
    observeQuery(q, q.strings);
    await expect(q).rejects.toBe(boom);
    expect(otel.calls.find((c) => c.name === 'pawpi_db_errors_total').attrs).toEqual({ op: 'insert' });
    expect(otel.calls.find((c) => c.name === 'pawpi_db_query_duration_seconds').attrs).toEqual({ op: 'insert' });
  });

  it('.catch() and .finally() chains behave identically and record once', async () => {
    const boom = new Error('x');
    const { q } = makeQuery('update t set a = 1', (query) => query.reject(boom));
    observeQuery(q, q.strings);
    let caught;
    let finalised = false;
    await q.catch((e) => {
      caught = e;
    }).finally(() => {
      finalised = true;
    });
    expect(caught).toBe(boom);
    expect(finalised).toBe(true);
    expect(otel.calls.filter((c) => c.name === 'pawpi_db_errors_total')).toHaveLength(1);
  });

  it('awaiting the same query twice records once and resolves both', async () => {
    const { q } = makeQuery('delete from t', (query) => query.resolve([]));
    observeQuery(q, q.strings);
    await q;
    await q;
    expect(otel.calls.filter((c) => c.name === 'pawpi_db_query_duration_seconds')).toHaveLength(1);
  });

  it('keeps the porsager chainables working (values(), execute(), cancel())', async () => {
    const canceller = vi.fn();
    const { q } = makeQuery('select 1', (query) => query.resolve([[1]]), canceller);
    observeQuery(q, q.strings);
    expect(q.values()).toBe(q);
    expect(q.isRaw).toBe('values');
    expect(q.execute()).toBe(q);
    await expect(q).resolves.toEqual([[1]]);
    q.cancel();
    expect(canceller).toHaveBeenCalledTimes(1);
  });

  it('works for sql.unsafe-style string text', async () => {
    const q = fakeDb.unsafe('delete from t where x = $1', [1]); // real unsafe() Query
    q.handler = (query) => query.resolve([]);
    observeQuery(q, 'delete from t where x = $1');
    await q;
    expect(otel.calls.find((c) => c.name === 'pawpi_db_query_duration_seconds').attrs).toEqual({ op: 'delete' });
  });

  it('never uses the SQL text or params as a label', async () => {
    const { q } = makeQuery("select * from users where email = 'a@b.com'", (query) => query.resolve([]));
    observeQuery(q, q.strings);
    await q;
    for (const c of otel.calls) expect(Object.keys(c.attrs)).toEqual(['op']);
  });

  it('passes non-Query values through untouched (helpers, fragments, stubs)', () => {
    const helper = { value: [1, 2], columns: [] };
    expect(observeQuery(helper, [])).toBe(helper);
    expect(observeQuery(undefined, 'x')).toBeUndefined();
    expect(observeQuery(null, 'x')).toBeNull();
    const plain = Promise.resolve([1]); // a thenable without porsager's handle(): left alone
    expect(observeQuery(plain, 'select 1')).toBe(plain);
    expect(plain.then).toBe(Promise.prototype.then);
  });

  it('a throwing metric backend can never break the query', async () => {
    otel.api.metrics.getMeter(); // (instruments already created; make them throw from here on)
    const orig = otel.calls.push;
    otel.calls.push = () => {
      throw new Error('exporter exploded');
    };
    try {
      const { q } = makeQuery('select 1', (query) => query.resolve([{ ok: 1 }]));
      observeQuery(q, q.strings);
      await expect(q).resolves.toEqual([{ ok: 1 }]);
      const { q: q2 } = makeQuery('select 1', (query) => query.reject(new Error('real')));
      observeQuery(q2, q2.strings);
      await expect(q2).rejects.toThrow('real');
    } finally {
      otel.calls.push = orig;
    }
  });
});
