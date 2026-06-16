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

> Updated by **R2b** (below): the provider-read tests were removed and the read tests
> rewritten to the corrected any-authed rule. This file now proves pets **read = any authed,
> write = owner only**.

## R2b — social / public-read tables (`posts`, `post_paws`, `post_barks`, `pet_follows`, `pet_friendships`)

**The framework — social vs private.** PawPi is a social app. Two opposite access shapes run
through it, and R2 handles them as distinct table groups:

- **Social / public-read** (this ticket): any **logged-in** user may *read* the data — they
  view other pets' profiles and see other pets' posts in the global "Suggested" feed — but
  only the **actor** may *write* their own rows. Read predicate is simply
  `current_app_user_id() IS NOT NULL` ("any authenticated user"); `NULL` (no identity) → deny.
- **Private / medical** (R2c, later): strict **owner**, or a provider with an active
  scope-covering **grant**. The real leak-protection group.

Mirroring this is the whole point of R2 — the policies must match what the routes already do,
no wider. The route SQL was read directly (`/api/posts`, `/api/posts/[id]/paw`,
`/api/posts/[id]/barks`, `/api/pets/[id]/follow`, `/api/pets/[id]/profile`,
`/api/social-walks`) to pin each predicate.

### The `pets` read-rule CORRECTION (closing the R2a gap)

R2a flagged it explicitly: `GET /api/pets/[id]/profile` (by id **or** handle) and the feed's
`JOIN pets` expose any pet to **any signed-in user** — broader than owner + grant + booking.
Under R2a's `pets_provider_read` those reads would return **zero rows** at the R3 cutover (an
outage of the social surface). R2b fixes it: **drop** `pets_provider_read` (subsumed) and add

```
pets_authed_read  FOR SELECT  USING (current_app_user_id() IS NOT NULL)
```

`pets_owner_all` (the `FOR ALL` owner policy) is **untouched**, so writes stay owner-only;
permissive `SELECT` policies OR together, so the effective access becomes **read = any authed,
insert/update/delete = owner only**. The `app_provider_has_grant` / `app_provider_has_booking`
helpers **remain defined** — no pets policy uses them now; they gate the **medical** tables in
R2c.

### The per-table model (`0021_rls_social.sql`)

Each table gets `ENABLE` + `FORCE ROW LEVEL SECURITY`. DML + sequence grants are already
provided by `0019`'s blanket `GRANT … ON ALL TABLES` + `GRANT USAGE ON ALL SEQUENCES` (these
tables predate `0019`), exactly as `pets` (`0020`) relied on — no per-table re-grant; the
as-`pawpi_app` test is the proof the grants suffice.

| Table | Read | Write |
|---|---|---|
| `posts` | any authed (global feed + profile grids) | author — `user_id = current_app_user_id()` |
| `post_paws` | any authed (counts / `user_has_pawed`) | actor — `user_id = current_app_user_id()` (INSERT/DELETE) |
| `post_barks` | any authed (comments + counts) | author — `user_id = current_app_user_id()` (`pet_id` is nullable/legacy, **not** gated) |
| `pet_follows` | any authed (follower/following counts, `isFollowing`, feed subqueries) | owner of the **follower** pet — `EXISTS (pets WHERE id = follower_pet_id AND owner_user_id = me)` (INSERT/DELETE) |
| `pet_friendships` | **participant only** — `requester_user_id = me OR receiver_user_id = me` | same participant predicate (`WITH CHECK`) |

The author/actor tables use the same two-policy shape as `pets`: a broad `FOR SELECT`
any-authed read policy + a `FOR ALL` actor policy (`USING`/`WITH CHECK user_id = me`). Because
the read policy is `SELECT`-only, `INSERT`/`UPDATE`/`DELETE` are governed solely by the actor
policy → writes stay actor-scoped while reads are public-within-the-app.

`pet_follows` is the one table whose write predicate reaches another table: it `EXISTS`-checks
`pets` for ownership of the **follower** pet. That subquery runs under `pets`' RLS as
`pawpi_app`, but the follower pet is always the caller's **own** pet → visible via
`pets_owner_all`, so **no `SECURITY DEFINER` helper is needed** (unlike the provider helpers,
which must see *other* owners' grant rows).

`pet_friendships` is **not** public: the only app usage (`social-walks` GET, `friends_only`)
reads friendships where one of the caller's pets participates. There is **no friendship write
route** today, so the policy is a single participant-scoped `FOR ALL` (the safe default — once
`FORCE RLS` is on, the table must not be left un-policied). A non-participant reads and writes
zero.

### Tests (`test/integration/social-rls.integration.test.ts` + updated `pets-rls`)

`social-rls` connects as `pawpi_app` and proves, per table: any authed user reads any row;
the author/actor (and only them) writes/edits/deletes their own; a forged-`user_id` write is
rejected by `WITH CHECK`; no identity → zero. `pet_follows`: the follower pet's owner can
follow/unfollow, a non-owner of the follower pet cannot; `pet_friendships`: participant access
only, a non-participant sees/writes zero. The headline pets gap-closed proof (non-owner reads
any pet; writes stay owner-only) lives here; the exhaustive pets matrix lives in the updated
`pets-rls.integration.test.ts`.

> ⚠️ **`0021` is HARNESS-ONLY** — proven in the embedded-Postgres harness, **NOT applied to
> Supabase**. R3 applies the whole accumulated R2 set at the `DATABASE_URL` cutover to
> `pawpi_app`. (Same rule as R2a; see the warning under §R2a.)

## R2c — owner-only PRIVATE tables (health logs, vet-record extras, scheduling)

The other half of R2b's framework: the **PRIVATE** group. A pet's health and scheduling
data is read **and** written **only by the owner** — there is **no** any-authed read and
**no** provider access on **any** of these tables today. The predicate is **uniform** across
the whole group:

```
<table>_owner_all  FOR ALL  USING / WITH CHECK  owner_user_id = current_app_user_id()
```

`current_app_user_id()` (0019) returns the caller's `user_profiles.id`, `NULL` when unset →
the `int` comparison is `NULL`/false → **deny by default** (no identity reads/writes zero).
This mirrors the routes exactly: every read/write of these tables is scoped
`WHERE owner_user_id = me`, and no route exposes them to a provider or another user.

### The tables (`0022_rls_owner_private.sql`)

Nineteen tables, all with `owner_user_id integer NOT NULL → user_profiles(id)`:

- **Health logs (0008)** — `health_food_logs`, `health_general_checks`,
  `health_medical_care_logs`, `health_mobility_logs`, `health_pee_logs`,
  `health_photo_checks`, `health_poo_logs`, `health_vomit_logs`, `health_walk_logs`,
  `health_weight_logs`, `health_wellness_logs`, `health_timeline_events`.
- **Vet-record extras (0005)** — `pet_allergies`, `pet_conditions`, `pet_lab_results`,
  `pet_surgeries`, `vet_documents`. (These are **not** the provider-readable medical records;
  `pet_medical_profiles` / `vet_notes` / `pet_vaccinations` are R2d.)
- **Scheduling** — `routines` (0006), `reminder_dismissals` (0011).

Because the policy is identical for every table, the migration applies it in a
`DO $$ … FOREACH … EXECUTE format(...) … $$` loop over the table-name array — one source of
truth for the predicate, impossible for one table to drift from another. DML + sequence
grants come from 0019's blanket grants (these tables predate 0019); no per-table re-grant.

### Provider exclusion is the point

The provider record route reads **only** `pet_medical_profiles` / `vet_notes` /
`pet_vaccinations` (R2d) — **none** of the tables above. So a provider, **even with an active
care grant**, must get **zero rows** from these tables. The grant/booking helpers (0019) are
deliberately **not** referenced here; they gate the R2d medical-record tables. The integration
test proves this directly: a provider-staff user holding an active `medical_read` grant for
A's pet (the helper returns `true`) still reads zero rows from the health/routine/allergy
tables.

### Future-provider note (do NOT build it here)

The care-access scope set includes `health_logs_read` / `health_logs_write`, intended for a
**future** provider type — e.g. a walker writing walk logs, a groomer writing coat notes. But
**no route grants providers access to the `health_*` tables today**, so they are owner-only
**now**. When such a route ships, **that feature's ticket** updates the relevant policy (e.g.
adds an `app_provider_has_grant(pet_id, 'health_logs_read'/'…write')` branch). R2c does not
pre-build it.

### Tests (`test/integration/owner-private-rls.integration.test.ts`)

Connects as `pawpi_app` and proves, using three representative tables (a health log, a
routine, a vet-record extra): the owner reads/writes only their own rows; a non-owner sees
zero and cannot update/delete/insert-as-owner (`WITH CHECK`); no identity → zero; and the
headline **provider-with-grant exclusion** (active `medical_read` grant → still zero
read **and** zero write). A **catalog check** then loops over the full 19-table list and
asserts each has `relrowsecurity` + `relforcerowsecurity` true and a `<table>_owner_all`
policy present — so no table is left un-policied under `FORCE` (which would silently deny all
access) and the migration covered the whole list.

> ⚠️ **`0022` is HARNESS-ONLY** — proven in the embedded-Postgres harness, **NOT applied to
> Supabase**. R3 applies the whole accumulated R2 set at the `DATABASE_URL` cutover to
> `pawpi_app`. (Same rule as R2a; see the warning under §R2a.)

## R2d — provider-accessible records (`pet_medical_profiles`, `vet_notes`, `pet_vaccinations`, `vet_appointments`)

The third shape, distinct from R2b (public read) and R2c (owner-only): the group where a
provider's access is **real**. Because a provider may **read** more than they may **write**
(and on the bookings table not at all by grant), READ and WRITE scopes **differ per table**,
so the policies are **split per command** rather than the single uniform `FOR ALL` of R2c.

**The shape.** Every table keeps the owner's full access as one `FOR ALL` owner policy
(`USING`/`WITH CHECK owner_user_id = current_app_user_id()`). Permissive policies OR together
**per command**, so adding a provider `FOR SELECT` / `FOR INSERT` / `FOR UPDATE` policy widens
**only that command** for the provider and leaves the rest owner-only. This is the same
two-tier pattern as `pets` (R2a): one owner `FOR ALL` + narrow provider command policies.

**Mirrors the routes exactly — no wider.** The route SQL was read directly to pin each
predicate (`providers/[id]/pets/[petId]/record` → `medical_read` SELECTs profile + notes +
vaccinations; `.../notes` → `medical_write` INSERTs `vet_notes`; `.../vaccinations` →
`vaccinations_write` INSERTs `pet_vaccinations`; the bookings `inbox`/`[appointmentId]` →
active staff SELECT/UPDATE of `vet_appointments WHERE provider_id`; owner `book` + owner
`vet-appointments` routes → owner INSERT/UPDATE/(soft-)delete):

| Table | SELECT | INSERT | UPDATE / DELETE |
|---|---|---|---|
| `pet_medical_profiles` | owner OR `grant(medical_read)` | owner only | owner only |
| `vet_notes` | owner OR `grant(medical_read)` | owner OR `grant(medical_write)` | owner only |
| `pet_vaccinations` | owner OR `grant(medical_read)` | owner OR `grant(vaccinations_write)` | owner only |
| `vet_appointments` | owner OR `staff_of(provider_id)` | owner only | UPDATE: owner OR `staff_of(provider_id)`; DELETE: owner only |

The medical three reuse the existing `app_provider_has_grant(pet_id, scope)` helper (0019),
matching `assertCareAccess`'s per-scope check. No provider route writes `pet_medical_profiles`,
so it has no provider write policy. The owner `pet_vaccinations` write-through path (the
medical-care-logs reconciliation that inserts vaccinations in **owner** context) is the owner
`INSERT` branch and is unaffected.

### The new helper — `app_is_active_staff_of(provider_id)` (`0023`)

`vet_appointments` is the **hybrid**: a provider reaches a booking by **active staff
membership of the row's `provider_id`** — the booking inbox/actions authorize with
`requireProviderRole`/`ALL_PROVIDER_ROLES` (active staff, **any** role), **not** a care grant.
So the predicate is a new helper, the booking analogue of `app_provider_has_grant`:

```
app_is_active_staff_of(p_provider_id) → EXISTS provider_staff
  WHERE provider_id = p_provider_id AND user_profile_id = current_app_user_id()
    AND status = 'active'
```

`SECURITY DEFINER` + pinned `search_path = public, pg_temp` + `STABLE`, exactly like 0019's
provider helpers and for the same reason: it reads `provider_staff`, which gets its own RLS in
**R2e**, so running it as the table owner keeps it from being re-filtered by that future policy
(under-count) and avoids policy recursion (`vet_appointments` policy → helper →
`provider_staff` policy → …). `EXECUTE` is granted to `pawpi_app` explicitly.

The **grant-vs-membership distinction** is the point of the bookings split: a provider with an
active care **grant** but **no staff membership** of the booking's provider sees **zero**
appointments, and a staff member of a **different** provider sees only **their** provider's
bookings. Providers never INSERT an appointment (the owner books; the `provider_id` on the row
is the *target*) and never DELETE one (they cancel via a `booking_status` UPDATE) — so both are
owner-only, matching the routes.

DML + sequence grants come from 0019's blanket grants (all four tables predate 0019). The
helpers from 0019 are reused unchanged.

### Tests (`test/integration/provider-records-rls.integration.test.ts`)

Connects as `pawpi_app` and proves, per table: owner reads/writes only their own rows; a
provider with the relevant active grant reads (and, where the route allows, INSERTs onto the
owner's record) but cannot UPDATE/DELETE; a read-only grant is rejected at the INSERT
`WITH CHECK`; no grant / no identity → zero. For `vet_appointments`: active staff SELECT (inbox)
+ UPDATE (booking_status); staff of a different provider, a grant-but-not-staff provider, and a
different owner each see zero; the provider cannot INSERT (WITH CHECK) or DELETE. The grant
**lifecycle** (revoked / expired / inactive-staff each flip provider access to zero) mirrors
`assertCareAccess`. A catalog check asserts all four tables are `ENABLE` + `FORCE` RLS and carry
their expected per-command policies.

> ⚠️ **`0023` is HARNESS-ONLY** — proven in the embedded-Postgres harness, **NOT applied to
> Supabase**. R3 applies the whole accumulated R2 set at the `DATABASE_URL` cutover to
> `pawpi_app`. (Same rule as R2a; see the warning under §R2a.)

### Remaining R2 groups (follow-ups)

- **R2e — provider/business tables.** `providers`, `provider_staff`, services, locations,
  reviews, `care_access_grants`, `care_access_audit` — membership/owner scoped; mind helper
  recursion (the `SECURITY DEFINER` helpers read `provider_staff` / `care_access_grants`).
- **R1-rollout** — apply `withRequestContext` to all ~93 remaining routes (prerequisite for R3).
- **R3 cutover** — apply ALL R2 migrations to Supabase + switch `DATABASE_URL` to `pawpi_app`.
