// RLS R1 — per-request DB identity plumbing (docs/rls-hardening.md, provider-design §5).
//
// This is the "SET LOCAL identity" step of the RLS plan. It is ADDITIVE and
// REVERSIBLE: it does NOT switch DB roles and does NOT add RLS policies to any
// real table, so it cannot change what any user sees. It only makes Postgres
// aware of WHO is calling, so a later ticket (R2) can write policies against it.
//
// Mechanism: open one porsager TRANSACTION per request, set a transaction-local
// GUC `app.current_user_id` to the caller's user_profiles.id, and run the route
// handler inside an AsyncLocalStorage scope so every `sql\`…\`` it issues runs on
// that same transaction (see utils/sql — the `sql` proxy delegates to it).
//
// Transaction-local (`set_config(…, true)`) auto-resets at COMMIT/ROLLBACK, so the
// identity never bleeds onto the next request that reuses the pooled connection
// (proven by the anti-leak integration test).
//
// TRADEOFF: a pooled connection is held for the request's full duration. Fine at
// current scale; revisit before adopting long-lived/streaming responses.

import sql, { getActiveTx, runWithTx } from './sql';
import { isValidAuthUserId } from './authUserId';
import { singleFlightEnabled } from './singleFlight';
import { runSingleFlight, deferIdentityStamp } from './singleFlightTx';
import {
  runWithIdentityScope,
  rememberRequestIdentity,
  getCachedProfileId,
  cacheProfileId,
} from './requestIdentity';

/**
 * Run `fn` inside a SAVEPOINT on the active request transaction, so a query error
 * inside it CANNOT poison the surrounding transaction.
 *
 * Why this exists: a failed query aborts the whole Postgres transaction. A handler
 * that catches the error and returns its own clean Response still loses — the
 * implicit COMMIT at the end of `sql.begin` then fails, and withRequestContext's
 * catch below converts that into a blanket 500, discarding whatever the handler
 * decided to return. For most routes a 500 is the right answer anyway. For a route
 * whose RESPONSE SHAPE IS THE SECURITY PROPERTY it is not: `/api/account/forgot-password`
 * must answer identically whether or not the address has an account, and its
 * token-minting step only runs for accounts that EXIST — so a failure there would
 * mean 500 for real users and 200 for everyone else, i.e. a working
 * account-existence oracle built out of an error path.
 *
 * Wrapping the fallible work in a savepoint means a failure rolls back only to the
 * savepoint; the outer transaction stays committable and the handler's own response
 * is what the client actually receives.
 *
 * Errors are RE-THROWN — this controls transaction scope, not error handling. The
 * caller still needs its own try/catch. Outside a request transaction (unit tests
 * with a mocked `sql`, or an unwrapped caller) there is nothing to protect and `fn`
 * runs directly, so behaviour is unchanged.
 */
export async function withSavepoint(fn) {
  const tx = getActiveTx();
  if (!tx || typeof tx.savepoint !== 'function') {
    return fn();
  }
  // runWithTx REBINDS the async-local handle to the savepoint, so every `sql\`…\`` inside `fn`
  // is issued on it. This is load-bearing, not tidiness: leaving the outer transaction bound
  // means porsager's ROLLBACK TO SAVEPOINT does not recover the connection, the outer COMMIT
  // still fails, and the savepoint buys nothing (verified against real Postgres — the wrapper
  // was landing a 500 over an already-handled error until the rebind was added).
  return tx.savepoint((sp) => runWithTx(sp, fn));
}

/**
 * Set the transaction-local `app.current_user_id` GUC on the active request
 * transaction. No-op when called outside a request context (no active tx).
 * The value is bound as a text parameter (set_config's 2nd arg is text).
 */
export async function setCurrentUserId(userId) {
  const tx = getActiveTx();
  if (!tx || userId == null) return;
  await tx`select set_config('app.current_user_id', ${String(userId)}, true)`;
}

/**
 * Resolve the caller's user_profiles.id from the auth session and stamp it onto
 * the active transaction. Best-effort by design: identity is informational in R1
 * (nothing enforces it yet), so a failure to resolve must never break a request —
 * the route's own auth()/WHERE checks remain the actual gate. auth() is imported
 * lazily so this module stays importable in unit tests that mock the auth stack.
 */
async function applyIdentity() {
  try {
    const { auth } = await import('@/auth');
    const session = await auth();
    const authUserId = session?.user?.id;
    // A non-integer sub must never reach a query (22P02 aborts the whole request tx).
    if (!isValidAuthUserId(authUserId)) return;
    const tx = getActiveTx();
    if (!tx) return;
    // PERF (perf audit 5.2): when this caller's profile id is already known, do NOT wait for the stamp. Queue
    // `set_config` on the request transaction and return: statements on one connection execute in the order
    // they are queued, so the stamp still runs BEFORE the handler's first statement and rides in the same
    // network flight as it (porsager pipelines queued statements), saving one full cross-region round trip.
    // `.catch` is what starts the (lazy) query and keeps a failure from becoming an unhandled rejection; a
    // failed stamp aborts the transaction, so the handler's own statements fail loudly rather than run
    // un-stamped. The id comes from this process's cache of an earlier user_profiles read (requestIdentity).
    const cachedId = getCachedProfileId(authUserId);
    if (cachedId !== null) {
      // REQUEST_SINGLE_FLIGHT: BEGIN has not been sent yet either; the stamp is held and goes out in the same chunk
      // as BEGIN and the handler's first statement (utils/singleFlightTx.js), or never if the handler uses no DB.
      if (deferIdentityStamp(tx, cachedId)) {
        rememberRequestIdentity(authUserId, cachedId);
        return;
      }
      tx`select set_config('app.current_user_id', ${String(cachedId)}, true)`.catch(() => {});
      rememberRequestIdentity(authUserId, cachedId);
      return;
    }
    // ONE round trip: look the profile up and stamp the GUC in the same statement. This used to be a
    // SELECT followed by a separate set_config(), i.e. two sequential cross-region round trips on
    // every request. set_config sits in the select list, so it runs only for the (at most one) row
    // returned — no profile means no stamp, exactly as before. Stamped at the transaction's top
    // level (not inside a savepoint), so it lasts until COMMIT/ROLLBACK like the old two-step did.
    const rows = await tx`
      select id, set_config('app.current_user_id', id::text, true) as stamped
      from user_profiles
      where auth_user_id = ${authUserId}
      limit 1
    `;
    // Let resolveUserId / resolveOrCreateUserId reuse this result instead of repeating the lookup.
    if (rows.length > 0) {
      rememberRequestIdentity(authUserId, rows[0].id);
      cacheProfileId(authUserId, rows[0].id);
    }
  } catch {
    // Identity is non-enforcing in R1; never let resolution failure break the route.
  }
}

/**
 * Higher-order route wrapper: scope the handler's DB work to a single transaction
 * carrying the caller's identity. The handler body is UNCHANGED — it still calls
 * auth() and the same owner-scoped WHERE clauses; we only change HOW its queries
 * are connected, not WHAT they query.
 *
 * Graceful fallback: when no real pool is available (unit tests mock the `sql`
 * module, so `sql.begin` is absent; or DATABASE_URL is unset) the handler runs
 * exactly as before with no transaction — keeping unit behavior byte-identical
 * and this change reversible. We probe `begin` through the default `sql` proxy
 * (the export the unit mocks DO provide) rather than the named `pool`, so the
 * passthrough path never touches an export a mock might omit.
 */
export function withRequestContext(handler, options = {}) {
  const { deferCommit = false } = options;
  return async (request, ctx) => {
    if (typeof sql.begin !== 'function') {
      return handler(request, ctx);
    }
    try {
      // REQUEST_SINGLE_FLIGHT (OFF by default): BEGIN + identity stamp + the handler's statements (+ COMMIT) share
      // network flights instead of each waiting for the previous one. See utils/singleFlightTx.js for the design and
      // the safety argument. `deferCommit` is a per-route opt-in that is ONLY for GET handlers that read: the response
      // is returned without waiting for COMMIT's flight. It is skipped automatically for a request whose statements
      // look like writes (e.g. a lazily created profile). Never opt in a handler that calls a function with side effects.
      if (singleFlightEnabled() && typeof sql.reserve === 'function') {
        return await runSingleFlight(
          () => sql.reserve(),
          (tx) =>
            runWithTx(tx, () =>
              runWithIdentityScope(async () => {
                await applyIdentity();
                return handler(request, ctx);
              })
            ),
          { deferCommit }
        );
      }
      // No tx is active here, so the proxy's `begin` runs on the global pool.
      return await sql.begin((tx) =>
        runWithTx(tx, () =>
          runWithIdentityScope(async () => {
            await applyIdentity();
            return handler(request, ctx);
          })
        )
      );
    } catch (error) {
      // A query error the handler's own try/catch already caught-and-handled
      // (returning its normal clean Response) still leaves the underlying
      // Postgres transaction aborted; sql.begin's implicit COMMIT then fails
      // and re-throws that same error here, past the handler entirely. Catch
      // it so a caught-and-handled query error can never surface as an
      // uncaught exception to the global error handler (which — before this
      // fix — leaked full stack traces/DB internals to the client).
      console.error('[withRequestContext] transaction failed (commit after an aborted tx):', error);
      return Response.json({ error: 'Internal server error' }, { status: 500 });
    }
  };
}

/**
 * Low-level test seam: run `fn` inside a request-scoped transaction WITHOUT auth
 * resolution. Lets integration tests exercise the identity/proxy mechanism with
 * an explicit id (via setCurrentUserId) instead of standing up the auth stack.
 * Not used by application code.
 */
export function withTransaction(fn) {
  return sql.begin((tx) => runWithTx(tx, () => fn(tx)));
}

// Keep the proxy reachable for callers that want the request-aware client.
export { sql };
