# Production apply runbook — migration `0134` (finish 0126: revoke anon/authenticated EXECUTE) + the `supabase_admin` default-privileges step

**Audience:** the owner. **Nothing here is applied by automation or by the PR that adds it.** You apply it by hand in the Supabase SQL
editor and verify it. Context: `verify_0126.sql` on production (2026-10-20) read **PASS on 7 rows and FAIL on rows 2 and 8**.

| 0126 row | What failed | Why | Closed by |
|---|---|---|---|
| 2 — anon/authenticated can EXECUTE no public function | **12 functions** executable: `app_log_notification_send`, `app_mark_push_token_invalid`, `app_notification_send_log_gc`, `app_notification_sends_today`, `app_pending_push_tickets`, `app_recipient_notification_settings`, `app_recipient_valid_push_tokens`, `app_record_push_ticket`, `app_reserve_notification_send`, `app_resolve_push_tickets`, `app_set_email_consent`, `app_user_day_start` | They were created by `0131`/`0132`, *after* 0126 ran. Postgres gives every new function `EXECUTE` to `PUBLIC`, and a schema-level default privilege cannot take that away. | **Part A** — migration `0134` |
| 8 — no default privileges for anon/authenticated | **3 default-ACL entries for role `supabase_admin`** (tables, sequences, functions) | 0126 only removed the defaults of role `postgres`. `supabase_admin` is Supabase's own role; anything *it* creates in `public` is granted to anon/authenticated. | **Part B** — manual step (the migration also *tries* it, guarded) |

**Impact if you do nothing:** the app is unaffected (it never uses the Data API). The exposure is that `anon`/`authenticated` (the
publishable key) can call those helpers through PostgREST — several take their subject as a parameter (`app_set_email_consent`,
`app_record_push_ticket`, `app_mark_push_token_invalid`). Removing `public` from **Settings → API → Exposed schemas** (0126 runbook §1b)
closes that path as well; check it is done (Part C).

---

## Part A — apply migration `0134`

1. Low-traffic moment; PITR/backup is already on (same pre-flight as `db-migration-runbook-0126-0127.md` §0).
2. Supabase **SQL editor** (you are `postgres`). Paste the whole of `supabase/migrations/0134_revoke_public_execute_sweep.sql` and run it.
   - It prints a `NOTICE` only if the editor role may not alter `supabase_admin`'s default privileges (Part B). That is expected, not an error.
3. Paste `supabase/verify_0134.sql` and run it. **Every row must read `PASS`:**
   1. no public function executable by `PUBLIC`; 2. none executable by `anon`/`authenticated`; 3. the 12 named functions are closed to the three
   and still open to `pawpi_app`; 4. `pawpi_app` can execute **every** public function; 5. `service_role` too; 6. no table/sequence grants to
   PUBLIC/anon/authenticated; 7. no `postgres` default privileges for them.
4. Re-run `supabase/verify_0126.sql`: **row 2 must now read PASS**. (Row 8 is Part B.)
5. Smoke the app: open the app, pull-to-refresh Today and Notifications; trigger one push (e.g. a booking confirmation). Watch the Railway logs /
   `pawpi_*` 5xx for ten minutes. The migration re-grants `pawpi_app` and `service_role` EXECUTE on every function, so no app call changes.

**What the migration touches:** `REVOKE` on every routine, table and sequence in `public` from PUBLIC/anon/authenticated; `GRANT EXECUTE` on all
routines to `pawpi_app` (and `service_role` if it exists). No data, no schema change; idempotent (CI re-applies it twice).

**Rollback:** there is nothing to roll back for the app. If some *non-app* caller you did not know about breaks ("permission denied for
function X"), grant just that function to just that role — `grant execute on function X(args) to <role>;` — never back to `PUBLIC`/`anon`.

## Part B — default privileges for role `supabase_admin` (manual; I cannot run or test this)

Goal: `verify_0134_default_acl.sql` reads all `PASS` (same as `verify_0126.sql` row 8).

**What to run, as which role:** in the Supabase **SQL editor** (it runs as `postgres`), paste and run these three statements:

```sql
alter default privileges for role supabase_admin in schema public revoke all on tables    from anon, authenticated;
alter default privileges for role supabase_admin in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role supabase_admin in schema public revoke all on functions  from anon, authenticated;
```

(Migration `0134` already attempted exactly this in a guarded block. If the SQL editor lets `postgres` do it, the NOTICE did not appear and
Part B is already done — just run the verify below.)

Then run `supabase/verify_0134_default_acl.sql` → row 1 must read `PASS`.

**If you get `permission denied` / `must be member of role "supabase_admin"`:** that means the SQL editor role is not allowed to change another
role's defaults. I could not verify which way Supabase behaves from here. There is **no Dashboard setting** for default privileges, and you should
not try `grant supabase_admin to postgres` (it is Supabase's superuser). Your options, in order:

1. **Supabase support ticket** (Dashboard → Support): "Please run, as `supabase_admin`, on project `<ref>`: `alter default privileges for role supabase_admin in schema public revoke all on tables|sequences|functions from anon, authenticated;`" and attach `verify_0134_default_acl.sql`.
2. **Accept the residual, knowingly.** The entries only affect objects *created by `supabase_admin` in `public`*. PawPi migrations and the SQL editor create objects as `postgres`, whose defaults 0126 already cleaned; the sweep in `0134` closes everything that exists; and from now on CI (`test/integration/no-public-grants.integration.test.ts`) plus the per-function revoke in `TEMPLATE.sql` §2 keep PawPi's own objects closed. Removing `public` from *Exposed schemas* (Part C) removes the PostgREST path to `public` entirely. If you accept it, note the date here and leave `verify_0126` row 8 as a known FAIL.

## Part C — confirm the dashboard belt (read-only check)

Dashboard → **Settings → API → Exposed schemas**: `public` should **not** be in the list (0126 runbook §1b). If it still is, remove it (instant,
reversible by adding it back; the app does not use the Data API — `docs/db-data-api-safety-evidence.md`).

## Why a new function in a future migration cannot silently re-open this

- **Template:** `supabase/migrations/TEMPLATE.sql` §2 now carries the `revoke execute … from public` + guarded `anon`/`authenticated` revoke + `grant execute … to pawpi_app` pair for *every* function.
- **CI:** `no-public-grants.integration.test.ts` runs after all migrations and fails, naming the function/table, if anything in `public` is executable/grantable by PUBLIC, anon or authenticated, if a default privilege would grant them, or if `pawpi_app` cannot execute a function.
- **Why not a global default privilege instead?** `alter default privileges for role postgres revoke execute on functions from public` (without `in schema`) would stop PUBLIC being granted on new functions everywhere — but it also changes functions that Postgres/extension scripts create as `postgres` in *other* schemas, which can break extensions. Not worth the risk; the per-function pair plus the CI guard is explicit and testable.
