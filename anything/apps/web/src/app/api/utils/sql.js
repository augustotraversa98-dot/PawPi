import { AsyncLocalStorage } from 'node:async_hooks';
import postgres from 'postgres';

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
// prepare:false keeps us compatible with Supabase's pooler (pgbouncer).
//
// SSL defaults to 'require' (Supabase). DATABASE_SSL=disable is an opt-in escape
// hatch for SSL-less Postgres (the embedded integration harness, local dev); it
// does NOT change production, where the env is unset and 'require' stands.
function createSql(connectionString) {
  const u = new URL(connectionString);
  return postgres({
    host: u.hostname,
    port: u.port ? Number(u.port) : 5432,
    database: u.pathname.replace(/^\//, '') || 'postgres',
    username: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    prepare: false,
    ssl: process.env.DATABASE_SSL === 'disable' ? false : 'require',
  });
}

// The global pooled client (or the nullish stub when DATABASE_URL is unset, e.g.
// during some tests). This is the FALLBACK instance used whenever no request-
// scoped transaction is active — startup, migrations, background work, and every
// route that has not (yet) been wrapped with withRequestContext.
export const pool = process.env.DATABASE_URL
  ? createSql(process.env.DATABASE_URL)
  : NullishQueryFunction;

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
const sql = new Proxy(function sqlProxy() {}, {
  apply(_target, _thisArg, args) {
    return active()(...args);
  },
  get(_target, prop) {
    const value = active()[prop];
    return typeof value === 'function' ? value.bind(active()) : value;
  },
});

export default sql;
