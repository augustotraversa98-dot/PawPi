# RLS hardening — implementation notes

Companion to [`provider-design.md` §5](./provider-design.md) (the RLS plan). Tracks the
phased move from the app-layer chokepoint to database-enforced row-level security.

The arc (each phase is independently shippable and reversible):

- **R0 — harness.** A real-Postgres integration harness (`npm run test:integration`):
  embedded Postgres (no Docker), all migrations applied, tests run against a real `sql`.
  Proves owner-scoping + jsonb round-trips against the real engine. _(merged, PR #97)_
- **R1 — per-request identity (this note).** Make the DB aware of *who* is calling, with
  **nothing enforced yet** (still the privileged role, no policies on real tables).
- **R2 — policies + role.** Create the `pawpi_app` non-owner role and `ENABLE` + `FORCE
  ROW LEVEL SECURITY` table-group by group, each proven by an as-`pawpi_app` zero-rows test.
- **R3 — cutover.** Point prod `DATABASE_URL` at `pawpi_app` (RLS live) + cross-boundary sweep.

## R1 — per-request DB identity

**What it does.** Each wrapped request runs its DB work inside a single transaction that
carries the caller's `user_profiles.id` in a transaction-local GUC:

```
set_config('app.current_user_id', <user_profiles.id>, true)   -- true = transaction-local
```

Any query in that unit of work can read it back via
`current_setting('app.current_user_id', true)`. R2's policies will key off
`nullif(current_setting('app.current_user_id', true), '')::int` (the GUC reads back as `''`,
not NULL, once defined on a connection — hence the `nullif`).

**Why it's safe.** Purely additive. No role switch, no `DATABASE_URL` change, no policy on
any real table — so it cannot leak data or change what any user sees. It only stamps an
identity the DB currently ignores. Existing `auth()` + `WHERE owner_user_id` /
`assertCareAccess` checks all remain the actual gate.

### Mechanism (three small pieces)

1. **`utils/sql.js` — the `sql` proxy.** The exported `sql` is a `Proxy` over the porsager
   surface. When a request transaction is active (tracked in `AsyncLocalStorage`) every call
   — tagged templates, `sql.json`, `sql.unsafe`, `sql.begin`, … — delegates to *that*
   transaction; otherwise it falls back to the global pool. Untouched routes therefore behave
   exactly as before (pool fallback). `pool`, `getActiveTx`, `runWithTx` are also exported.
2. **`utils/requestContext.js` — `withRequestContext(handler)`.** Opens `sql.begin(tx => …)`,
   resolves identity (`auth()` → `resolveUserId`) and sets the GUC via `setCurrentUserId`,
   then runs the handler inside the ALS scope. If no real pool is available (unit tests mock
   the `sql` module; or `DATABASE_URL` is unset) it transparently passes through to the
   handler with no transaction — which is why the mocked unit suite stays byte-identical.
3. **GUC reset.** `set_config(..., true)` is transaction-local, so it auto-resets at
   COMMIT/ROLLBACK. The next request reusing the same pooled connection never sees the prior
   id (the anti-leak integration test proves this on the real engine).

### The seam — why a pilot, not a global middleware

A global seam technically exists: `__create/index.ts` / `__create/route-builder.ts` are
git-tracked and hand-maintained (not generated), and `route-builder` dispatches every API
route. We **deliberately did not** wrap there for R1. Doing so would force a per-request
transaction **and** identity resolution onto all ~98 routes at once — including unauthenticated
endpoints, the `/api/auth` handler, and the `/integrations` proxy — and would hold a pooled
connection for every request's full duration (a concern for any future streaming response).
That is the big-bang risk the RLS plan tells us to avoid.

Instead R1 applies `withRequestContext` to a **pilot** of representative routes and leaves
everything else untouched (the proxy's pool fallback keeps them identical):

- `GET/POST/PATCH /api/pets` — owner reads + writes.
- `GET/POST /api/providers` — provider routes resolving identity via `resolveUserId`.

### Rollout plan (follow-up: R1-rollout)

Applying the wrapper to a route is mechanical and per-file:

1. Drop `export` from each `GET/POST/PUT/DELETE/PATCH` declaration (bodies unchanged).
2. `import { withRequestContext } from "@/app/api/utils/requestContext";`
3. Re-export wrapped: `export { withRequestContext(GET) as GET, … }`.

Do this across the remaining routes in batches, keeping `npm test` green each batch. The
duplicate identity resolution (wrapper + handler both call `auth()`/`resolveUserId`) is
acceptable at this scale; a later cleanup can fold identity-setting into `resolveUserId`
itself. Alternatively, once the mechanism is proven in production, the wrapper can be promoted
to a single `route-builder` middleware — but that decision belongs to its own ticket, not the
mechanical rollout.

### Tests (real PG, `npm run test:integration`)

`test/integration/rls-identity.integration.test.ts`:

- **readback** — the GUC is visible to every query in the same unit of work.
- **anti-leak** — after a unit ends, a pool query (and a separate unit) never sees the prior id.
- **proxy fidelity** — tagged templates, `sql.json`, `sql.unsafe` all work through the proxy,
  inside and outside a request context.
- **RLS-capability smoke** — a throwaway `FORCE ROW LEVEL SECURITY` table + non-owner role +
  a `current_setting`-keyed policy returns only the matching owner's rows (and zero with no
  identity). De-risks R2 on this PG18 harness (Supabase runs PG15).
