# Database migration inventory — what is NOT (confirmed) applied to live Supabase

**Written 2026-10-20, before app build 27 (v1.0.3). Docs only: nothing was applied and no live service was queried.**
Migrations here are applied by hand (SQL editor) *after* merge — merging never touches the live DB — so there is no ledger table to
read. The "State" column is therefore **what the repo's own records say**, not a live fact. Anything marked **CONFIRM** needs you to run
its `verify_NNNN.sql` (read-only `SELECT`s): rows that read `PASS` mean "applied", `FAIL` means "not applied".
Source of truth for the per-migration history: `docs/test-backlog.md`, `docs/roadmap.md`, `AUDIT_2026-09.md`,
`docs/qa/runs/2026-10-17_fix-log.md`, `docs/qa/flow-matrix-2026-10-17.md`.

## How the state was derived

| Range | State | Evidence |
|---|---|---|
| 0001 – 0121 | **applied** | Sequential "live DB is at …" notes in the roadmap / night-run logs (0064 → 0069 → 0084 → 0110 → 0113 → 0115 → 0119) and "applied + verified" lines for 0120 / 0121. The old `ACTION 1` list in `test-backlog.md` still shows 0027–0038, 0069–0071, 0083–0093 without ✅ marks; that list is a historical build log, later notes supersede it. |
| 0124, 0125 | **applied (documented)** | The claim-directory build prompt states both are "already applied to prod". They shipped **without** a `verify_` script → added in this PR, so you can prove it. |
| 0130, 0131, 0132 | **applied + verified** | `roadmap.md` ("latest migration is 0130", 0128/0129 skipped); `release-build-26.md` §3 item 6 (0131, 0132). |
| 0133 | **applied + verified** | You confirmed it (2026-10-20). The backlog still said "NOT applied" — **fixed in this PR** (`test-backlog.md` ACTION 6, `roadmap.md`). |
| **0122, 0123, 0126, 0127, 0128, 0129** | **NOT applied / unconfirmed** | Last recorded as "hand-apply pending / file-only" (0122: night run 2026-08-21; 0123: 2026-08-22; 0126/0127: runbook 2026-09-10; 0128/0129: "remain file-only" in `roadmap.md`). **Nothing later records them as applied.** → CONFIRM each. |
| (no file yet) | **pending SQL** | Proposed in `flow-matrix-2026-10-17.md` (SQL-1, SQL-2, F3-01, F3-06) and the 0133 hand-off (case-insensitive pet-handle index). Not in `supabase/migrations/`. |

## The table

`Build 27 impact` = what a user of the next build can see. "Without it" = what the running system does today.

| # | Migration | Merged feature/fix that depends on it | Without it | Build-27 user-visible impact | verify script | State | Recommendation |
|---|---|---|---|---|---|---|---|
| 1 | **0123** `care_access_owner_insert` | #508 / issue #506 — owner-initiated **"Share clinic history"** (`POST /api/care-access/grants`) | **Errors.** The INSERT policy only has a provider branch, so under FORCE RLS the owner's insert fails and the route answers **500**. Not silent (the user gets the error), but the feature never works. | **Yes.** Booking detail → *Share clinic history* fails in builds 26 and 27. | `verify_0123.sql` — **created in this PR** (CI-proven, incl. a negative test) | CONFIRM (last: pending, 2026-08-22) | **Apply before build 27.** Tiny, additive, idempotent policy swap; no downtime. |
| 2 | **0122** `emergency_tag_medical_least_privilege` | Night-run security fix #5 (`docs/night-run/2026-08-21/SECURITY_FIXES.md`) — public **collar-tag** emergency card | **Silent over-exposure.** The tag's raw API JSON carries the **vet phone, clinic and emergency-contact name + phone** whenever the owner opted in to "show medical on tag", although the tag page only renders blood type / allergies / conditions / notes. Anyone who scans a tag can read them from the API. | None visible (the page already hides them). It is a privacy fix. | `verify_0122.sql` — **created in this PR** (CI-proven, incl. a negative test) | CONFIRM (last: pending, 2026-08-21) | **Apply before build 27.** Replaces two read functions + drops one overload; the vet *link* output is byte-identical. |
| 3 | **0126** `revoke_data_api_roles` | #530 — AUDIT A-01 (P0, latent) + A-32; #541 runbook | **Security exposure, not an app failure.** Supabase's default grants leave `anon` / `authenticated` able to read every public table (incl. `auth_users` password hashes) and call 92 SECURITY DEFINER helpers through the Data API with the publishable key. The app never uses the Data API, so it runs fine either way. | None. | `verify_0126.sql` (exists) | CONFIRM (last: hand-apply pending, 2026-09-10) | **Apply before build 27**, following `docs/db-migration-runbook-0126-0127.md` (0126 → verify → remove `public` from *Exposed schemas* in the dashboard). Proven safe: nothing in the repo uses supabase-js / the anon key (`docs/db-data-api-safety-evidence.md`). |
| 4 | **0128** `care_access_grants_active_unique` | #547 — AUDIT A-26 | **Degrades cleanly.** Two concurrent "grant access" requests can create two active grants for the same vet + pet (the route handles the unique error once the index exists; before that nothing is raised). | None (an edge case on double taps / races). | `verify_0128.sql` (exists) | CONFIRM (last: file-only) | **Apply before build 27 if the de-dup query is quick** (`docs/db-migration-runbook-indexes-0128-0129.md`: find duplicates, revoke all but the newest, then build the index — a plain `CREATE UNIQUE INDEX` **fails** if duplicates exist). Otherwise after. |
| 5 | **0127** `pawpi_app_timeouts` | #539 — AUDIT A-18 (the third-party 10 s `AbortSignal`s ship with it) | **Degrades cleanly.** No `statement_timeout` / `idle_in_transaction` limit on the app role: one stalled statement or hung third-party call pins a pooled connection (pool = 10), and the app can look "stuck loading" for everyone. | None directly; protects every screen from hangs. | `verify_0127.sql` (exists) | CONFIRM (last: pending) | **Apply after build 27 is out and quiet** (any time, it is independent of the build). It changes behaviour for *every* live session at once (15 s statement / 30 s idle-in-tx), so do the sizing check in the runbook and watch `pawpi_*` 5xx afterwards. Note the cron endpoints inherit the limits. |
| 6 | **0129** `index_cleanup` | #548 — AUDIT A-19 (+ the A-14 discovery index `providers(status, provider_type)`) | **Degrades cleanly.** Only slower: 8 duplicate indexes keep costing writes, and ~11 hot joins lack an FK index. | Marginal (Discover / list speed). | `verify_0129.sql` (exists) | CONFIRM (last: file-only) | **Apply after build 27.** Pure index DDL; use `CONCURRENTLY` per `docs/db-migration-runbook-0129-index-cleanup.md`. Safe to leave until then. |
| 7 | **0124** `provider_claimable` | #520 — seeded, claimable business directory | Claim/seed features would 500 or show nothing. | The **"¿Es tu negocio? Reclamalo"** CTA and Pet-friendly places need it. | `verify_0124.sql` — **created in this PR** (CI-proven) | applied per the build prompt — **CONFIRM** by running the verify | Nothing to apply if the verify is all PASS. Row loading (`supabase/seed/directory/load_master.mjs`) is a separate step: confirm it was run (≈3,627 rows) if Discover looks empty. |
| 8 | **0125** `provider_claims` | #521 — claim ledger + `app_claim_provider` | Claiming fails (404 / 500). | As above. | `verify_0125.sql` — **created in this PR** (CI-proven) | applied per the build prompt — **CONFIRM** | Nothing to apply if the verify is all PASS. |
| 9 | *(no file)* **payment settlement** — `app_payment_for_webhook` / `app_apply_payment_status` (flow matrix F3-01; also F3-02, F3-03, F3-06) | #662 (F3) found the gap; MercadoPago go-live (keys on Railway) | ⚠️ **Silent failure.** The payment webhook has no RLS identity, so it **can never find the payment**: a real MercadoPago payment can be taken while the order/booking is never marked paid and no stock / walk credit is applied. The matrix states "in prod the webhook today settles NOTHING". | Only if a real payment is attempted. No visible change from build 27 itself. | none yet (write `0134+` with its `verify_`) | **PENDING — no migration file exists** | **Before ANY real MercadoPago charge** (and before build 27 if payments are reachable from the app). Needs a migration file + `verify_` in a separate PR, and a real MP sandbox payload (F3-02). Do not announce payments until done. |
| 10 | *(no file)* **SQL-1** `notifications_type_check` widen + block gate + 24 h dedupe in `app_notify` | #661 (F2) findings F2-01/02/05/06/09 | **Not a drop today:** the app does not emit the new types yet (DMs, caregiver invites, walk invites send **no** bell/push at all — missing feature, not a failed insert). Without the block gate in `app_notify` a blocked pair on *pack requests* can still notify; paw/follow toggling can spam the bell. | None in build 27. | none yet (`verify_0134.sql` planned) | **PENDING — proposal only** (`flow-matrix` §4, numbered 0134 there) | **After build 27**, together with the client code that emits the new types (ship SQL first, then code — emitting a new type before the CHECK is widened is swallowed by `safeNotify`, loses the bell row and, per the matrix (U-6), can poison the request transaction). |
| 11 | *(no file)* **SQL-2** let a pack restart after `ended` | #661 F2-10 | Degrades cleanly: an ended pack can't be re-invited (409). | None. | none | PENDING — proposal | Safe to leave. |
| 12 | *(no file)* case-insensitive unique pet handle: `create unique index concurrently pets_handle_lower_key on pets (lower(handle)) where handle is not null` | #651 (handle availability) | Degrades cleanly: the server already checks availability on save and answers 409; only a race between two simultaneous saves (or a case-variant the code check misses) could create a near-duplicate. | None. | none | PENDING — SQL in the fix log | Optional. First run the duplicate check in the fix log; then apply. Safe to leave. |

## Anything silently dropping data or notifications **right now**?

I found **no unapplied migration that drops data or notifications on its own.** What I did find:

1. **Payment settlement (row 9) — the one real silent failure.** If a MercadoPago checkout is completed, the money can be taken and the app never learns. This is the item to fix before enabling real charges.
2. **0122 (row 2) — silent exposure, not loss:** the public tag API JSON includes vet / emergency-contact details for owners who enabled "show medical on tag".
3. **0126 (row 3) — latent exposure:** Data-API grants (anon key) over all public tables, including the five RLS-exempt identity tables.
4. **0123 (row 1) — visible failure** (500) on owner-initiated sharing.
5. **Notifications:** a static scan of the web code (every `safeNotify` / `app_notify` call) found **no emitted notification type that is missing from the latest `notifications_type_check` (0110)**, so no bell row is being rejected today. (`safeNotify` would swallow a rejection silently, which is why this was worth checking. The scan is a source scan, not a log query: if you want proof from production, search the Railway logs for `notifications_type_check`.) DMs / caregiver invites / walk invites send no notification **because the code never emits one** (F2-01/02/05), not because of a missing migration.

## Recommended apply order

0. **Confirm first (5 min, read-only):** in the Supabase SQL editor run `verify_0122`, `verify_0123`, `verify_0124`, `verify_0125`, `verify_0126`, `verify_0127`, `verify_0128`, `verify_0129`. Any `FAIL` row = that migration is not applied. Tell me the result and I will update the table's State column.
1. **0123** → `verify_0123.sql` (fixes a broken feature; smallest and safest).
2. **0122** → `verify_0122.sql` (closes the tag over-exposure).
3. **0126** → `verify_0126.sql` → dashboard: remove `public` from *Exposed schemas* → re-run the Supabase security advisor (`docs/LAUNCH-CHECKLIST.md`).
4. **0128**: run the de-dup pre-check first; then the index (`CONCURRENTLY`) → `verify_0128.sql`.
5. *— build 27 can be built and submitted at this point —*
6. **0127** (after build 27 is quiet; runbook sizing check) → `verify_0127.sql`; watch 5xx for a day.
7. **0129** (`CONCURRENTLY`) → `verify_0129.sql`.
8. **Before any real payment:** write and apply the settlement migration (row 9) with its `verify_`.
9. **Later:** SQL-1 notification migration (then the client code), the optional pet-handle index, SQL-2.

Every apply: copy the file from `supabase/migrations/` into the SQL editor as `postgres`, run its `verify_NNNN.sql`, expect all rows `PASS`, and note the date here.

## What this PR added

- `supabase/verify_0122.sql`, `verify_0123.sql`, `verify_0124.sql`, `verify_0125.sql` — read-only, every row `PASS` when the migration is applied. CI runs each against the real harness schema (`test/integration/verify-scripts-0122-0125.integration.test.ts`), and two negative tests prove 0122 / 0123 verifies actually fail on the pre-migration state.
- Corrected stale "0133 not applied" lines in `docs/test-backlog.md`, `docs/roadmap.md`, and the two docs added in #701.
