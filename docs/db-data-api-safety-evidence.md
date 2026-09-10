# Is it safe to lock down the Supabase Data API? — evidence (2026-09-10)

**Question.** Migration `0126` revokes `anon`/`authenticated` privileges and we plan to remove
`public` from Supabase's *Exposed schemas*. Both are only safe **if nothing in PawPi reaches the
database through the Supabase Data API (PostgREST) or the anon/publishable key.** This doc records
the check behind that assumption so applying `0126` is *known*-safe, not assumed-safe.

**Verdict: SAFE.** Nothing in the repo uses `@supabase/supabase-js`, the anon/publishable key, the
Data API (`/rest/v1`), or Realtime. The app reaches Postgres **only** through its own API as
`pawpi_app`. Applying `0126` and removing `public` from exposed schemas breaks nothing.

Method: `grep` across `anything/` (mobile + web), `scripts/`, `supabase/`, `docs/`, `.github/`, and
config files on `main` @ `69f4b54c`, 2026-09-10. Reproduce with the commands below.

---

## What the app actually uses to reach the DB

- **Web/API → Postgres:** porsager's `postgres()` over `DATABASE_URL`, in
  `anything/apps/web/src/app/api/utils/sql.js`. At the R3 cutover `DATABASE_URL` points at
  `pawpi_app` (RLS forced). No PostgREST, no supabase-js.
- **Mobile → data:** only the app's own API via `EXPO_PUBLIC_BASE_URL`
  (`anything/apps/mobile/src/__create/fetch.ts`). No Supabase client, no key.
- **Supabase Storage (a *different* API from the Data API):** two **server-side** callers use the
  **service-role** key, not anon — `anything/apps/web/src/app/api/upload/route.js`
  (`SUPABASE_SERVICE_ROLE_KEY`, `Authorization: Bearer` + `apikey`) and the demo-seed script
  `anything/apps/web/scripts/demo-seed/lib.mjs`. `0126` leaves `service_role` untouched, and
  removing `public` from *Exposed schemas* affects only the Data API (PostgREST), **not** Storage.
  So uploads keep working.

## Evidence table

| Check | Result |
|---|---|
| `@supabase/supabase-js` import anywhere | **none** |
| Supabase `createClient(` | **none** |
| `SUPABASE_ANON` / `SUPABASE_PUBLISHABLE` / "anon key" / "publishable key" | **none** (only in `AUDIT_2026-09.md` prose + this class of doc) |
| Supabase query-builder `.from(` | **none** (all `.from(` hits are `Buffer.from` / `Array.from`) |
| Realtime `.channel(` / `.subscribe(` | **none** |
| Direct Data API `/rest/v1` calls | **none** |
| `/storage/v1` calls | only `upload/route.js` + `demo-seed/lib.mjs`, both **server-side, service-role** |
| Supabase **Edge Functions** (`supabase/functions/`) | **none** (directory does not exist) → nothing relies on `anon`/`authenticated` |
| Tracked `.env*` files | only `anything/apps/web/.env.example` — no anon/publishable key referenced (server secrets only) |
| Mobile EAS config (`eas.json`) | ships only `EXPO_PUBLIC_*` URLs — no Supabase key |
| Anon/publishable key in any source/config | **none** |

## Reproduce

```bash
# from repo root
grep -rn "@supabase/supabase-js" anything scripts supabase --include=*.js --include=*.ts --include=*.jsx --include=*.tsx --include=*.mjs | grep -v node_modules   # -> none
grep -rniE "SUPABASE_ANON|SUPABASE_PUBLISHABLE|anon.?key|publishable.?key" anything scripts supabase --include=*.js --include=*.ts --include=*.mjs --include=*.json | grep -v node_modules  # -> none
grep -rnE "createClient\(|\.channel\(|\.subscribe\(|/rest/v1" anything --include=*.js --include=*.ts --include=*.jsx --include=*.tsx | grep -v node_modules   # -> none
ls supabase/functions 2>/dev/null || echo "no edge functions"
```

## Note on Railway env

The evidence above is at the **code** layer: no code path reads an anon/publishable key, so whether
one happens to sit in Railway's env vars is **moot for breakage** — it is never consumed. (Railway's
web service uses `DATABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`; the mobile client ships only the
`EXPO_PUBLIC_*` values in `eas.json`.) If an unused `SUPABASE_ANON_KEY` is present in Railway, it can
be deleted with the Data API closed; leaving it is harmless because nothing reads it.

## Conclusion

Both hardening steps — `0126` (revoke `anon`/`authenticated`; pin `current_app_user_id` search_path)
and removing `public` from *Exposed schemas* — are **known-safe**. Proceed per
`docs/db-migration-runbook-0126-0127.md`.
