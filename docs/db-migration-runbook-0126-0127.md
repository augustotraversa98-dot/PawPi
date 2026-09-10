# Production apply runbook — migrations `0126` + `0127`

**Audience:** the human operator (Augusto). **These two migrations are NOT applied by any
automation** — you apply them by hand, in order, in the Supabase SQL editor, and verify each with
its `verify_*.sql`. Nothing in CI touches production.

- **`0126`** (PR #530) — revoke `anon`/`authenticated` Data-API privileges; pin
  `current_app_user_id()` search_path. *Closes AUDIT A-01 (P0-latent) + A-32.*
- **`0127`** (PR #539) — `pawpi_app` `statement_timeout` + `idle_in_transaction_session_timeout`.
  *Closes AUDIT A-18 (P1). PR #539 also ships the in-code third-party `AbortSignal`s (10 s) — merge
  the PR so those deploy alongside.*

Both are idempotent and reversible. Rollback SQL is at the bottom.

> **Prerequisite:** the R3 RLS cutover has already happened — `pawpi_app` exists on Supabase and
> `DATABASE_URL` points at it. (Both migrations no-op cleanly if `pawpi_app` does not yet exist,
> but their whole point is the live `pawpi_app` posture, so apply them at/after R3.) If you have not
> cut over yet, do that first (`docs/rls-hardening.md` → R3), then return here.

---

## 0 · Pre-flight (do not skip)

1. **Part A is clean.** Confirm `docs/db-data-api-safety-evidence.md` still holds — nothing uses the
   Supabase Data API / anon key. (Re-run its repro grep if the codebase moved since 2026-09-10.) This
   is what makes `0126` + closing the Data API safe.
2. **Backup / PITR.** Confirm Point-in-Time Recovery is ON (Supabase Dashboard → Database → Backups),
   or take a manual snapshot. Note the timestamp — this is your ultimate rollback.
3. **Low-traffic window.** Pick one (Argentina overnight). `0126` revokes grants and `0127` changes a
   role setting that applies to **new** sessions; neither locks tables, but do it when it's quiet.
4. **Rollback ready.** Have the "Rollback" section below open in another tab, tested against a branch
   DB if you want belt-and-braces (Supabase → Branches → create a branch, apply `0126`/`0127` there,
   run the verifies, then the rollbacks, confirm clean — optional but recommended for `0126`).
5. **Know who is exempt.** `postgres` / `supabase_admin` / `service_role` (seeds, `/api/upload`) are
   untouched by both migrations. The app role `pawpi_app` is the only role affected.

---

## 1 · Apply `0126` (revoke Data-API roles + pin search_path)

1. Open the Supabase **SQL editor** (you are `postgres` there — required so the
   `alter default privileges for role postgres …` block runs; it self-skips with a NOTICE otherwise).
2. Paste the full contents of `supabase/migrations/0126_revoke_data_api_roles.sql` and run it.
3. Paste `supabase/verify_0126.sql` and run it. **Every row must read `PASS`:**
   - anon/authenticated hold **no** table privileges and can execute **no** public function;
   - `anon` cannot SELECT `auth_users`;
   - `pawpi_app` still reads `pets`, still executes `current_app_user_id()` and **every** public
     routine; `service_role` still reads `pets`;
   - `current_app_user_id()` search_path is **pinned**;
   - **no** default privileges remain for anon/authenticated on future tables.
   If any row reads `FAIL`, **stop** and jump to Rollback (0126). Do not proceed to the schema step.

### 1b · Close the Data API (Dashboard, not SQL) — the belt to 0126's braces

4. Dashboard → **Settings → API → Exposed schemas** → **remove `public`** → Save. The app does not
   use the Data API (Part A), so nothing is lost; the PostgREST surface goes to zero even if a future
   migration re-grants something by mistake.
   - **To reverse:** add `public` back to the same list. (Instant, no redeploy.)
5. Smoke the closure (optional, from your laptop): a Data-API read should now fail —
   `curl "$SUPABASE_URL/rest/v1/pets?select=id" -H "apikey: <anon-key>"` → 401/404/empty, **not** rows.

---

## 2 · Apply `0127` (pawpi_app timeouts)

> Do `0127` **after** `0126` + verify are green.

### 2a · Sizing check (before applying)

- **`statement_timeout = 15 s` is per-STATEMENT, not per-request.** The slowest hot query today is
  ~100 ms (AUDIT A-14, `pg_stat_statements`). Confirm nothing legitimate runs a **single** statement
  longer than 15 s: Dashboard → **Advisors/Reports → Query performance** (or `pg_stat_statements`
  `max_exec_time`), sorted desc. Batch/cron work issues **many short** statements, not one long one —
  that's fine. If you find a legitimate >15 s single statement run **as `pawpi_app`**, raise the value
  in `0127` before applying (edit the `'15s'`), or move that query to a `postgres`-run job.
- **Do the timed jobs run as `pawpi_app`?** Yes — the two cron endpoints
  (`POST /api/payments/subscriptions/run` @ 06:00 UTC, `POST /api/providers/calendar/sync` @ 06:15 UTC
  in `.github/workflows/cron-jobs.yml`) hit the app and therefore run as `pawpi_app`, so they inherit
  these limits. That is intended: they issue short statements. The `idle_in_transaction = 30 s` guard
  is safe for them because PR #539's third-party `AbortSignal` is **10 s** (< 30 s), so a stalled
  MercadoPago/Resend/Daily call aborts and the transaction closes before the idle timeout fires.
  **Seeds and schema migrations run as `postgres`/`service_role`, NOT `pawpi_app`** → they are
  **exempt** from both limits. (Long demo-seed / directory-loader runs are unaffected.)

### 2b · Apply + verify

1. SQL editor: paste `supabase/migrations/0127_pawpi_app_timeouts.sql`, run.
2. Paste `supabase/verify_0127.sql`, run. **Both rows must read `PASS`** (`statement_timeout=15s`,
   `idle_in_transaction_session_timeout=30s`). New `pawpi_app` sessions pick these up automatically;
   existing pooled connections get them as the pool recycles (or restart the Railway web service to
   force-refresh the pool immediately).
3. Merge **PR #539** so the in-code third-party `AbortSignal`s deploy (they pair with the role limits).

---

## 3 · Post-apply smoke (on device + web)

1. **Log in on device** (real account). Load **Services / Discovery** and **Health** — no new errors,
   no permanent spinners.
2. **Web**: sign in, open a couple of screens that hit the API (bookings, a provider page).
3. **Uploads still work** (service-role path, must be unaffected by `0126` + Data-API closure): add a
   vet-record document or a health photo → it uploads and re-opens.
4. **Cron dry-run** (optional): Actions → *Scheduled cron jobs* → **Run workflow** (workflow_dispatch)
   → both jobs return 2xx.
5. **Re-run the Supabase Security advisor** (`get_advisors { type: "security" }` or Dashboard →
   Advisors): the `current_app_user_id` mutable-search_path warning is **gone**, and no new
   over-privileged-role finding. Re-run the Performance advisor to confirm no regression.
6. Tick the advisor step in `docs/LAUNCH-CHECKLIST.md`.

If anything regresses, roll back the specific migration below and re-smoke.

---

## Rollback

**`0126`** — restore the Supabase defaults (only if a verify row failed or the app broke). Run as
`postgres`:
```sql
-- Re-grant the Supabase platform defaults on existing objects…
grant all on all tables    in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
grant all on all routines  in schema public to anon, authenticated;
grant execute on all routines in schema public to public;
-- …and for future objects created by postgres:
alter default privileges for role postgres in schema public grant all on tables    to anon, authenticated;
alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated;
alter default privileges for role postgres in schema public grant all on routines  to anon, authenticated;
-- (Optional) undo the search_path pin — harmless to leave in place:
-- alter function public.current_app_user_id() reset search_path;
```
Then Dashboard → Settings → API → Exposed schemas → **add `public` back**.
> Note: this restores the *pre-audit* exposure — only do it to recover from a real regression, and
> re-close it once the cause is fixed. The far more likely "fix" is that a verify FAIL pointed at a
> real problem to solve, not at `0126` being wrong.

**`0127`** — clear the role limits:
```sql
alter role pawpi_app reset statement_timeout;
alter role pawpi_app reset idle_in_transaction_session_timeout;
```
New sessions revert immediately; restart the Railway web service to refresh the pool now.

**Nuclear option:** PITR restore to the pre-flight timestamp (§0.2). Only for a data-affecting
regression — neither of these migrations writes application data, so you should never need it here.

---

## One-glance order

1. Pre-flight (§0): Part A clean · PITR on · quiet window · rollback open.
2. `0126` → `verify_0126.sql` all **PASS**.
3. Dashboard: remove `public` from Exposed schemas.
4. Sizing check (§2a) → `0127` → `verify_0127.sql` both **PASS** → merge PR #539.
5. Smoke on device + web + uploads + re-run Security advisor (warning gone).
