# What bumping `PRIVACY_VERSION` / `TERMS_VERSION` does (answer for draft #782)

**Safe to merge #782: YES.** Bumping either constant only changes the version string that is written on **new**
consent rows. It does not make an existing user re-accept anything: no re-consent prompt, no blocked app, no forced
sign-out. Reason: nothing in the repository compares a stored version to these constants, so there is nothing for a
bump to trigger. The re-consent gate that would do that was never built.

One thing to check **after** the deploy (not a blocker): if production sets `NEXT_PUBLIC_TERMS_VERSION` or
`NEXT_PUBLIC_PRIVACY_VERSION`, those win over the new default and #782 changes nothing there (see §3).

Night run #6, item 1. Investigation only; #782 was not touched. Same conclusion as
[`legal/accuracy-sweep-2026-10-16.md`](legal/accuracy-sweep-2026-10-16.md) §7, re-checked today on `main` (23e034f).

---

## 1. Every reader of the two constants

Searched `anything/`, `supabase/`, `scripts/`, `.github/` for `TERMS_VERSION`, `PRIVACY_VERSION`,
`NEXT_PUBLIC_TERMS_VERSION`, `NEXT_PUBLIC_PRIVACY_VERSION`, `terms_version`, `privacy_version`.

| Where | What it does with them |
|---|---|
| `anything/apps/web/src/constants/legal.js` | Defines them: `process.env.NEXT_PUBLIC_*_VERSION \|\| "<date>"`. |
| `anything/apps/web/src/app/api/legal/consent/route.js` (server) | **The only reader.** `POST /api/legal/consent` passes them to `app_record_consent(authUserId, TERMS_VERSION, PRIVACY_VERSION, source, userAgent)`, which inserts one append-only row into `legal_consents` (migration 0067). Versions from the request body are ignored. |
| `.../api/legal/consent/route.test.js` | Imports the constants and asserts the route stamps them (symbolically, no hard-coded date), so a bump needs no test change. |
| `anything/apps/web/test/integration/legal-consent.integration.test.ts` | Uses its own local constants against the SQL helper; unaffected. |
| Mobile app (`anything/apps/mobile`) | **Does not read them.** Its `constants/legal.js` only holds the policy/terms/EULA URLs and the support address. The app never calls `/api/legal/consent` (it only appears in the telemetry route allow-list, `telemetry/apiRoutes.js`). No version logic. |
| Web pages | `account/signup/page.jsx` imports only the two **URL** constants, and after sign-up calls `POST /api/legal/consent` without sending any version. The `/privacy` and `/terms` pages render their "Last updated" line from the markdown in `src/content/legal/`, not from the constants. |
| `scripts/`, `.github/`, `supabase/` (functions, cron, views) | No reference. |

## 2. Every place that compares a stored version to the constants

**None.**

- `legal_consents` is **written** only by `app_record_consent` (0067, DEFINER, append-only) and **read** by nothing in the app:
  its only policy is admin SELECT, and no route, screen, job or SQL function selects from it. A grep for `legal_consents`
  finds only the consent route, migration 0067 + its verify file, a comment in 0069, `legal.js`, `.env.example`, and tests.
- No auth callback, middleware (`__create/index.ts`), session/JWT check or mobile startup gate looks at consent.
  The sign-in path never reads `legal_consents`, so there is no way for a version mismatch to block a login or end a session.
- The idea is written down but unbuilt: `docs/test-backlog.md` ("consent backstop" TODO) and the comment in `legal.js`
  ("A re-consent-on-version-change backstop does not exist yet").

So, per the three cases you asked about:

| Effect on an existing user | After bumping? |
|---|---|
| Re-consent prompt | No |
| App blocked until they accept | No |
| Forced sign-out | No |
| Their old `legal_consents` rows | Unchanged (append-only; nothing rewrites them) |
| New sign-ups (web email form only) | Row stamped with the new date |

Related, **not** changed by #782 and worth knowing: sign-ups with Apple or Google do not pass through the web form,
so they record **no** consent row at all (already listed as a follow-up). Existing users who accepted the
`2026-10-16` text are never asked to accept the `2026-11-25` text. Whether the November 25 wording needs re-acceptance is a
legal call; the code cannot do it today.

## 3. Do `NEXT_PUBLIC_TERMS_VERSION` / `NEXT_PUBLIC_PRIVACY_VERSION` override the constants?

**Yes.** `process.env.NEXT_PUBLIC_TERMS_VERSION || "2026-..."`: any non-empty value wins; unset or an empty string falls
back to the default in the file. They override each constant independently.

- **When they are read.** The only consumer is the server route. `vite.config.ts` sets `envPrefix: 'NEXT_PUBLIC_'`, which
  affects `import.meta.env`, and the plugin `plugins/nextPublicProcessEnv.ts` only injects values into **browser** modules
  (it skips SSR). So on the server `process.env` is read when the process starts, i.e. at runtime, not baked in at build.
  The comment in `.env.example` ("inlined into the browser bundle at build time") is true for browser code but no browser
  code imports the version constants. I read the config, I did not inspect a production build.
- **Which environments need them.** Only the **web/API service on Railway** (production, `https://www.pawpi.info`) serves
  `/api/legal/consent`. Mobile builds, EAS and the cron services do not read the versions, so they need nothing.
  Any other place the web app runs (a laptop `.env`, a staging copy, if one exists) only matters for the rows it writes.
  Railway stages variable changes; they apply on the next deploy (`docs/ops/secret-rotation-runbook.md`).
- **What I could not check.** I did not read Railway's variables (they sit next to secrets and the brief did not ask for
  that), so I do not know whether production sets either variable.

## 4. What to do

1. Merge #782 (nothing else needed; no migration, no SQL).
2. In Railway, web service, Variables: if `NEXT_PUBLIC_TERMS_VERSION` / `NEXT_PUBLIC_PRIVACY_VERSION` exist, delete them
   (preferred, the file is the single source of truth) or set both to `2026-11-25`. Redeploy.
3. After the deploy, sign up a throwaway email account on the web form and check the newest row in the Supabase SQL editor:

```sql
select auth_user_id, terms_version, privacy_version, source, accepted_at
from legal_consents
order by accepted_at desc
limit 3;
```

Expected: the newest row reads `2026-11-25` / `2026-11-25`. If it still reads `2026-10-16`, a Railway variable is overriding the default.

## 5. Not done here (decisions for you)

- A real re-consent gate (read `legal_consents`, compare with the constants, show an accept screen) is a larger,
  server + client feature with its own App Review risk. Not part of build 33.
- Consent rows for Apple/Google sign-ups.
