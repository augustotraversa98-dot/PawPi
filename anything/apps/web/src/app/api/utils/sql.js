import { AsyncLocalStorage } from 'node:async_hooks';
import postgres from 'postgres';
import { observeQuery } from '../../../lib/telemetry/dbMetrics.js';
import { singleFlightEnabled, preparedStatementsAllowed } from './singleFlight.js';

const NullishQueryFunction = () => {
  throw new Error(
    'No database connection string was provided to `postgres()`. Perhaps process.env.DATABASE_URL has not been set'
  );
};
NullishQueryFunction.transaction = () => {
  throw new Error(
    'No database connection string was provided to `postgres()`. Perhaps process.env.DATABASE_URL has not been set'
  );
};

// Standard Postgres (Supabase) via porsager's `postgres` — the tagged-template
// `sql` API is a drop-in for the previous neon() usage at all call sites.
//
// NOTE: we parse DATABASE_URL ourselves and pass the parts explicitly instead of
// letting `postgres(url)` parse it. porsager mishandles Supabase pooler usernames
// that contain a dot (`postgres.<project-ref>`) — it sends just "postgres", which
// fails auth. Passing username/password explicitly avoids that.
// prepare:false keeps us compatible with Supabase's pooler (pgbouncer); REQUEST_SINGLE_FLIGHT turns it on where safe.
//
// SSL defaults to 'require' (Supabase). DATABASE_SSL=disable is an opt-in escape
// hatch for SSL-less Postgres (the embedded integration harness, local dev); it
// does NOT change production, where the env is unset and 'require' stands.
function createSql(connectionString) {
  const u = new URL(connectionString);
  const port = u.port ? Number(u.port) : 5432;
  // REQUEST_SINGLE_FLIGHT (utils/singleFlight.js): with prepare:false every parameterised statement costs TWO
  // network flights (porsager first asks Postgres for the parameter types, waits, then sends the query), and
  // such statements cannot overlap. Named prepared statements remove that, but Supavisor's transaction-mode port
  // (6543) cannot serve them, so they stay off there even when the flag is on.
  const prepare = singleFlightEnabled() && preparedStatementsAllowed(port);
  if (singleFlightEnabled() && !prepare) {
    console.warn('[db] REQUEST_SINGLE_FLIGHT is on but DATABASE_URL uses the transaction-mode pooler port; prepared statements stay off');
  }
  return postgres({
    host: u.hostname,
    port,
    database: u.pathname.replace(/^\//, '') || 'postgres',
    username: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    prepare,
    ssl: process.env.DATABASE_SSL === 'disable' ? false : 'require',
    // PERF (docs/perf-audit-2026-10-23.md, finding 5): porsager's default recycles each connection after a
    // random 30-60 minutes, and every NEW connection costs TCP + TLS + auth + a type-fetch query (~3-5
    // cross-region round trips, ~0.8 s) that lands on whichever user request needed it: 4,700 DISCARD ALL
    // in 87 days of pg_stat_statements. Keep connections for 5-7 h (randomised so a pool never expires at
    // once). keep_alive already defaults to 60 s; pool size (`max`) is deliberately left at the default.
    max_lifetime: 60 * 60 * (5 + Math.random() * 2),
  });
}

// Open a few connections at boot so the first user requests after a deploy do not pay the cold-connection
// cost. Deliberately small: during a deploy the old and the new instance overlap and both draw on the same
// pooler, so warming the full pool could starve the instance that is still serving traffic.
export const BOOT_WARM_CONNECTIONS = 3;

export async function warmPool(client, count = BOOT_WARM_CONNECTIONS) {
  const started = Date.now();
  const results = await Promise.allSettled(
    Array.from({ length: count }, () => client`select 1`)
  );
  return {
    opened: results.filter((r) => r.status === 'fulfilled').length,
    failed: results.filter((r) => r.status === 'rejected').length,
    ms: Date.now() - started,
  };
}

// The global pooled client (or the nullish stub when DATABASE_URL is unset, e.g.
// during some tests). This is the FALLBACK instance used whenever no request-
// scoped transaction is active — startup, migrations, background work, and every
// route that has not (yet) been wrapped with withRequestContext.
export const pool = process.env.DATABASE_URL
  ? createSql(process.env.DATABASE_URL)
  : NullishQueryFunction;

// Production only (never in tests, local dev, cron scripts that opt out, or the embedded integration
// harness); fire-and-forget so it can never delay or fail boot. DB_POOL_WARM=off disables it.
if (
  process.env.DATABASE_URL &&
  process.env.NODE_ENV === 'production' &&
  !process.env.VITEST &&
  process.env.DB_POOL_WARM !== 'off'
) {
  warmPool(pool)
    .then((r) => console.log(`[db] pool warm: ${r.opened} ok, ${r.failed} failed in ${r.ms} ms`))
    .catch(() => {});
}

// RLS R1 — per-request DB identity (docs/rls-hardening.md, provider-design §5).
//
// A request can opt into a transaction-scoped DB identity: withRequestContext
// (utils/requestContext) opens `pool.begin(tx => …)` and stores the porsager
// TRANSACTION handle here, in AsyncLocalStorage, for the duration of the request.
// While that store is active, every `sql\`…\`` call in the handler must run on
// THAT transaction (so it shares the `set_config('app.current_user_id', …, true)`
// the wrapper set) rather than grabbing a fresh pooled connection. The exported
// `sql` proxy below makes that delegation automatic and invisible to call sites.
const requestTxStore = new AsyncLocalStorage();

/** The transaction bound to the current async context, or null if none. */
export function getActiveTx() {
  return requestTxStore.getStore()?.tx ?? null;
}

/** Run `fn` with `tx` bound as the active request transaction (used by the wrapper). */
export function runWithTx(tx, fn) {
  return requestTxStore.run({ tx }, fn);
}

// The instance the current async context should talk to: the request-scoped
// transaction when one is open, otherwise the global pool.
function active() {
  return getActiveTx() ?? pool;
}

// `sql` is a Proxy over the porsager surface so that delegation is transparent:
//   - apply trap  → tagged-template calls:  sql`select …`
//   - get trap    → everything else porsager exposes that the codebase uses:
//                   sql.json(…), sql.unsafe(…), sql.begin(…), sql.end(), etc.
// Each is forwarded to active() (the live transaction or the pool), so a single
// import works identically inside and outside a request context. Methods are
// bound to the instance so porsager's internal `this` stays correct.
//
// Metrics (pawpi_db_*): the Query porsager returns is passed through observeQuery, which only adds a
// duration/error observer to the SAME object (op label from the first SQL keyword, never the text or
// params) — behaviour, laziness, .values()/.cancel()/.execute() and error propagation are unchanged, and
// it can never throw. The query is built OUTSIDE any try so a porsager/stub error still propagates as before.
const sql = new Proxy(function sqlProxy() {}, {
  apply(_target, _thisArg, args) {
    return observeQuery(active()(...args), args[0]);
  },
  get(_target, prop) {
    const instance = active();
    const value = instance[prop];
    if (typeof value !== 'function') return value;
    const bound = value.bind(instance);
    if (prop === 'unsafe') {
      return (...args) => observeQuery(bound(...args), args[0]);
    }
    return bound;
  },
});

export default sql;
