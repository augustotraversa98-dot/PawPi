# DB migration runbook — 0133 username backfill (QA 2026-10-16 bug 04 follow-up)

**FILE-ONLY in the repo. Nothing here has been applied to production.** The integration harness
applies it to a fresh (empty) DB so CI stays green; a human applies it on prod. Merging the PR does
**not** apply it: web deploys run `react-router build` + `start` only, and `migrate.ts` is test-only.

## Why
Before #645 new usernames were derived from the account e-mail (`local-part`, with `_NNNN` /
`_<timestamp>` suffixes on collision). They are no longer shown as display names, but they still show
up as `@handle` in the invite flows. This rewrites exactly those rows to a name-based, unique username.

## What it changes
- **Rewrites `user_profiles.username`** for e-mail-derived rows only (contains `@` or `+`; equals the
  account e-mail's local part; or local part + `_` + 1–13 digits). New value: slug of the display name,
  else the first pet's name, else a random `pawpi_xxxxxx`; unique case-insensitively against every
  username **and** pet handle, never a reserved word. `pawpi_welcome` / `pawpi_directory` are skipped.
- **Adds one table** `user_profile_username_backfill_audit(user_id, old_username, new_username,
  backfilled_at)` — RLS enabled + forced, owner-scoped SELECT only (the app role cannot write it). It
  holds the old (e-mail-derived) value so the change is reversible.
- Nothing else: no grants, no existing RLS/policy/column/function changes.

## What cannot break
Friendships, follows, pack streaks, notifications, DMs, bookings, staff memberships, caregiver grants and
walk invites all reference **ids**. The only text consumers of a username are *typed at invite time* and
resolved to an id immediately (provider staff invite, family/caregiver invite, walk invitees, admin
claims) — an invite typed with the **old** username after this runs will say "not found"; people just
need the new `@handle` (visible in their profile). There are no username mentions or deep links.

## Apply (human, quiet moment)
1. Take a snapshot / note the row count:
   `select count(*) from user_profiles;`
2. Dry-run what would change (read-only) — paste the `derived` CTE from `supabase/verify_0133.sql` and
   `select id, username from derived;`.
3. In the Supabase SQL editor (runs as `postgres`, which bypasses RLS — required, `user_profiles` is
   FORCE RLS) paste the whole of `supabase/migrations/0133_username_backfill.sql` and run it.
   It prints `NOTICE: 0133_username_backfill: N username(s) rewritten`.
4. Run `supabase/verify_0133.sql` — **every row must read PASS**.
5. Re-run step 3 once: the NOTICE must say `0 username(s) rewritten` (idempotent).

## Rollback
```sql
update user_profiles up set username = a.old_username, updated_at = now()
from user_profile_username_backfill_audit a
where a.user_id = up.id and up.username = a.new_username;
```
Once you are happy (e.g. a week), the audit table can be dropped: `drop table user_profile_username_backfill_audit;`
(it contains the old e-mail-derived strings, so there is no reason to keep it indefinitely).
