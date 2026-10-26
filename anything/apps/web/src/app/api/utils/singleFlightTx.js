// Single-flight request transaction (REQUEST_SINGLE_FLIGHT, see utils/singleFlight.js).
//
// WHY: production latency is the number of times a request WAITS for the database, ~133 ms each
// (Railway us-east4 <-> Supabase sa-east-1). `sql.begin` waits for BEGIN alone before it even runs the handler, waits
// for COMMIT alone afterwards, and (prepare:false) waits twice for every parameterised statement. A reserved
// connection has none of that: porsager writes everything queued in the same tick as one TCP chunk, Postgres runs
// the messages in order, and a pooler in session mode relays them (2026-10-26 spike on prod: BEGIN + stamp + 4 reads
// + COMMIT = 1.1 flights, against 8 for the same work through sql.begin with prepare:false).
//
// WHAT THIS DOES, in the order the wire sees it:
//   reserve connection (local, no network when the pool has an idle connection)
//   -> BEGIN is NOT sent yet. It goes out with the handler's FIRST statement, so a request that touches the
//      database zero times (a 401, a validation error) costs zero flights;
//   -> BEGIN, the identity stamp (cached profile id) and the first batch of reads share one chunk;
//   -> COMMIT is queued behind the last statement. On routes that opt in AND ran only reads it is not awaited, so
//      the response leaves without waiting for COMMIT's flight; every other request awaits it exactly as before.
//
// THE SAFETY ARGUMENT (each point is covered by test/integration/single-flight.integration.test.ts):
//   - Identity: the stamp is `set_config('app.current_user_id', $1, true)` (transaction-local, bound parameter) queued
//     BEFORE any handler statement on the same connection, inside the same transaction. A statement can never run
//     ahead of it, and COMMIT/ROLLBACK clears it, so it cannot reach the next request on the connection.
//   - The connection is released to the pool only after COMMIT or ROLLBACK has been ANSWERED.
//   - Errors: the first failed statement outside a savepoint fails the request (rollback + 500) even if the handler
//     caught it, exactly like porsager's `sql.begin`. A failed statement inside withSavepoint is rolled back to its
//     savepoint and stays contained.
//   - Deferred COMMIT is only used when no statement text looks like a write (see WRITE_RE). A false positive just
//     awaits COMMIT; there is no false-negative risk for statements written in this repo as tagged templates, and a
//     route that would hide a write inside a function call must not opt in (documented at withRequestContext).
//   - Values: nothing is interpolated into SQL text. BEGIN/COMMIT/ROLLBACK/SAVEPOINT are fixed strings (savepoint
//     names are generated here); every value is a bound parameter.

const states = new WeakMap(); // handle -> shared request state

// Conservative: anything that could change data, take a lock, or have a side effect.
const WRITE_RE =
  /\b(insert|update|delete|merge|truncate|copy|call|do|create|alter|drop|grant|revoke|lock|nextval|setval|notify|listen|refresh|vacuum|analyze|for\s+(?:no\s+key\s+)?(?:update|share))\b/i;

function textOf(first) {
  if (typeof first === 'string') return first;
  if (Array.isArray(first)) return first.join(' ');
  return '';
}

const isQuery = (q) => q != null && typeof q.then === 'function';

// A statement issued after the connection went back to the pool must NEVER run: the connection may already belong to
// another request (another user's stamp). It rejects instead - and is pre-handled so a fire-and-forget caller that
// never awaits it cannot crash the process with an unhandled rejection.
const USED_AFTER_CLOSE = 'database used after the request finished (its connection was already released)';
function rejectedAfterClose() {
  const rejected = Promise.reject(new Error(USED_AFTER_CLOSE));
  rejected.catch(() => {});
  return rejected;
}

// Observe a porsager Query's settlement WITHOUT starting it (Query.then would dispatch it). Query's species is
// Promise, so the derived promise is a plain one and a rejection is handled here (never "unhandled").
function observe(query, onError) {
  Promise.prototype.then.call(query, undefined, onError);
  return query;
}

/** The shared state of a single-flight handle, or null when `tx` is anything else (porsager tx, mock, null). */
export function singleFlightStateOf(tx) {
  return (tx && states.get(tx)) || null;
}

/**
 * Build the handle that `runWithTx` exposes to `sql`. `conn` is a porsager reserved connection.
 * `shared` is per request; `scope` is per transaction level (the request, or one savepoint).
 */
function makeHandle(conn, shared, scope) {
  const noteStatement = (first) => {
    if (WRITE_RE.test(textOf(first))) shared.wrote = true;
  };
  const track = (q) => observe(q, (e) => (scope.uncaught ??= e));

  const start = () => {
    if (shared.started) return;
    shared.started = true;
    shared.begin = observe(conn.unsafe('begin').execute(), (e) => (shared.beginError ??= e));
    if (shared.pendingStamp != null) {
      const id = shared.pendingStamp;
      shared.pendingStamp = null;
      observe(conn`select set_config('app.current_user_id', ${id}, true)`.execute(), (e) => (shared.root.uncaught ??= e));
    }
  };

  async function savepoint(fn) {
    if (shared.closed) throw new Error(USED_AFTER_CLOSE);
    start();
    const name = `sp${shared.savepoints++}`;
    const child = { uncaught: null };
    // Queued, not awaited: it travels in the same chunk as the statements inside the savepoint.
    observe(conn.unsafe(`savepoint ${name}`).execute(), (e) => (scope.uncaught ??= e));
    const handle = makeHandle(conn, shared, child);
    try {
      const result = await fn(handle);
      if (child.uncaught) throw child.uncaught;
      return result;
    } catch (error) {
      await conn.unsafe(`rollback to ${name}`).execute();
      // Same rule as porsager: an aborted-transaction error (25P02) reports the statement that caused it.
      throw (error?.code === '25P02' && child.uncaught) || error;
    }
  }

  const handle = new Proxy(function singleFlightTx() {}, {
    apply(_target, _this, args) {
      if (shared.closed) return rejectedAfterClose();
      start();
      const query = conn(...args);
      if (isQuery(query)) {
        noteStatement(args[0]);
        track(query);
      }
      return query;
    },
    get(_target, prop) {
      if (prop === 'savepoint') return savepoint;
      const value = conn[prop];
      if (typeof value !== 'function') return value;
      if (prop === 'unsafe') {
        return (text, ...rest) => {
          if (shared.closed) return rejectedAfterClose();
          start();
          noteStatement(text);
          return track(conn.unsafe(text, ...rest));
        };
      }
      return value.bind(conn);
    },
  });
  states.set(handle, shared);
  return handle;
}

/**
 * Run `body(handle)` in a transaction on a reserved connection (see the header). `reserve` is `() => pool.reserve()`.
 * Resolves to whatever `body` resolves to; rejects exactly where `sql.begin` would (handler error, an uncaught
 * statement error, a failed COMMIT).
 *
 * `canDeferCommit(result)` lets the caller veto the deferred COMMIT for a result it cannot vouch for.
 */
export async function runSingleFlight(reserve, body, { deferCommit = false, canDeferCommit = () => true } = {}) {
  const conn = await reserve();
  const root = { uncaught: null };
  const shared = {
    started: false,
    pendingStamp: null,
    wrote: false,
    savepoints: 0,
    closed: false,
    begin: null,
    beginError: null,
    root,
  };
  const handle = makeHandle(conn, shared, root);

  const release = () => {
    shared.closed = true;
    try {
      conn.release();
    } catch {
      // a connection porsager already dropped has nothing to give back
    }
  };
  const rollback = async () => {
    if (!shared.started) return;
    try {
      await conn.unsafe('rollback').execute();
    } catch {
      // the connection is gone or already clean; either way it must not be reused as if it were fine
    }
  };

  let result;
  try {
    result = await body(handle);
    if (shared.beginError) throw shared.beginError;
    if (root.uncaught) throw root.uncaught;
  } catch (error) {
    await rollback();
    release();
    throw error;
  }

  if (!shared.started) {
    release(); // the handler never touched the database: no BEGIN, no COMMIT, no flight
    return result;
  }

  const commit = observe(conn.unsafe('commit').execute(), () => {});
  if (deferCommit && !shared.wrote && canDeferCommit(result)) {
    commit.then(release, async (error) => {
      console.error('[singleFlight] deferred COMMIT failed (read-only request, response already sent):', error?.message);
      await rollback();
      release();
    });
    return result;
  }
  try {
    await commit;
  } catch (error) {
    await rollback();
    release();
    throw error;
  }
  release();
  return result;
}

/**
 * Queue the identity stamp to travel with the first statement (cache hit). Returns false when `tx` is not a
 * single-flight handle, so the caller falls back to its own stamping.
 */
export function deferIdentityStamp(tx, profileId) {
  const shared = singleFlightStateOf(tx);
  if (!shared || shared.started) return false;
  shared.pendingStamp = String(profileId);
  return true;
}
