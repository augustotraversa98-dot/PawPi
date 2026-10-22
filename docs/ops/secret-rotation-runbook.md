# Secret rotation runbook

**Audience:** the human operator (Augusto). **Nothing here is automated**: every step is done by hand in a vendor
dashboard, in Railway, in GitHub, or in the Supabase SQL editor.

Written 2026-10-22 after the Railway breach of 2026-10-21, when every secret was rotated by hand and the app was
redeployed and verified. The "Lessons learned" below are the things that were not obvious while doing it. The
per-secret sections are the checklist for next time (a scheduled rotation, a suspected leak, or a person leaving).

Covers every variable the repo reads in `anything/apps/web`, `scripts/cron`, `scripts/observability`,
`observability` and `.github/workflows` (inventory taken 2026-10-22 at `c73acf39`). Mobile `EXPO_PUBLIC_*` values
are **public by design** (they ship inside the app) and are out of scope; see section 12.

## 0 · Ground rules

1. **Never read, print, paste or commit a real secret value.** Not in the repo, docs, PR bodies, chat, shell history
   or CI logs. This repo is public. Use the placeholders in this file (`<NEW_VALUE>`) and a password manager.
2. Generate values locally and put them straight into the password manager and the target field. Examples that print
   nothing to the screen are given; if you must `echo` to copy, clear the terminal afterwards.
3. When a command needs a secret, read it with `read -rs VAR` (no echo, not saved in history) instead of typing it
   inline. Do not `export` real values in a shell profile.
4. Change one secret, deploy, verify, then move to the next. Do not batch a rotation of everything into one deploy:
   when something breaks you will not know which secret did it.
5. Keep the **old** value until the verification step passes, then revoke it at the issuer. Revoking is what makes
   the rotation real: a new key next to a still-valid leaked key protects nothing.
6. Anything hand-applied to the database ships a `supabase/verify_NNNN.sql` whose rows all read PASS, and the PR
   or change note says it is human-applied (CLAUDE.md, "Database migration conventions" rule 4).
7. Record each rotation in the log at the bottom of this file (date, which secrets, who, anything that broke).
   Dates only, never values.

## 1 · Lessons learned (2026-10-21 rotation)

- **Railway stages variable changes; nothing is live until you press Deploy.** Editing a variable only adds it to
  the staged change set. The running container keeps the old value until the deploy. After every edit, open the
  service, review the staged changes, and **Deploy**. "I changed it" and "it is live" are different states.
- **The five `cron-*` services read `CRON_SECRET` by reference, but their last deployment keeps the old value.** The
  reference (`${{PawPi.CRON_SECRET}}`) is resolved when a deployment is built, not on each run. After rotating
  `CRON_SECRET` on the backend you **must redeploy every cron service** (`cron-weekly-digest`, `cron-winback`,
  `cron-push-receipts`, `cron-subscriptions`, `cron-calendar-sync`). Otherwise their next run sends the old value
  and gets `401`. The **GitHub Actions** secret `CRON_SECRET` (manual fallback workflow) must match too.
  We hit exactly this on 2026-10-21 (`cron-weekly-digest` and `cron-push-receipts` returned `401` until redeployed);
  `docs/ops/railway-cron.md` has been corrected to say so.
- **`AUTH_SECRET` logs everyone out** (sessions are JWTs signed with it) **and invalidates old unsubscribe links**
  (emailed one-click links are HMAC-signed with it unless `NOTIF_UNSUBSCRIBE_SECRET` is set) **and old walk-pickup
  links** (5-minute links, signed with it). Do it at the quietest hour and expect re-login prompts.
- **`PAYMENTS_TOKEN_KEY`: rotating makes stored `enc:v1:` MercadoPago tokens unreadable**, so every connected
  provider has to reconnect their MercadoPago account. Keep it stable once real providers connect. There is no
  re-encryption tool; "rotation" means a forced reconnect (section 5.1).
- **`OTEL_EXPORTER_OTLP_HEADERS` is `Authorization=Basic%20` + base64(`<instanceId>:<token>`)`**, with a literal
  `%20` (not a space) after `Basic`. **`GRAFANA_LOKI_TOKEN` is the plain token** (the Loki user id is the separate
  `GRAFANA_LOKI_USER`). They are different strings built from different pieces. Verify with a curl `200` against the
  OTLP gateway, then check metrics resume and that the `P1-ServerMetricsSilent` alert clears (section 9.1).
- **The `pawpi_app` password is hand-applied with `ALTER ROLE`.** The app connects as `pawpi_app` through the
  Supabase pooler, **never as `postgres`**. The rotation is Supabase SQL (or `psql`) plus `DATABASE_URL` on Railway,
  and ships `supabase/verify_0136_pawpi_app_password.sql` (all rows PASS). See section 2.1.
- **Sign in with Apple: create the new key first**, update `AUTH_APPLE_PRIVATE_KEY` and `AUTH_APPLE_KEY_ID` together,
  deploy and test, **then** revoke the old key in the Apple console.
- **Supabase: create a new secret key, deploy, test uploads and private files, then disable the legacy JWT-based
  keys.** The leaked `service_role` JWT stays valid until the legacy keys are disabled.
- **One GitHub fine-grained PAT (`pawpi-autofix`) backs two settings**: `GITHUB_DISPATCH_TOKEN` (Railway) and
  `AUTOFIX_PAT` (GitHub Actions secret). Regenerate once, update **both**. It expires every 90 days; the current one
  expires **2027-01-20**. Put a reminder for **2027-01-13**.

## 2 · Order and blast radius

Suggested order for a full rotation (least disruptive first, most disruptive last):

| Order | Secret | Visible effect while rotating |
|---|---|---|
| 1 | Third-party API keys (Daily, Google, Anthropic, Resend, Expo) | The feature behind the key fails until the deploy lands |
| 2 | Observability (Grafana tokens, `ALERT_WEBHOOK_SECRET`) | Metrics gap; an alert may fire and open an autofix run |
| 3 | GitHub PAT, `CLAUDE_CODE_OAUTH_TOKEN`, `CRON_SECRET` | Autofix paused / cron 401 until redeploys |
| 4 | Supabase secret key | Uploads and private media fail if the header format is wrong (section 3.1) |
| 5 | `pawpi_app` password / `DATABASE_URL` | A few seconds of DB errors between `ALTER ROLE` and the deploy |
| 6 | Sign in with Apple key, Google OAuth secret | Social sign-in fails until deployed |
| 7 | MercadoPago / Binance secrets | Payments fail until deployed; webhooks may be rejected |
| 8 | `AUTH_SECRET` | **Everyone is logged out**; old email/pickup links die |
| 9 | `PAYMENTS_TOKEN_KEY` | **Providers must reconnect MercadoPago**. Only if the key leaked |

### Quick map: variable → section

| Variable(s) | Section |
|---|---|
| `DATABASE_URL`, `PLACES_DATABASE_URL`, `DEMO_DATABASE_URL`, `DATABASE_SSL` | 2.1 |
| `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL` | 3 |
| `AUTH_SECRET`, `AUTH_URL`, `NOTIF_UNSUBSCRIBE_SECRET` | 4.1, 4.2 |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | 4.3 |
| `AUTH_APPLE_ID`, `AUTH_APPLE_TEAM_ID`, `AUTH_APPLE_KEY_ID`, `AUTH_APPLE_PRIVATE_KEY`, `AUTH_APPLE_SECRET` | 4.4 |
| `PAYMENTS_TOKEN_KEY`, `MP_CLIENT_ID`, `MP_CLIENT_SECRET`, `MP_WEBHOOK_SECRET`, `MP_REDIRECT_URI`, `BINANCE_PAY_API_KEY`, `BINANCE_PAY_API_SECRET`, `PLATFORM_COMMISSION_BPS` | 5 |
| `CRON_SECRET`, `CRON_BASE_URL`, `CRON_TIMEOUT_MS`, `CRON_RETRIES` | 6 |
| `EMAIL_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO`, `EMAIL_PROVIDER`, `EMAIL_API_BASE_URL`, `APP_BASE_URL`, `PUBLIC_BASE_URL` | 7 |
| `EXPO_ACCESS_TOKEN` | 8.1 |
| `VIDEO_API_KEY`, `VIDEO_API_SECRET`, `VIDEO_BASE_URL`, `VIDEO_PROVIDER`, `VIDEO_ROLLOUT_PCT` | 8.2 |
| `GOOGLE_PLACES_API_KEY`, `ENRICHMENT_LLM_KEY`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `ENRICHMENT_FETCH_ALLOWED_HOSTS`, `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` | 8.3 – 8.5 |
| `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS`, `OTEL_SERVICE_NAME`, `OTEL_LOGS_ENABLED`, `OTEL_TRACES_SAMPLER`, `OTEL_TRACES_SAMPLER_ARG` | 9.1 |
| `GRAFANA_LOKI_URL`, `GRAFANA_LOKI_USER`, `GRAFANA_LOKI_TOKEN`, `LOG_*` | 9.2 |
| `GRAFANA_URL`, `GRAFANA_ANNOTATION_TOKEN`, `GRAFANA_ANNOTATE_DEPLOY`, `GRAFANA_SA_TOKEN`, `GRAFANA_SM_URL`, `GRAFANA_SM_TOKEN`, `GRAFANA_PROM_DS`, `GRAFANA_LOKI_DS`, `ALERT_DIGEST_EMAIL` | 9.3 – 9.5 |
| `ALERT_WEBHOOK_SECRET`, `ALERT_MAX_DISPATCHES_PER_HOUR` | 9.6 |
| `GITHUB_DISPATCH_TOKEN`, `AUTOFIX_PAT`, `GITHUB_REPO`, `AUTOFIX_ENABLED`, `GITHUB_TOKEN` | 10.1 |
| `CLAUDE_CODE_OAUTH_TOKEN`, GitHub `ANTHROPIC_API_KEY` | 10.2 |
| `CREATE_TEMP_API_KEY`, `ANYTHING_PROJECT_TOKEN` (legacy platform; removed from the code) | 11 |
| Everything else (non-secret configuration) | 12 |

Each secret below has the same five parts: **Name**, **Issued at**, **Rotate**, **Breaks**, **Verify**.

---

## 2.1 · Database: `DATABASE_URL` and the `pawpi_app` password

- **Name:** `DATABASE_URL` (Railway, backend service `PawPi`). Also, on the operator's laptop only:
  `PLACES_DATABASE_URL` (optional override for `scripts/places`), `DEMO_DATABASE_URL` (demo seed, with
  `ALLOW_PROD_SEED`), and `DATABASE_URL` in `anything/apps/web/.env`. `DATABASE_SSL=disable` is a non-secret escape
  hatch for a local non-SSL Postgres; leave it unset in production.
- **Issued at:** Supabase project → role `pawpi_app` (a Postgres role we own, created by migration `0019`).
  The connection string is the **pooler** (Supavisor) URL with username `pawpi_app.<project-ref>`.
  **The app never connects as `postgres`** and never uses the Supabase Data API.
- **Rotate:**
  1. Generate a password that is safe inside a URL (letters and digits only, so no percent-encoding is needed):
     `openssl rand -base64 36 | tr -dc 'A-Za-z0-9' | head -c 32` → straight into the password manager.
  2. Prefer `psql` over the SQL editor for the change, so the cleartext is not saved in the editor's query history:
     connect as `postgres` (Supabase → Connect → direct connection), then run the interactive
     `\password pawpi_app` (psql hashes it client-side). The SQL-editor fallback is
     `alter role pawpi_app with password '<NEW_PASSWORD>';`; if you use it, clear the query history afterwards.
     This is **hand-applied**, there is no migration file for it.
  3. Immediately build the new URL: `postgresql://pawpi_app.<project-ref>:<NEW_PASSWORD>@<pooler-host>:<port>/postgres`
     and set `DATABASE_URL` in Railway (backend service). Press **Deploy** (lesson 1).
  4. Update your laptop `.env` and any shell/CI place that holds a copy (`DEMO_DATABASE_URL`, `PLACES_DATABASE_URL`).
     The integration tests in CI use a throwaway embedded Postgres and hold no production credential.
  5. Do steps 2–3 back to back in a quiet window (see Breaks).
- **Breaks:** Existing pooled sessions keep working, but **new connections fail between `ALTER ROLE` and the deploy**;
  expect a short burst of 5xx and `P1-DbErrors` / `P1-HealthDeepFailing` possibly pending. Do not rotate during a
  release.

  > **New real database: change the default password before it is reachable.** Migration `0019` creates `pawpi_app`
  > with the literal password `pawpi_app` when the role does not exist (a convenience for the throwaway test
  > database). On any new real database (a new Supabase project, a restored copy, a staging or branch database) run
  > the `\password pawpi_app` step above and then `supabase/verify_0136_pawpi_app_password.sql` **before** the pooler
  > URL is given to anything. Until then the password is public knowledge, because it is in this repository.
- **Verify:**
  - `psql "$DATABASE_URL" -f supabase/verify_0136_pawpi_app_password.sql` using the **new** URL. Run it connected
    **as `pawpi_app`** (that is what proves the new password authenticates). **Every row must read PASS.**
  - `curl -s -o /dev/null -w '%{http_code}\n' https://www.pawpi.info/api/health/deep` → `200`.
  - Confirm the **old** password is dead: the same `psql` with the old URL must fail with
    `password authentication failed`.
  - Sign in on the device and open a pet screen (exercises RLS end to end).
  - The verify script cannot read the password itself (`pg_roles.rolpassword` always reads `********`); "new
    password works and old password fails" is the proof.

## 3 · Supabase secret key: `SUPABASE_SERVICE_ROLE_KEY` (and `SUPABASE_URL`)

- **Name:** `SUPABASE_SERVICE_ROLE_KEY` (Railway backend; also read by `scripts/demo-seed` on the laptop).
  `SUPABASE_URL` is the project URL, not secret. The variable keeps its legacy name even when the value is a new-style
  `sb_secret_...` key.
- **Issued at:** Supabase Dashboard → Project Settings → API Keys. New-style keys are `sb_secret_...`; the old
  `service_role` JWT lives on the "Legacy" tab. (Dashboard labels drift; look for "Secret keys" and "Legacy API keys".)
- **Rotate:**
  1. Create a **new secret key** (name it with the date, for example `railway-2026-10`). Leave the legacy keys enabled for now.
  2. Set `SUPABASE_SERVICE_ROLE_KEY` on Railway to the new key. **Deploy.**
  3. **Test uploads and private files** (below) while the legacy keys are still enabled, so you can roll back by
     pasting the old value.
  4. Only when the tests pass: **disable the legacy JWT-based keys** (Legacy API keys tab; if the dashboard also offers
     to rotate/revoke the legacy JWT secret, do that too, because that secret signs the old `anon` and `service_role`
     JWTs). Without this step the leaked key keeps working.
  5. Delete the previous secret key if you are rotating a non-legacy one.
- **Breaks:** `POST /api/upload` (public `media` bucket and private `media-private` bucket), `GET /api/media`
  (signed URLs for medical/chat files), the demo-seed image upload, and the enrichment SSRF allow-list host derivation.
  **Robustness caveat:** the code sends the key as both `Authorization: Bearer <key>` and `apikey: <key>`
  (`api/upload/route.js`, `api/utils/mediaAccess.js`, `scripts/demo-seed/lib.mjs`). Supabase documents that
  non-JWT keys belong in `apikey`, and that `Authorization: Bearer` is only tolerated when it is identical to
  `apikey`. That is why step 3 comes before step 4. If uploads fail with the new key, see section 13, item 3.
- **Verify:** (a) upload a photo from the app (public bucket) and check it renders; (b) open a vet document or health
  photo (private bucket → signed URL via `GET /api/media?key=...`) and confirm it loads; (c) after step 4, repeat (a)
  and (b) once more; (d) `curl -s -o /dev/null -w '%{http_code}\n' "$SUPABASE_URL/rest/v1/" -H "apikey: <old legacy key>"`
  must now be `401`/`403` (read the old key with `read -rs`).

## 4 · Authentication

### 4.1 · `AUTH_SECRET`

- **Name:** `AUTH_SECRET` (Railway). Also the fallback signing key for unsubscribe links and for walk-pickup links.
- **Issued at:** nowhere. You generate it: `openssl rand -base64 33` (or `openssl rand -hex 32`).
- **Rotate:** set the new value on Railway, **Deploy** in a quiet window, announce nothing: users just land on the login
  screen. Because the value signs `@auth/core` JWTs, **all sessions (web and the mobile Bearer JWT) become invalid**.
- **Breaks:** everyone is logged out; mobile gets `401` and shows login. **Old unsubscribe links in sent emails stop
  working** (unless `NOTIF_UNSUBSCRIBE_SECRET` is set, section 4.2). **Old walk-pickup links stop working** (they only
  live 5 minutes anyway). Password-reset links are not affected (random tokens hashed in the database).
- **Verify:** log in on web and on the device; `GET /api/auth/token` after login returns a token; request a fresh
  unsubscribe link from a test email and open it; an unsubscribe link from before the rotation shows the "link invalid"
  page (expected).

### 4.2 · `AUTH_URL`, `NOTIF_UNSUBSCRIBE_SECRET`

- **Name:** `AUTH_URL` is the public origin (not secret). `NOTIF_UNSUBSCRIBE_SECRET` is optional: when set it signs
  unsubscribe links **instead of** `AUTH_SECRET`, which decouples email-link validity from session rotation.
- **Issued at:** generate locally, `openssl rand -hex 32`.
- **Rotate:** set on Railway and Deploy. **Setting it for the first time invalidates links signed with `AUTH_SECRET`**
  that are already in inboxes; rotating it invalidates all links signed with the previous value. Prefer to introduce it
  together with a planned `AUTH_SECRET` rotation, so you only break old links once.
- **Breaks:** unsubscribe links in already-sent emails.
- **Verify:** open a freshly generated unsubscribe link (works); open an old one (expected to be rejected).

### 4.3 · Google sign-in: `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`

- **Name / Issued at:** Google Cloud Console → APIs & Services → Credentials → the OAuth 2.0 Client (Web application).
  The client id is not secret; the client secret is.
- **Rotate:** in the client, **Add secret** (Google allows two at once), copy it, set `AUTH_GOOGLE_SECRET` on Railway,
  **Deploy**, test, then **disable/delete the old secret**.
- **Breaks:** "Continue with Google" fails until deployed. The app only shows the button when both vars are set
  (`GET /api/auth/social-enabled`).
- **Verify:** `curl -s https://www.pawpi.info/api/auth/social-enabled` returns `{"google":true,...}`; complete a real
  Google sign-in on the device (system browser flow).

### 4.4 · Sign in with Apple: `AUTH_APPLE_ID`, `AUTH_APPLE_TEAM_ID`, `AUTH_APPLE_KEY_ID`, `AUTH_APPLE_PRIVATE_KEY`, `AUTH_APPLE_SECRET`

- **Name:** `AUTH_APPLE_ID` (Services ID, not secret), `AUTH_APPLE_TEAM_ID` (`YHQ4T9T96K`, not secret),
  `AUTH_APPLE_KEY_ID` (identifies the key, not secret), **`AUTH_APPLE_PRIVATE_KEY`** (the `.p8` contents, secret).
  `AUTH_APPLE_SECRET` is the legacy pre-built client-secret JWT; it is ignored when the three vars above are all set.
  Leave it unset.
- **Issued at:** Apple Developer → Certificates, Identifiers & Profiles → Keys → **+** → "Sign in with Apple", bound
  to the primary App ID. The `.p8` can be downloaded **once**. The app signs its own client-secret JWT from the key on
  every request, so nothing expires silently.
- **Rotate:**
  1. Create the **new key** in Apple's console; download the `.p8` immediately into the password manager; note the new
     Key ID. (If Apple refuses because of a key-count limit, you may have to revoke one first; if so, do steps 2–3
     quickly.)
  2. On Railway update `AUTH_APPLE_PRIVATE_KEY` **and** `AUTH_APPLE_KEY_ID` together. Paste the PEM including the
     `-----BEGIN/END PRIVATE KEY-----` lines; real newlines or literal `\n` sequences both work
     (`api/utils/appleClientSecret.js` normalises them). **Deploy.**
  3. Test sign-in with Apple (below).
  4. **Revoke the old key** in the Apple console. Only now is the old key unusable.
  5. Delete the `.p8` file from Downloads; keep it only in the password manager.
- **Breaks:** only the **web** OAuth flow uses the key (client-secret JWT). The **native** iOS flow verifies Apple's
  identity token against Apple's public JWKS and does not use the key, so it keeps working throughout. A mismatched
  Key ID / key pair makes web Apple sign-in fail.
- **Verify:** `social-enabled` returns `"apple":true`; complete a web Apple sign-in; complete a native one on the device.
  Keep the old key until both pass.

## 5 · Payments

### 5.1 · `PAYMENTS_TOKEN_KEY`

- **Name:** `PAYMENTS_TOKEN_KEY` (Railway). 32-byte key, 64 hex chars or base64. AES-256-GCM key for providers'
  MercadoPago OAuth tokens at rest (`enc:v1:` prefix). Also the last-resort signing key for walk-pickup links when
  `AUTH_SECRET` is unset (it is always set in production).
- **Issued at:** nowhere; `openssl rand -hex 32`.
- **Rotate: avoid.** Rotate only if the key leaked. There is no re-encryption path: after the new key is deployed,
  every stored `enc:v1:` token fails to decrypt. Steps: set the new value, Deploy, then **tell every connected provider to
  reconnect MercadoPago** (Provider dashboard → Payments → Connect). Optionally clear the unreadable rows so the UI
  shows "not connected" rather than failing on charge (human-applied SQL, owner-reviewed first).
- **Breaks:** charges, refunds and payouts for providers who connected before the rotation, until they reconnect.
  Unconnected providers and customers are unaffected.
- **Verify:** reconnect a test provider against MercadoPago sandbox; create a sandbox checkout; the settlement webhook
  marks it paid. `anything/apps/web/src/app/api/utils/payments/tokenCrypto.test.js` covers the format.

### 5.2 · MercadoPago: `MP_CLIENT_ID`, `MP_CLIENT_SECRET`, `MP_WEBHOOK_SECRET`, `MP_REDIRECT_URI`

- **Name / Issued at:** MercadoPago Developers → Your integrations → the marketplace application → Credentials
  (client id + client secret) and Webhooks (signing secret). `MP_REDIRECT_URI` must match **byte for byte** the
  Redirect URL registered in the app (the provider-facing return page, not the `/api/.../callback` route); it is not
  secret.
- **Rotate:**
  - `MP_CLIENT_SECRET`: renew the credential in the MercadoPago application, set on Railway, **Deploy**, test an OAuth
    connect.
  - `MP_WEBHOOK_SECRET`: regenerate the webhook signing secret in the application, set on Railway, **Deploy**
    immediately (webhooks signed with the new secret fail verification until the deploy lands).
- **Breaks:** provider "Connect MercadoPago" (OAuth code exchange) and incoming payment notifications. A webhook
  rejected during the gap is retried by MercadoPago; check the dashboard's delivery log afterwards.
- **Verify:** connect a sandbox provider; run a sandbox payment; the webhook delivery shows `200` and the payment
  settles (migration `0135`). Open items for the live end-to-end test are tracked in `docs/db-migration-runbook-0135-payment-settlement.md`.

### 5.3 · Binance Pay: `BINANCE_PAY_API_KEY`, `BINANCE_PAY_API_SECRET`

- **Name / Issued at:** Binance Pay merchant console → API management. Currently dormant (rail not live); leave unset
  unless the rail is enabled.
- **Rotate:** create a new key pair, set both on Railway, **Deploy**, delete the old key.
- **Breaks:** crypto checkout only.
- **Verify:** `POST` a sandbox order; the payments route no longer answers "payments not configured" (503).

### 5.4 · `PLATFORM_COMMISSION_BPS`

Non-secret (basis points, 500 = 5%). Listed for completeness; see section 12.

## 6 · Cron: `CRON_SECRET` (+ `CRON_BASE_URL`, `CRON_TIMEOUT_MS`, `CRON_RETRIES`)

- **Name:** `CRON_SECRET`. Lives in **three** places that must agree: the backend service variable on Railway, each
  of the five `cron-*` services (by reference), and the GitHub Actions secret `CRON_SECRET` (manual fallback workflow
  `.github/workflows/cron-jobs.yml`). The other three variables are non-secret (`CRON_BASE_URL` = backend public
  origin; timeout default 120000 ms; retries default 2).
- **Issued at:** nowhere; `openssl rand -hex 32`.
- **Rotate:**
  1. Set the new value on the backend service in Railway. **Deploy the backend.**
  2. **Redeploy all five cron services**: `cron-weekly-digest`, `cron-winback`, `cron-push-receipts`,
     `cron-subscriptions`, `cron-calendar-sync` (lesson 2: their last deployment still holds the old value).
  3. GitHub → repo Settings → Secrets and variables → Actions → update `CRON_SECRET`.
- **Breaks:** until step 2, any cron run sends the old secret and gets `401`: weekly digest and win-back emails,
  push receipt checks (tickets stay pending), subscription charges (`cron-subscriptions`, daily 06:00 UTC) and
  calendar sync are skipped for that run. `cron-trigger.mjs` exits `1`, so Railway shows the run as failed, which is
  how you notice. Do not rotate close to 06:00 UTC.
- **Verify:** from the GitHub Actions tab run **Cron jobs (manual fallback)** with job `push-receipts` (harmless,
  idempotent): green = GitHub secret and backend agree. For each cron service, wait for its next scheduled run (or
  redeploy and check the next run) and confirm the log line shows a `2xx` status and the run is green. A wrong secret
  returns `401`; an unset secret on the backend returns `503` ("scheduler not configured").

## 7 · Email and public origins

- **`EMAIL_API_KEY`**
  - **Issued at:** Resend dashboard → API Keys (sending domain `send.pawpi.info`, verified there).
  - **Rotate:** create the new key (sending access, scoped to the domain), set on Railway, **Deploy**, send a test, delete
    the old key in Resend.
  - **Breaks:** password-reset, weekly digest and win-back emails. With the key unset the app logs
    `[email] EMAIL_API_KEY not set` and silently skips the send (nothing 500s), so a wrong rotation looks like
    "no email arrives".
  - **Verify:** request a password reset for a test account; the email arrives; Resend's Logs show `delivered`.
- `EMAIL_FROM`, `EMAIL_REPLY_TO`, `EMAIL_PROVIDER`, `EMAIL_API_BASE_URL` are non-secret (section 12).
- **`APP_BASE_URL`** (builds reset links; **set it in production**, otherwise the link is derived from the request
  Host header, which can be forged) and **`PUBLIC_BASE_URL`** / **`AUTH_URL`** (unsubscribe link origin) are
  non-secret, but must be the real public origin `https://www.pawpi.info`. Check them after any domain change.

## 8 · Other third-party keys on Railway

### 8.1 · `EXPO_ACCESS_TOKEN`
- **Issued at:** expo.dev → Account settings → Access tokens (used for the Expo Push API, "enhanced push security").
- **Rotate:** create a new token, set on Railway, **Deploy**, revoke the old token.
- **Breaks:** push sends and receipt checks return `401`/`403`; notifications silently stop reaching phones.
- **Verify:** trigger a test notification to your own device (for example from `cron-push-receipts` logs: no auth
  errors) and confirm it arrives.

### 8.2 · Telehealth video: `VIDEO_API_KEY`, `VIDEO_API_SECRET`, `VIDEO_BASE_URL`, `VIDEO_PROVIDER`, `VIDEO_ROLLOUT_PCT`
- **Issued at:** Daily.co dashboard → Developers → API keys (`VIDEO_PROVIDER=daily` needs only `VIDEO_API_KEY`).
  `VIDEO_API_SECRET` is only for the `generic` placeholder provider. The others are non-secret.
- **Rotate:** new key in Daily, set on Railway, **Deploy**, delete the old key.
- **Breaks:** joining a telehealth consult (the join route returns a clean `503` "Video consults aren't set up yet").
- **Verify:** book and join a test consult.

### 8.3 · `GOOGLE_PLACES_API_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`
- **Issued at:** Google Cloud Console → APIs & Services → Credentials. The Places key is server-side (restrict by API
  and, if possible, IP). The Maps **browser** key ships to browsers by design: it must be restricted by **HTTP
  referrer** (`https://www.pawpi.info/*`) and API; rotating it is a rebuild (`NEXT_PUBLIC_*` is inlined at build time).
- **Rotate:** create the replacement key with restrictions, set on Railway, **Deploy** (rebuilds for the browser key),
  delete the old key.
- **Breaks:** provider enrichment "import from the web" (503 when unset); the web location map pin falls back to
  manual lat/lng.
- **Verify:** run an enrichment on a provider; open the provider Locations form and see the map.

### 8.4 · `ENRICHMENT_LLM_KEY`, `ANTHROPIC_API_KEY` (Railway), `ANTHROPIC_MODEL`
- **Issued at:** console.anthropic.com → API keys. `ANTHROPIC_API_KEY` powers pet-document ingestion (vision) and may
  also be used by enrichment; `ENRICHMENT_LLM_KEY` is the enrichment-specific key. `ANTHROPIC_MODEL` is non-secret.
- **Rotate:** new key(s) in the Anthropic console, set on Railway, **Deploy**, delete the old key(s). The **GitHub**
  `ANTHROPIC_API_KEY` secret is a separate store (section 10.2).
- **Breaks:** document upload extraction and web enrichment return `503` "not set up yet"; uploads and manual record entry
  keep working.
- **Verify:** upload a vet document and see proposed records; run one enrichment.

### 8.5 · `ENRICHMENT_FETCH_ALLOWED_HOSTS`
Non-secret allow-list for the SSRF-safe fetcher (the Supabase Storage host is added automatically from `SUPABASE_URL`).

## 9 · Observability (Grafana Cloud)

All Grafana tokens come from the Grafana Cloud stack (grafana.com → My Account → the stack; and inside the stack,
Administration → Users and access → Service accounts). Never reuse one token across purposes: each below has its own.

### 9.1 · `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS` (metrics + traces)
- **Name:** `OTEL_EXPORTER_OTLP_HEADERS` (secret) with `OTEL_EXPORTER_OTLP_ENDPOINT`
  (`https://otlp-gateway-prod-<region>.grafana.net/otlp`, not secret). Optional non-secret siblings: `OTEL_SERVICE_NAME`
  (default `pawpi-web`), `OTEL_LOGS_ENABLED` (leave unset), `OTEL_TRACES_SAMPLER` / `OTEL_TRACES_SAMPLER_ARG` (20%
  sampling).
- **Issued at:** Grafana Cloud → the stack → OpenTelemetry → "Configure": shows the **Instance ID** and lets you
  generate a token (an access policy token with `metrics:write`, `traces:write`; add `logs:write` only if
  `OTEL_LOGS_ENABLED` is ever used).
- **Rotate:**
  1. Create the new token. Build the header value without echoing it:
     ```bash
     read -rs OTLP_TOKEN; read -r OTLP_INSTANCE_ID
     printf 'Authorization=Basic%%20%s' "$(printf '%s:%s' "$OTLP_INSTANCE_ID" "$OTLP_TOKEN" | base64 | tr -d '\n')" | pbcopy
     ```
     Paste from the clipboard into Railway as `OTEL_EXPORTER_OTLP_HEADERS`, then clear the clipboard.
     Format: `Authorization=Basic%20` + base64(`<instanceId>:<token>`). The `%20` is literal.
  2. **Deploy** the backend.
  3. Verify (below), then delete the old token in Grafana.
- **Breaks:** metrics and traces stop arriving (a gap) while the header is wrong. After 10 silent minutes the
  `P1-ServerMetricsSilent` alert fires and can open an autofix run (issue-only for this alert; it is never
  auto-merged). Do the change and the deploy in one sitting.
- **Verify:**
  - Gateway accepts the credentials (same value, no token on screen):
    ```bash
    read -rs OTLP_TOKEN; read -r OTLP_INSTANCE_ID; read -r OTLP_ENDPOINT   # endpoint ends in /otlp
    curl -s -o /dev/null -w '%{http_code}\n' -X POST "$OTLP_ENDPOINT/v1/metrics" \
      -u "$OTLP_INSTANCE_ID:$OTLP_TOKEN" -H 'Content-Type: application/json' -d '{"resourceMetrics":[]}'
    ```
    → `200`. `401` = wrong instance id or token; `403` = token lacks `metrics:write`.
  - Railway deploy log shows `[otel] telemetry started`.
  - Grafana → Explore → Prometheus: `pawpi_process_uptime_seconds` has samples from the last minute (metrics resume).
  - Grafana → Alerting → `P1-ServerMetricsSilent` returns to **Normal** (allow the 5 min pending window plus one
    evaluation after the first new sample).

### 9.2 · Loki logs: `GRAFANA_LOKI_URL`, `GRAFANA_LOKI_USER`, `GRAFANA_LOKI_TOKEN`, `LOG_*`
- **Name:** `GRAFANA_LOKI_TOKEN` is the **plain token** (not base64, no `Basic`). `GRAFANA_LOKI_USER` is the numeric
  Loki user id; `GRAFANA_LOKI_URL` is the base `https://logs-prod-<n>.grafana.net` (a full `/loki/api/v1/push` also works).
  **All three or none**: with any missing, log shipping is off. `LOG_SHIP_ENABLED`, `LOG_LEVEL`, `LOG_STDOUT`,
  `LOG_SAMPLE_2XX`, `LOG_MAX_LINES_PER_SEC`, `LOG_MAX_ERROR_LINES_PER_SEC` are non-secret knobs (section 12).
- **Issued at:** Grafana Cloud → stack → Loki → Send logs (shows URL and user), token from an access policy with
  `logs:write`.
- **Rotate:** create the new token, set `GRAFANA_LOKI_TOKEN`, **Deploy**, verify, delete the old token.
- **Breaks:** `job="pawpi-web"` and `job="pawpi-client"` logs stop; nothing user-facing.
- **Verify:** `read -rs LOKI_TOKEN; read -r LOKI_USER LOKI_URL; curl -s -o /dev/null -w '%{http_code}\n' -u "$LOKI_USER:$LOKI_TOKEN" "$LOKI_URL/loki/api/v1/labels"`
  shows `200` (a read check; the write token may only be allowed to push, in which case a `403` here is acceptable and the real
  proof is the next line). Then Explore → `{job="pawpi-web"}` shows new lines within a minute of the deploy.

### 9.3 · `GRAFANA_URL`, `GRAFANA_ANNOTATION_TOKEN`, `GRAFANA_ANNOTATE_DEPLOY` (deploy annotations)
- **Name:** `GRAFANA_ANNOTATION_TOKEN` is a stack **service-account token** limited to annotations write (falls back to
  `GRAFANA_SA_TOKEN`). `GRAFANA_URL` = `https://<stack>.grafana.net` (non-secret). It exists in **two stores**: a Railway
  variable (deploy annotation) and a GitHub Actions secret (annotation when an automatic merge is reverted). Rotate both.
- **Issued at:** Grafana → Administration → Service accounts → add token.
- **Rotate:** new token, update Railway **and** GitHub, **Deploy**, delete the old token.
- **Breaks:** the "deploy" marker on the `pawpi-overview` dashboard and the revert annotation.
- **Verify:** after the deploy, a new annotation appears on `pawpi-overview`; the Railway start log has a
  `[deploy-annotation]` status line (status only, never the token).

### 9.4 · `GRAFANA_SA_TOKEN` (operator laptop)
- **Used by:** `scripts/observability/apply-grafana.mjs` (dashboards, alerts, routing) and as an annotation fallback.
  Not needed on Railway. Service-account token with dashboards/folders write, datasources read, alert rules, policies
  and contact points write.
- **Rotate:** new token, update the password manager, delete the old token. Nothing to deploy.
- **Verify:** `GRAFANA_URL=... GRAFANA_SA_TOKEN=... node scripts/observability/apply-grafana.mjs --sections all`
  (dry run, no `--apply`) completes without auth errors.

### 9.5 · `GRAFANA_SM_URL`, `GRAFANA_SM_TOKEN`, `GRAFANA_PROM_DS`, `GRAFANA_LOKI_DS`, `ALERT_DIGEST_EMAIL`
- `GRAFANA_SM_TOKEN` (Synthetic Monitoring access token; Grafana → Testing & synthetics → Config) is used only by
  `apply-grafana.mjs` on the laptop. Rotate in the same way as 9.4, verify with the dry run including synthetics.
  The rest are non-secret (SM API URL, datasource overrides, digest recipient).

### 9.6 · `ALERT_WEBHOOK_SECRET`, `ALERT_MAX_DISPATCHES_PER_HOUR`
- **Name:** `ALERT_WEBHOOK_SECRET` is the shared bearer between Grafana and the app relay
  (`POST /api/internal/grafana-alert`). It is stored in **two** places: Railway and the Grafana webhook contact point
  `Augusto`. `ALERT_MAX_DISPATCHES_PER_HOUR` (default 6) is non-secret.
- **Issued at:** nowhere; `openssl rand -hex 32`.
- **Rotate:** set on Railway and **Deploy**, then update the contact point in Grafana (Alerting → Contact points →
  `Augusto` → webhook → Authorization credentials), or re-run `apply-grafana.mjs --sections routing --apply` with the
  new value in the environment.
- **Breaks:** between the two updates, alert relays are rejected (`401`) and **no autofix run starts**.
- **Verify:** use the contact point's "Test" button; the relay answers `2xx` (a known test name is accepted or ignored
  with `202`, never `401`). Check the Railway log for the relay line.

## 10 · GitHub: autofix and CI

### 10.1 · GitHub fine-grained PAT `pawpi-autofix`: `GITHUB_DISPATCH_TOKEN` (Railway) and `AUTOFIX_PAT` (GitHub secret)
- **Name:** one PAT, two settings: `GITHUB_DISPATCH_TOKEN` (Railway backend; the alert relay calls the GitHub API) and
  `AUTOFIX_PAT` (GitHub Actions secret; the autofix workflow uses it to push branches and open PRs). `GITHUB_REPO`
  (default `augustotraversa98-dot/PawPi`) and `AUTOFIX_ENABLED` (a GitHub *variable*, `false` = kill switch) are
  non-secret.
- **Issued at:** GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → **pawpi-autofix**
  (resource owner: the repo owner; repository access: only this repo). Permissions: **Contents: write**, **Actions:
  read** (hourly-cap count) and whatever the workflow needs to open PRs (**Pull requests: write**); keep it the minimum.
  **Expires after 90 days: the current token expires on 2027-01-20.**
- **Rotate:**
  1. Regenerate (or create a replacement) with the same permissions and a 90-day expiry; note the new expiry date here.
  2. Update **both** `GITHUB_DISPATCH_TOKEN` on Railway (**Deploy**) and `AUTOFIX_PAT` in the repo's Actions secrets.
  3. Delete/revoke the old token if you created a new one rather than regenerating.
  4. Put the next reminder in the calendar one week before expiry (**2027-01-13**).
- **Breaks:** the Grafana → relay → GitHub dispatch fails closed (`503`), so no autofix run starts; PRs from the
  workflow cannot be opened. Nothing user-facing.
- **Verify:** Grafana contact point "Test" → relay returns `2xx`, a `claude-autofix` run appears in the Actions tab (or is
  ignored for an unknown alert name); if the relay returns `503`, the PAT is expired or missing **Actions: read**.
- `GITHUB_TOKEN` in workflows is issued automatically per run; there is nothing to rotate.

### 10.2 · `CLAUDE_CODE_OAUTH_TOKEN`, `ANTHROPIC_API_KEY` (GitHub Actions secrets)
- **Issued at:** `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token` run locally; `ANTHROPIC_API_KEY` from the Anthropic
  console (separate from the Railway keys of the same name so a leak in one place can be revoked on its own).
- **Rotate:** generate the replacement, update the repo's Actions secret, run a harmless autofix dry run (section below),
  revoke the old token/key.
- **Breaks:** the autofix workflow fails at the Claude step.
- **Verify:** Actions → `claude-autofix` → run with the manual trigger and a known test alert; the Claude step starts.
- **Obsolete:** the repo secret `GRAFANA_TOKEN` is no longer used (`docs/observability/OPERATIONS.md`); delete it if it
  still exists.

## 11 · Legacy "Anything" platform leftovers

- **`CREATE_TEMP_API_KEY`** and **`ANYTHING_PROJECT_TOKEN`** (a JWT that sat in the untracked local
  `anything/apps/web/.env`) belong to the platform this app was exported from. Neither is needed in production, and
  neither is read by the web app any more: the only reader of `CREATE_TEMP_API_KEY` was the `stripe` shim
  (`src/__create/stripe.ts`, a Vite alias that routed Stripe calls through the Anything platform), which nothing imported
  and which has been removed. If either variable exists in Railway or on the laptop, **delete it** instead of rotating
  it, and revoke it in the Anything project settings if that account is still reachable. (The mobile app still has a
  separate `EXPO_PUBLIC_CREATE_TEMP_API_KEY`, used by its Anything error reporter; that one ships inside the app and is
  out of scope here.) `NEXT_PUBLIC_CREATE_*` / `NEXT_PUBLIC_PROJECT_GROUP_ID`
  are non-secret identifiers from the same scaffolding.

## 12 · Non-secret configuration variables (no rotation)

These are read by the code but are not credentials. They are listed so the inventory is complete and so nobody
"rotates" them by mistake. Change them like any variable (stage → Deploy).

| Variable | What it is |
|---|---|
| `SUPABASE_URL` | Project URL |
| `DATABASE_SSL` | `disable` only for a local non-SSL Postgres |
| `AUTH_URL`, `APP_BASE_URL`, `PUBLIC_BASE_URL`, `APP_WEB_ORIGIN`, `CORS_ORIGINS` | Public origins (production: `https://www.pawpi.info`) |
| `AUTH_APPLE_ID`, `AUTH_APPLE_TEAM_ID`, `AUTH_APPLE_KEY_ID`, `AUTH_GOOGLE_ID` | Public identifiers |
| `MP_REDIRECT_URI`, `PLATFORM_COMMISSION_BPS` | MercadoPago return page; commission in basis points |
| `CRON_BASE_URL`, `CRON_TIMEOUT_MS`, `CRON_RETRIES` | Cron trigger tuning (cron services) |
| `EMAIL_FROM`, `EMAIL_REPLY_TO`, `EMAIL_PROVIDER`, `EMAIL_API_BASE_URL` | Mail identity and provider (`resend`) |
| `VIDEO_PROVIDER`, `VIDEO_BASE_URL`, `VIDEO_ROLLOUT_PCT` | Telehealth vendor config; rollout 0 – 100 (default 10) |
| `ANTHROPIC_MODEL`, `ENRICHMENT_FETCH_ALLOWED_HOSTS` | AI model name; SSRF allow-list |
| `CALENDAR_SYNC_PROVIDER` | Reserved for a future calendar-sync adapter selector; **not read by any code today** |
| `NOTIF_V2_ENABLED`, `NOTIF_V2_DAILY_CAP` | Notifications v2 flag and cap |
| `TELEMETRY_INGEST_ENABLED`, `TELEMETRY_SAMPLE_RATE` | Mobile telemetry kill switch / sampling |
| `OTEL_SERVICE_NAME`, `OTEL_LOGS_ENABLED`, `OTEL_TRACES_SAMPLER`, `OTEL_TRACES_SAMPLER_ARG` | OpenTelemetry knobs |
| `GRAFANA_URL`, `GRAFANA_ANNOTATE_DEPLOY`, `GRAFANA_PROM_DS`, `GRAFANA_LOKI_DS`, `GRAFANA_SM_URL`, `ALERT_DIGEST_EMAIL`, `ALERT_MAX_DISPATCHES_PER_HOUR` | Grafana wiring |
| `LOG_SHIP_ENABLED`, `LOG_LEVEL`, `LOG_STDOUT`, `LOG_SAMPLE_2XX`, `LOG_MAX_LINES_PER_SEC`, `LOG_MAX_ERROR_LINES_PER_SEC` | Server log shipping knobs |
| `GITHUB_REPO`, `AUTOFIX_ENABLED` | Autofix target repo; kill switch (GitHub *variable*) |
| `NEXT_PUBLIC_PRIVACY_POLICY_URL`, `NEXT_PUBLIC_TERMS_URL`, `NEXT_PUBLIC_PRIVACY_VERSION`, `NEXT_PUBLIC_TERMS_VERSION` | Legal links and versions (consent ledger) |
| `NEXT_PUBLIC_CREATE_API_BASE_URL`, `NEXT_PUBLIC_CREATE_BASE_URL`, `NEXT_PUBLIC_CREATE_ENV`, `NEXT_PUBLIC_CREATE_HOST`, `NEXT_PUBLIC_PROJECT_GROUP_ID` | Platform scaffolding identifiers |
| `ALLOW_PROD_SEED`, `SEED_DEMO`, `SEED_DEMO_RESET` | Demo-seed guard rails (laptop scripts only) |
| `RAILWAY_ENVIRONMENT_NAME`, `RAILWAY_GIT_COMMIT_SHA` | Injected by Railway; never set by hand |
| `NODE_ENV`, `PORT`, `DEV`, `SSR` | Runtime / build flags |

## 13 · Findings from the 2026-10-22 audit (follow-ups, not done here)

1. **Variables read in code but missing from `.env.example` and `docs/`.** Seven were found on 2026-10-22
   (`CALENDAR_SYNC_PROVIDER`, `DATABASE_SSL`, `GITHUB_REPO`, `NEXT_PUBLIC_PRIVACY_VERSION`, `NEXT_PUBLIC_TERMS_VERSION`,
   `PLACES_DATABASE_URL`, `VIDEO_ROLLOUT_PCT`); they are now in `anything/apps/web/.env.example` as commented
   placeholders and in section 12. Still open: about 60 variables are documented in `docs/` only, not in `.env.example`
   (notably `DATABASE_URL`, `AUTH_SECRET`, `SUPABASE_*`, `GRAFANA_*`, `OTEL_*`, `LOG_*`, `ALERT_*`).
2. **Resolved:** `docs/ops/railway-cron.md` used to say that rotating `CRON_SECRET` on the backend "rotates it
   everywhere". It now says the five cron services must be redeployed (lesson 2) and links here.
3. **Supabase new-style keys and the `Authorization: Bearer` header.** `api/upload/route.js`, `api/utils/mediaAccess.js`
   and `scripts/demo-seed/lib.mjs` send the key as both `Authorization: Bearer <key>` and `apikey: <key>`. Supabase's
   documentation says `sb_secret_...` keys are not JWTs, belong in `apikey`, and are only tolerated in
   `Authorization` when identical to `apikey`. Production uploads work today, so this is robustness only. The smallest
   fix, if a future key change breaks storage calls: build the headers with a tiny helper that always sends `apikey` and
   adds `Authorization: Bearer` only when the key looks like a JWT (starts with `eyJ`). Three call sites, no behaviour
   change for the legacy key.
4. **Migration `0019` creates `pawpi_app` with the literal password `pawpi_app`** when the role does not exist. Fine for
   the throwaway test database; on any new real database it must be changed before the database is reachable (section 2.1).
5. **Accepted known fixtures:** the shared demo/QA seed password in `anything/apps/web/scripts/demo-seed/spec.mjs` is
   allow-listed in `.gitleaks.toml` by owner decision. It must never be a password used anywhere else.

## Post-rotation checklist

- [ ] Every changed Railway variable was **deployed** (no staged changes left in the service).
- [ ] All five cron services redeployed if `CRON_SECRET` changed; GitHub `CRON_SECRET` matches.
- [ ] `GET /api/health/deep` returns `200`; a login works; an upload works; a private file opens.
- [ ] Old credentials **revoked** at the issuer (Apple key, Supabase legacy keys, Grafana/Resend/Expo/Anthropic old tokens).
- [ ] `P1-ServerMetricsSilent` is Normal; metrics visible in Grafana.
- [ ] Password manager updated; no value in chat, shell history, PRs or docs.
- [ ] Rotation log below updated; PAT expiry reminder (**2027-01-13**) in the calendar.

## Rotation log

| Date | What was rotated | Who | Notes |
|---|---|---|---|
| 2026-10-21 | All Railway-stored secrets (response to the Railway breach), by hand | Augusto | App redeployed and verified. Lessons in section 1. PAT `pawpi-autofix` now expires 2027-01-20. |
