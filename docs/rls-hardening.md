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

## R2a — role, helpers, and `pets` policies (first real table)

R2 is delivered table-group by table-group. **R2a** lays the shared foundation — the
non-owner role + the reusable helper functions — and applies policies to the **`pets`
table only**. Remaining groups (health_*, vet records, social, routines, provider tables)
are later R2 tickets (R2b…), each harness-proven the same way.

> ⚠️ **These migrations (`0019`, `0020`) are HARNESS-ONLY.** The integration harness runs
> every migration against a throwaway embedded Postgres, so the role + helpers + `pets`
> policies exist *there* and are proven as `pawpi_app`. They are **NOT applied to
> Supabase** this ticket. **R3** applies the whole accumulated R2 migration set at the
> `DATABASE_URL` cutover to `pawpi_app`. Applying `FORCE RLS` in prod now — while the app
> still connects as the privileged owner and only the R1 *pilot* routes set identity —
> would make every non-identity route read **zero rows** (an outage). RLS is only safe in
> prod once (a) every route sets identity (R1-rollout) **and** (b) the app connects as the
> non-owner role (R3).

### The role — `pawpi_app` (`0019`)

`LOGIN`, **`NOBYPASSRLS`** (a `BYPASSRLS` role would silently defeat every policy), no
`SUPERUSER`/`CREATEDB`/`CREATEROLE`. Least-privilege grants: `USAGE` on schema,
`SELECT/INSERT/UPDATE/DELETE` on tables, `USAGE` on sequences (identity-column inserts) —
no `TRUNCATE`/`REFERENCES`/`TRIGGER`, no DDL. `ALTER DEFAULT PRIVILEGES` keeps future
tables covered. Role creation is guarded by a `DO $$ … $$` catalog check (`CREATE ROLE`
has no `IF NOT EXISTS`) so the migration is idempotent on a fresh DB.

### The helpers (`0019`)

- **`current_app_user_id()`** — `nullif(current_setting('app.current_user_id', true), '')::int`.
  Maps both "never set" and "reset" (`''`) to `NULL`, so any policy comparing against it is
  `NULL`/false when no identity is in scope → **deny by default**. Pure GUC read, plain
  `STABLE` (no `SECURITY DEFINER` needed).
- **`app_provider_has_grant(pet_id, scope DEFAULT NULL)`** — `EXISTS` over `provider_staff`
  (active, `user_profile_id = current_app_user_id()`) joined to `care_access_grants`
  (active, unexpired, optional scope). Mirrors `assertCareAccess`'s grant path.
- **`app_provider_has_booking(pet_id)`** — `EXISTS` over active `provider_staff` joined to
  a non-deleted `vet_appointments` row for the same provider. Mirrors the booking-inbox
  path (which surfaces a pet's *name* to any active staff member, no grant required).

**Why the provider helpers are `SECURITY DEFINER` (+ pinned `search_path`).** They read
`provider_staff` / `care_access_grants` / `vet_appointments`, which get their **own RLS in
later R2 tickets**. Running the membership/grant lookup as the table owner (DEFINER) keeps
it from being re-filtered by those tables' future policies — which would both *under-count*
(a real grant the policy can't see) and risk **infinite policy recursion** (pets policy →
helper → care_access_grants policy → …). `STABLE` lets the planner cache them per-statement.
`SET search_path = public, pg_temp` closes the classic DEFINER search-path-hijack hole.
`EXECUTE` is granted to `pawpi_app` explicitly so a future `REVOKE … FROM PUBLIC` is safe.

> Follow-up caveat for R2b+: when `provider_staff` / `care_access_grants` themselves get
> RLS, they must **not** be `FORCE`-d in a way that re-filters these owner-run helpers (or
> the helpers must run under a `BYPASSRLS` path). The harness will catch a regression here.

### The `pets` policies (`0020`)

`ENABLE` + `FORCE ROW LEVEL SECURITY`, then two permissive policies that mirror the routes
**exactly — no wider**:

- `pets_owner_all` `FOR ALL` — `USING`/`WITH CHECK owner_user_id = current_app_user_id()`.
  The owner reads and writes their own pets (`GET/POST/PATCH /api/pets`, `/api/pets/[id]`
  all scope `WHERE owner_user_id = me`; `WITH CHECK` pins inserts/updates to the caller).
- `pets_provider_read` `FOR SELECT` — `USING (app_provider_has_grant(id) OR
  app_provider_has_booking(id))`. A provider with an active grant (e.g. the notes route's
  `SELECT owner_user_id FROM pets` after its grant check) **or** a booking (the inbox's
  `JOIN pets … AS pet_name`) **reads** the pet. Providers never create/modify pets, so there
  is no provider write policy — a non-owner write simply matches no row / fails `WITH CHECK`.

### Known gap (tracked follow-up, NOT R2a)

`GET /api/pets/[id]/profile` (by id **or** handle) and the social feed's `JOIN pets` expose
a **limited column subset** of *any* pet to any signed-in user — broader than owner + grant
+ booking. RLS is row-level, not column-level, so at R3 those reads would return zero rows
under the `pets` policy above. Reconciling the social-read path (a scoped public-read
predicate, a column-restricted view, or a service-role read) is a tracked R2/R3 follow-up.
R2a is deliberately scoped to the access the pet-management routes enforce today.

### Tests (`test/integration/pets-rls.integration.test.ts`)

Connects a **second** porsager client **as `pawpi_app`** (the real RLS target;
`NOBYPASSRLS`), sets `app.current_user_id` per transaction, and proves on the **real `pets`
table**: owner-only visibility; zero rows with no identity; provider read via active grant
(and zero after revoke / expire / inactive-staff); provider read via booking (and zero when
soft-deleted / unrelated provider); owner write allowed, provider write/delete blocked,
cross-owner insert rejected by `WITH CHECK`. The harness's owner role is a **superuser**, so
`FORCE RLS` constrains only `pawpi_app` — the other integration suites (which connect as the
owner) are unaffected.
