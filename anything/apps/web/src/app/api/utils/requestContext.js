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
import { resolveUserId } from './currentUser';

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
    if (!authUserId) return;
    const userId = await resolveUserId(authUserId);
    await setCurrentUserId(userId);
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
export function withRequestContext(handler) {
  return async (request, ctx) => {
    if (typeof sql.begin !== 'function') {
      return handler(request, ctx);
    }
    try {
      // No tx is active here, so the proxy's `begin` runs on the global pool.
      return await sql.begin((tx) =>
        runWithTx(tx, async () => {
          await applyIdentity();
          return handler(request, ctx);
        })
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
