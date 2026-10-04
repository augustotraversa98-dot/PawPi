# PawPi — Observability & Self‑Healing Operations Runbook

**Status: LIVE.** PawPi watches itself (Grafana Cloud), alerts you (email), and drafts
fixes for your approval (Claude → PR). Nothing auto‑deploys. This doc is the single
source of truth for operating it.

_Last updated: 2026‑10‑04._

---

## 1. What's running

```
  Railway: PawPi web/API (React Router + Hono)
    │  OpenTelemetry (instrumentation.mjs, loaded via the start script)
    │  + Hono middleware for HTTP metrics + payment counters
    ▼
  Grafana Cloud (FREE tier)  ── dashboards + 3 live alert rules (+ 15 paused P1/P2 rules, section 5f)
    │        (alert fires → emails you AND ↓)
    ▼
  App relay: POST /api/internal/grafana-alert  (Bearer secret)
    │  → GitHub repository_dispatch (event: grafana-alert)
    ▼
  GitHub Action: .github/workflows/claude-autofix.yml
    │  Claude reads the alert + code → minimal fix OR diagnosis
    ▼
  Opens a PR (fix)  or  Issue (diagnosis)   ← you review
    │  CI (ci.yml) gates the PR → you merge → Railway auto‑deploys
```

No step ever deploys to production without your merge.

---

## 2. Component inventory

### Code (in this repo, live in production)
| Piece | Path | Commit |
|---|---|---|
| OTel bootstrap (traces+metrics, no‑op if unconfigured) | `anything/apps/web/instrumentation.mjs` | 68857a1 |
| Loaded via start script (`node --import ...`) | `anything/apps/web/package.json` | 0ad3496 |
| HTTP request metrics middleware (bundling‑proof) | `anything/apps/web/__create/index.ts` | 027a319 |
| Payment counters (attempt/success/failure) | `anything/apps/web/src/lib/metrics.js` + checkout route + `utils/payments/index.js` | 42c9180 |
| Alert relay route | `anything/apps/web/src/app/api/internal/grafana-alert/route.js` | 68857a1 / b6ae96a |
| Autofix workflow | `.github/workflows/claude-autofix.yml` | c92546b |

### Grafana Cloud (free tier)
- **Dashboard:** "PawPi — API health (RED)" (import source: `docs/observability/dashboard.json`).
- **Alerts** (folder `PawPi`, group `PawPi`, no‑data → Normal on each):
  - `HighServerErrorRate` — 5xx rate > 5% for 5m.
  - `HighLatencyP95` — p95 > 3s for 10m.
  - `PaymentFailuresSpike` — failure rate > 20% over 15m (populates on first real checkout).
- **Contact point:** `Augusto` — has **email** + **webhook** (webhook → the relay route).

### Credentials (names only — values live in the platforms)
| Name | Where | Purpose |
|---|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` / `_HEADERS` | Railway | Ship telemetry to Grafana OTLP |
| `OTEL_TRACES_SAMPLER` / `_ARG` | Railway | Trace sampling (free‑tier control) |
| `ALERT_WEBHOOK_SECRET` | Railway + Grafana webhook | Auth the Grafana→app call |
| `GITHUB_DISPATCH_TOKEN` | Railway | App → GitHub `repository_dispatch` |
| `AUTOFIX_PAT` | GitHub secret | Bot opens PR/Issue (Contents+PR+Issues RW) |
| `CLAUDE_CODE_OAUTH_TOKEN` | GitHub secret | Claude auth in CI (your Max plan, $0 extra) |

---

## 3. How to operate

**When an alert fires:** you get an email, and the loop opens either a **PR** (Claude
found a safe, tested fix) or an **Issue** (diagnosis only, no change). Review it like
any PR/issue. PRs are gated by CI; merging one triggers a Railway deploy.

**Reviewing an autofix PR:** read Claude's incident summary in the PR body, check the
diff, let CI go green, merge if you agree. Close it if you disagree — nothing is lost.

**Test issues:** the two from setup (`ManualTest`, `TestAlert`) can be closed as "not
planned." Filter all loop output by the `autofix` label.

**Kill switch:** GitHub → Actions → "Claude autofix" → ⋯ → **Disable workflow**. Or
remove `GITHUB_DISPATCH_TOKEN` in Railway (the relay stops firing). Re‑enable anytime.

**Add / tune an alert:** Grafana → Alerting → Alert rules → New (copy an existing one).
Queries and thresholds for more rules are in `docs/observability/GRAFANA_SETUP.md`.
If an alert is noisy, raise its threshold or increase the pending period.

**Cost:** Grafana is free‑tier forever (no card on file, so it can't bill you). The
autofix Claude runs on your Max plan via the OAuth token — $0 extra. It only runs when
an alert actually fires.

---

## 4. Known limitations (by design / platform)

- **No request traces / Application Observability.** The server is Vite‑bundled, which
  blocks OpenTelemetry's automatic HTTP instrumentation. Metrics work (measured at the
  Hono layer); distributed traces would need un‑bundling the server — deferred.
- **Payment metrics need traffic.** `pawpi_payment_*` only exist after real checkouts;
  the payment alert stays Normal (via no‑data→Normal) until then.
- **Trace sampling is 20%** (`OTEL_TRACES_SAMPLER_ARG=0.2`). At higher traffic this
  protects the free‑tier quota; raise toward 1.0 while volume is low if you want more.
- **Logs are not shipped to Grafana** (`OTEL_LOGS_ENABLED` unset) to protect the 50GB
  logs quota. Railway keeps its own logs.

---

## 5. Troubleshooting quick‑reference (issues already solved)

| Symptom | Cause | Fix |
|---|---|---|
| Deploy fails: `Cannot find module '/app/instrumentation.mjs'` | `NODE_OPTIONS` poisons the *build* toolchain | Load `--import` in the **start script**, not `NODE_OPTIONS` (0ad3496) |
| Metric not in Grafana dropdown, no `http_*` metrics | Bundling blocks auto HTTP instrumentation | Hono middleware emits the metric (027a319) |
| Relay returns 502, GitHub 422 "No more than 10 properties" | `client_payload` had 11 keys (max 10) | Trimmed to 9 (b6ae96a); since Step D exactly 10 fixed keys, enforced by `grafana-alert/route.test.js` |
| Workflow green but no Issue/PR; log `Header … invalid value` | Claude token saved with a newline/space | Re‑paste `CLAUDE_CODE_OAUTH_TOKEN` as one clean line |
| Log `Resource not accessible by personal access token (createIssue)` | PAT missing Issues permission | Add **Issues: Read and write** to the fine‑grained PAT |
| Alert flips to "NoData" and emails you when idle | Query returns empty with no traffic | Set the rule's **no‑data → Normal** |

---

## 5b. Client diagnostics (`[client-diagnostics]` log line)

The mobile app can report "something that should never happen" via `POST /api/client-diagnostics`
(authenticated, allow‑listed event names, no DB, per‑user cap of 5/min per instance). The only effect is
**one structured line in the Railway deploy logs** — search for `[client-diagnostics]`.

Event `onboarding_wizard_for_existing_owner` (added after an owner who had finished onboarding was thrown
back into the wizard after tapping Services — see PR #596): fired when an account that already has a dog
reaches an onboarding screen (`where: "mount"`) or is about to create one (`where: "submit"`). Fields:
`auth_user_id`, `screen`, `session_age_s` (seconds since the app's JS session started — **a tiny value means the
app had just restarted; a large one means a navigation did it**), `trail` (last ≤15 screens with how many
seconds ago each was shown, e.g. `/services` → `/onboarding-photo`), `platform`, `os_version`, `app_version`,
`build`. Ids and screen paths only — never add PII to this beacon.

---

## 5c. Server metrics (night-run Step A)

Emitted by the web/API process over the same OTLP pipe as the legacy metrics (no-op without
`OTEL_EXPORTER_OTLP_ENDPOINT`; every metric call is wrapped so it can never throw into a request).
Names/labels are the contract in `docs/observability/night-run/01-TELEMETRY-CONTRACT.md`; label values are
**bounded** (no ids, query strings, emails, raw paths) and a test (`src/lib/telemetry/labels.test.js`) fails if
any label looks unbounded. In Grafana/Prometheus, counters appear with `_total` and histograms as
`_bucket/_sum/_count`.

| Metric | Type | Labels | Where it is emitted |
|---|---|---|---|
| `pawpi_http_requests_total` | counter | `area`, `route`, `method`, `status_class` | Hono middleware, `__create/index.ts` |
| `pawpi_http_request_duration_seconds` | histogram (s) | `area`, `route`, `method` | same |
| `pawpi_db_query_duration_seconds` | histogram (s) | `op` (select/insert/update/delete/other) | shared `sql` helper, `src/app/api/utils/sql.js` |
| `pawpi_db_errors_total` | counter | `op` | same |
| `pawpi_business_events_total` | counter | `event`, `outcome` (ok/fail), `method` (credentials/google/apple/none) | real code sites, see below |
| `pawpi_health_deep_ok` | gauge | - | updated on every `GET /api/health/deep` (absent until the first call) |
| `pawpi_process_memory_bytes` | gauge | `kind` (rss/heap_used/heap_total/external) | `src/lib/telemetry/process.js` |
| `pawpi_process_event_loop_lag_seconds` | gauge | - | p99 event-loop delay since the previous export |
| `pawpi_process_uptime_seconds` | gauge | - | drops to ~0 on a restart/deploy |

- `route` is the matched Hono route template with every parameter as `:id` (`/api/pets/:id/profile`). SPA pages/assets
  are `/__page`, unmatched `/api/...` is `unmatched`. `area` comes from `src/lib/telemetry/areas.js` (the one prefix map).
- The **legacy** `http.server.request.duration` histogram and `pawpi.payment.*` counters are unchanged: the 3 live alert
  rules still read them; Step D leaves those rules untouched (section 5f says when they could be re-pointed).
- DB metrics label the operation only (first SQL keyword), never SQL text or params. Queries issued on a raw
  `sql.begin(tx => ...)` handle (not through the shared `sql` import) and the health probe are not counted.
- Business events (`recordBusinessEvent` in `src/lib/telemetry/business.js`; unknown values are dropped):
  `signup`/`signin` (credentials `authorize` callbacks ok/fail; Apple-native `authorize`; Google via the auth adapter,
  ok only), `pet_created` (POST /api/pets), `post_created` (POST /api/posts), `health_log_created` (POST on every
  `/api/health/*` log/record route except walk-logs), `walk_logged` (POST /api/health/walk-logs), `routine_created`
  (POST /api/routines), `booking_created` (POST /api/providers/:id/book and POST /api/vet-appointments),
  `order_created` (POST /api/payments/checkout and POST /api/pets/:id/shop-checkout), `push_token_registered`
  (POST /api/push-tokens). Creation events count successful creations (`ok`); creation failures show up as 5xx in the
  HTTP metrics by `area`.
- `service.version` on every series = `RAILWAY_GIT_COMMIT_SHA` first 7 chars (`dev` locally), set in `instrumentation.mjs`.

**`GET /api/health/deep`** — public, no auth, `Cache-Control: no-store`. Runs a bare `select 1` on the DB pool
(3s timeout) and returns `{ "ok": true, "db_ms": 4, "version": "abc1234" }`, or **503** `{ "ok": false, ... }` if the
database is unreachable/slow. The body never contains error text or config. Use it for uptime/synthetic checks and as the
deploy signal (it returns JSON only once the new build is live; before that the SPA catch-all answers with HTML).

---

## 5d. Client telemetry ingest (night-run Step B)

Anonymous behaviour telemetry from the mobile app (ships with app build 25; the endpoints are live earlier and simply idle).
Full privacy/retention description: `docs/privacy/telemetry.md`. Names/labels/events are the contract in
`docs/observability/night-run/01-TELEMETRY-CONTRACT.md`; the allowlist is `src/lib/telemetry/registry.js`.

**Endpoints** (both public, no auth, no database)
- `POST /api/telemetry/events` — batched events. Body <= 32 KB and <= 50 events (else 413 / 400), strict registry validation,
  per-`install_id` (30/min) and per-IP (300/min) in-memory rate limit (429), `204` on success even if some events were dropped,
  `400` for a bad envelope, never 5xx. The client IP is hashed in memory for the limiter only and is never stored, logged or emitted.
- `GET /api/telemetry/config` — `{ "enabled": true, "sampleRate": 1 }`, `Cache-Control: public, max-age=300`. The app reads it
  to honour the kill switch and sampling.

**Env vars** (Railway, web service)
| Var | Effect |
|---|---|
| `TELEMETRY_INGEST_ENABLED` | `false` = KILL SWITCH: ingest answers 204 and discards, config reports `enabled:false` (apps stop sending within ~5 min). Unset/anything else = on. |
| `TELEMETRY_SAMPLE_RATE` | 0..1 (default 1), returned by the config endpoint; the app samples sessions with it. |
| `GRAFANA_LOKI_URL`, `GRAFANA_LOKI_USER`, `GRAFANA_LOKI_TOKEN` | Loki push (Grafana Cloud). URL may be the base (`https://logs-prod-XXX.grafana.net`) or the full `/loki/api/v1/push`. All three or no Loki shipping (metrics still work). |

**What it emits**
- Metrics (via the existing OTLP pipe): `pawpi_client_events_total`, `pawpi_client_screen_views_total`, `pawpi_client_errors_total`,
  `pawpi_client_api_calls_total`, `pawpi_client_api_duration_seconds`, `pawpi_client_screen_ready_seconds`,
  `pawpi_client_startup_seconds`, `pawpi_client_sessions_total`, `pawpi_funnel_step_total`, and
  `pawpi_telemetry_ingest_total{result=accepted|dropped|invalid|rate_limited}` (watch `invalid`/`rate_limited` spikes: a client bug or abuse).
  Durations arrive as buckets, so the histograms are bucket-resolution. `app_version` is validated and capped at 20 distinct values per
  process (then `other`); a flood of fake versions can push a genuinely new release into `other` until the next deploy/restart.
- Loki: ONE JSON line per accepted event, stream labels ONLY `{job="pawpi-client", event, app_version, platform}`; the line holds
  `install_id`, `session_id`, `event`, `props`, `t`, `screen`, `os_major`, `locale`, `build`, `app_version`, `platform`, `sent_at`.
  Batched (5 s / 100 lines), queue capped at 2000 lines (oldest dropped), 5 s timeout, errors swallowed. The shipper
  (`src/lib/telemetry/loki.js`) is generic so server logs can reuse it with `job="pawpi-web"`.
- Caveat: requests are counted per instance (limiter state is in memory). No state survives a restart.

**Verify with curl** (replace the host; a fresh uuid per run):
```bash
H=https://YOUR-HOST
curl -s -i $H/api/telemetry/config                       # 200 {"enabled":true,"sampleRate":1}
curl -s -o /dev/null -w '%{http_code}\n' -X POST $H/api/telemetry/events -H 'content-type: application/json' -d '{
  "install_id":"3f2b8c1e-9a4d-4e7b-8c55-0d1f2a3b4c5d","session_id":"0b9a3d1f-6c2e-4d8a-9f10-2a3b4c5d6e7f",
  "app_version":"1.4.2","build":"25","platform":"ios","os_major":"17","locale":"en-US","sent_at":"2026-10-04T12:00:00Z",
  "events":[{"name":"session_start","t":0,"props":{"cold":true}},{"name":"screen_view","t":40,"props":{"screen":"/health"}}]}'   # 204
curl -s -o /dev/null -w '%{http_code}\n' -X POST $H/api/telemetry/events -d 'nope'     # 400
```
Then in Grafana: Explore -> Prometheus `pawpi_telemetry_ingest_total` (accepted +2) and `pawpi_client_screen_views_total{screen="/health"}`;
Explore -> Loki `{job="pawpi-client"}` shows two lines (needs the three `GRAFANA_LOKI_*` vars). An event with a PII-looking key
(e.g. `"props":{"email":"x"}`) must show up under `result="invalid"` and never in Loki.
**Kill switch drill:** set `TELEMETRY_INGEST_ENABLED=false` on Railway, redeploy, confirm `config` -> `"enabled":false` and the POST above still returns 204 but
`accepted` stops growing.

## 5e. Dashboards (night-run Step C)

Eleven dashboards live in the repo as JSON (`observability/grafana/dashboards/*.json`, folder **PawPi** in Grafana) and are pushed
by `scripts/observability/apply-grafana.mjs`. They chart ONLY metrics from the telemetry contract and the Loki streams
`job="pawpi-client"` / `job="pawpi-web"`; every panel has a one-line description saying what a bad value means and what to do.
Panels read "No data" until the servers/clients actually report (client panels need app build 25+; `job="pawpi-web"` panels need
server logs shipped to Loki). The old dashboard "PawPi - API health (RED)" (`docs/observability/dashboard.json`) is untouched.

| uid | Purpose |
|---|---|
| `pawpi-overview` | Start here: availability (deep health + request success), 5xx rate, p95, sessions, active installs (Loki), deploy annotations (Grafana annotations tagged `deploy`) |
| `pawpi-auth-onboarding` | Sign-in/up success by method, activation funnel + step-to-step drop-off, unexpected redirects (`nav_unexpected_redirect`), onboarding form steps |
| `pawpi-pets-feed-social` | Pets + feed areas: RED per route, `pet_created`/`post_created`, phone view of the same areas, taps/features/forms |
| `pawpi-health-reminders` | Health area, health logs + routines, health_logging and routines funnels |
| `pawpi-services-bookings-providers` | Services/providers/booking/telehealth/...: RED, `booking_created`, services funnel |
| `pawpi-payments-shop` | Payments + shop: checkout 5xx, orders, booking conversion, checkout p95 |
| `pawpi-walks-messaging-forum` | Walks, messages, forum, notifications: RED, `walk_logged`, push tokens |
| `pawpi-mobile-client-health` | Errors by app version/kind/screen, crash-free sessions, API failures seen by phones vs server, startup + slow screens, ingest quality |
| `pawpi-behaviour` | Anonymous: top screens/taps, entry screens, session path explorer, feature usage, all funnels, D1/D7/D30 return, active installs |
| `pawpi-database-infra` | DB latency/errors/slow share, process memory, event loop lag, uptime/restarts, server error logs |
| `pawpi-bottlenecks` | Routes by p95 x volume, slowest screens, API calls per screen view outliers, slow-DB-op share, slow requests in logs |

**Apply** (needs a Grafana service-account token with dashboards + folders write and datasources read; never printed or stored):
```bash
GRAFANA_URL=https://<stack>.grafana.net GRAFANA_SA_TOKEN=glsa_... node scripts/observability/apply-grafana.mjs            # DRY RUN: validates, shows create/update/unchanged per dashboard, writes nothing
GRAFANA_URL=... GRAFANA_SA_TOKEN=... node scripts/observability/apply-grafana.mjs --apply                                # writes folder "PawPi" (if missing) + dashboards
GRAFANA_URL=... GRAFANA_SA_TOKEN=... node scripts/observability/apply-grafana.mjs --apply --only pawpi-overview          # one dashboard
```
Without the env vars a dry run still validates the files and lists the dashboards ("live diff skipped"). Run it again after `--apply`:
every dashboard must read `unchanged` (idempotent). Exit codes: 0 ok, 1 usage/invalid files, 2 `--apply` without env, 3 Grafana
unreachable/rejected/datasource missing, 4 pending changes with `--exit-code`. Datasources are resolved at runtime by type
(preferring names like `grafanacloud-*-prom` / `*-logs`; override with `GRAFANA_PROM_DS` / `GRAFANA_LOKI_DS`): the JSON only holds the
placeholders `${DS_PROMETHEUS}` / `${DS_LOKI}`.

**Safety rules (enforced in code + tests):** only uids starting with `pawpi-` are ever written; **nothing is ever deleted** (the HTTP
helper refuses DELETE; to remove a dashboard do it by hand in Grafana, and delete its JSON here); an existing folder named "PawPi"
(it holds the three alert rules) is reused and never modified; existing dashboards/alerts/contact points are never touched.
Editing a dashboard in the Grafana UI is fine for exploring, but the next `--apply` overwrites it: copy the JSON back into the repo.

**Add a panel or dashboard:** edit the JSON (or "Export > Export as JSON" a panel/dashboard you built in the UI, then paste it in), keeping
`datasource` = `{"type":"prometheus","uid":"${DS_PROMETHEUS}"}` or `{"type":"loki","uid":"${DS_LOKI}"}`, a unique panel `id`, a one-line
`description` ("Bad: ...; do: ..."), and `uid` = `pawpi-<file name>`. A new metric must be added to the contract first (it is the lint's
source of truth). For a new dashboard add its name to `EXPECTED_DASHBOARDS` in `anything/apps/web/src/observability/dashboardLint.js`.
Then `cd anything/apps/web && npx vitest run src/observability` (lint: contract metrics + labels, descriptions, unique ids, placeholders only,
Loki jobs, no identifier as a metric label; failures name dashboard + panel + offender), dry-run, `--apply`. The PromQL check is
conservative (balanced brackets, known functions, contract metric/label names), not a full parser; for a deeper check the lezer
grammars `@prometheus-io/lezer-promql` / `@grafana/lezer-logql` parse every expression (all 273 did when the dashboards were written).

**Behaviour dashboard caveats (be honest with yourself reading it):**
- *Paths:* LogQL cannot join consecutive events, so there is no screen -> screen Sankey. The dashboard shows entry screens (first `screen_view`
  with `t < 3 s`), a session path explorer (paste one `session_id` into the variable), exact from -> to pairs for unexpected redirects, and top
  screens. Real transition counts need an external job over the Loki lines.
- *D1/D7/D30 return* = share of installs active N days ago that are active again today, computed as
  `count(A and A offset Nd) / count(A offset Nd)` with `A = sum by (install_id) (count_over_time({job="pawpi-client", event="session_start"} | json install_id="install_id" [1d]))`.
  It is rolling-activity retention (LogQL cannot find an install's first event), not a first-seen cohort. It needs Loki to hold N+1 days:
  Grafana Cloud free keeps roughly 14 days, so D1 and D7 work and **D30 stays blank until Loki retention is raised**. Loki also caps a query at
  ~500 series by default, so distinct-install counts (`count by install_id`, active installs, distinct-session crash-free) stop being exact above
  ~500 active installs per window: shorten the range or move the calculation to a recording rule.
- Client durations are bucket-resolution (see 5d); `app_version` is capped at 20 values then `other`.

## 5f. Alerts, routing and synthetic checks (night-run Step D)

Fifteen new alert rules live in the repo (`observability/grafana/alerts/p1-critical.json`, `p2-digest.json`, Grafana file-provisioning
format) and are pushed by `scripts/observability/apply-grafana.mjs --sections alerts,policies`. **Every rule is created PAUSED**
(`isPaused: true`); nothing can page until you resume it by hand. They read ONLY telemetry-contract metrics (plus one
`grafanacloud_*` usage metric for the free-tier rule), and `noDataState` is `OK` on all of them so an idle service, or clients that do
not exist yet, can never page. `execErrState` is `OK` too (a Grafana/Prometheus hiccup does not page; run each query once in Explore before
resuming it). Each rule carries labels `severity` (P1/P2), `area`, `pawpi_managed="true"` (the routing key) and, through the query's
`by (...)`, `route` / `app_version` / `method` where relevant; annotations `summary`, `description` and `runbook` (always a single line
starting `What to do:`). Rule titles (= the alertname the autofix loop sees) contain no spaces on purpose: they end up in a git branch name.

**Tiers.** P1 = page now (email + autofix webhook via contact point `Augusto`, plus phone push once you add it, see below). P2 = one
digest email per day.

**P1 rules** (file `p1-critical.json`, group `pawpi-p1-critical`)

| uid | Tier | Threshold | `for` | What to do (annotation `runbook`) |
|---|---|---|---|---|
| `pawpi-p1-health-deep-failing` | P1 | `min(pawpi_health_deep_ok) < 1` | 3m | What to do: curl -s https://www.pawpi.info/api/health/deep; if 503, check Supabase status/pooler and Railway deploy logs for the DB error. |
| `pawpi-p1-server-silent` | P1 | no `pawpi_process_uptime_seconds` samples for 10m (addition: closes the "dead server leaves a stale gauge" gap) | 5m | What to do: open Railway -> pawpi-web deployments (crashed or stuck deploy?), then curl https://www.pawpi.info/api/health/deep; if it answers, check OTEL_EXPORTER_OTLP_* variables. |
| `pawpi-p1-http-5xx-rate` | P1 | 5xx share **> 5%** per area over 5m, only above 0.02 req/s | 5m | What to do: open dashboard pawpi-overview (5xx by area) then pawpi-bottlenecks; find the failing route with pawpi_http_requests_total{status_class="5xx"} by route, then read the Railway logs for that route. |
| `pawpi-p1-signin-failure-spike` | P1 | sign-in fail share **> 50%** per method over 15m, >= 5 failures | 10m | What to do: dashboard pawpi-auth-onboarding (sign-in by method), then curl /api/auth/social-enabled and /api/auth/providers; check the provider env vars (GOOGLE_/APPLE_*) and recent deploys. |
| `pawpi-p1-signup-collapse` | P1 | ok sign-ups last 6h **< 0.2x** the 7-day 6h average (baseline >= 3 per 6h) | 30m | What to do: try signing up yourself in the app (use a throwaway email you own), check dashboard pawpi-auth-onboarding (signup ok vs fail, activation funnel), and /api/auth/providers. |
| `pawpi-p1-payments-failures` | P1 | 5xx share of POSTs in payments/shop **> 20%** over 15m, >= 3 requests | 10m | What to do: dashboard pawpi-payments-shop (checkout 5xx), then Railway logs for /api/payments/checkout and the MercadoPago status page. |
| `pawpi-p1-db-errors` | P1 | **> 5** DB errors per `op` in 10m | 5m | What to do: dashboard pawpi-database-infra (DB errors by op, latency), then Railway logs around the spike and Supabase status/connection count. |
| `pawpi-p1-client-crash-rate` | P1 | js/promise/render errors per session **> 0.2** per `app_version` over 30m, >= 5 errors | 15m | What to do: dashboard pawpi-mobile-client-health (errors by app version/kind/screen) to find the screen, then Loki {job="pawpi-client", event="error"} for the error code. |
| `pawpi-p1-client-api-5xx` | P1 | phone-side API 5xx share **> 10%** per area + `app_version` over 15m, >= 10 calls | 10m | What to do: compare with the server side in dashboard pawpi-mobile-client-health (API failures: phone vs server) and pawpi-overview; if the server shows nothing, suspect Railway/proxy; else read the area route logs. |
| `pawpi-p1-route-4xx-burst` | P1 | **> 90%** 4xx on one route template over 10m, >= 30 4xx (excludes unmatched/overflow//__page) | 10m | What to do: find which status it is in Railway logs for that route template; a 404 on a route the app calls = missing/renamed endpoint (check the latest mobile and web deploys), a 401 = broken auth/session on that route. |

**P2 rules** (file `p2-digest.json`, group `pawpi-p2-digest`)

| uid | Tier | Threshold | `for` | What to do (annotation `runbook`) |
|---|---|---|---|---|
| `pawpi-p2-slow-routes` | P2 | top 5 routes by p95 **> 3s** over 15m (> 0.02 req/s) | 15m | What to do: dashboard pawpi-bottlenecks (routes by p95 x volume) and pawpi-database-infra (slow-DB-op share); check whether the route is DB-bound. |
| `pawpi-p2-activation-funnel-drop` | P2 | step events last 24h **< 0.7x** the 7-day daily average (drop > 30%; baseline >= 5/day) | 1h | What to do: dashboard pawpi-auth-onboarding (activation funnel and step-to-step drop-off) and pawpi-behaviour; check which release changed and the screens around that step. |
| `pawpi-p2-nav-unexpected-redirect` | P2 | `nav_unexpected_redirect` **> 0** in every 10m window, sustained 30m | 30m | What to do: dashboard pawpi-auth-onboarding (unexpected redirects), then Loki {job="pawpi-client", event="nav_unexpected_redirect"} \| json to read from/to/reason. |
| `pawpi-p2-telemetry-silent` | P2 | **0** accepted client events for 6h while the previous 7 days had >= 10 sessions | 30m | What to do: curl -s https://www.pawpi.info/api/telemetry/config (enabled:true?), check TELEMETRY_INGEST_ENABLED on Railway, and pawpi_telemetry_ingest_total by result (rate_limited/invalid). |
| `pawpi-p2-free-tier-usage` | P2 | active series **> 70%** of the 10k free tier (usage datasource) | 1h | What to do: Grafana Cloud -> Usage (metrics, logs, traces) and Explore topk(10, count by (__name__)({__name__=~"pawpi_.+"})); drop or relabel the noisiest metric or raise the trace sampler. |

Notes on the rules:
- Thresholds not fixed by the plan (sign-in 50%, signup 0.2x, payments 20%, DB 5 errors, client 0.2 errors/session, route 90%, slow route 3s)
  are starting points; tune the number in the JSON, run `apply`, done. Minimum-volume guards (`and ... >= N`) keep one failed request at
  idle from paging.
- `status_class` cannot tell a 404 from a 401, so the route burst rule is "4xx burst"; the runbook line says to look up which status in the logs.
- Payments use the HTTP metrics of the `payments` and `shop` areas because the contract has no payment counters (the legacy
  `pawpi.payment.*` metrics keep feeding the legacy `PaymentFailuresSpike`).
- `P2-TelemetrySilent` only becomes meaningful after **app build 25** ships. Before that there are no client series, the query is
  empty and the rule stays Normal (no-data -> OK). It needs at least 10 sessions in the previous 7 days to exist at all.
- `P2-FreeTierUsage` reads `grafanacloud_instance_active_series` from the `grafanacloud-usage` datasource (placeholder `${DS_USAGE}`,
  resolved by name; the apply script SKIPS the rule with a message if no such datasource exists). The metric name comes from Grafana's
  docs and was not queried live: verify it in Explore on that datasource before resuming. Logs (50 GB/month) and traces (50 GB/month) have no
  rule: check Grafana Cloud -> Usage by hand now and then.
- `P1-ServerMetricsSilent` is an addition to the list in the plan: `pawpi_health_deep_ok` goes stale (not 0) when the process is dead, so
  without it a full outage with no probe would never alert from metrics.

**The three legacy rules stay exactly as they are** (`HighServerErrorRate`, `HighLatencyP95`, `PaymentFailuresSpike`, folder `PawPi`,
group `PawPi`): the script never lists, reads, updates or deletes anything it does not own (uid prefix `pawpi-`). They could be re-pointed
later, but only when strictly equivalent: `pawpi_http_requests_total{status_class="5xx"}` over all requests is the same ratio as
`HighServerErrorRate`'s `http_server_request_duration_seconds_count{http_response_status_code=~"5.."}`, so that one is equivalent once you
trust the new series; `HighLatencyP95` would need `pawpi_http_request_duration_seconds_bucket` (bucket boundaries differ, so p95 values are not
identical) and `PaymentFailuresSpike` has no equivalent in the contract. Until you decide, they stay on the legacy metrics. The new P1 5xx
rule overlaps with `HighServerErrorRate` on purpose; once you resume it and are happy, you can pause the legacy one yourself.

### Routing (notification policies)

The policy tree is ONE shared object, so the script MERGES: it reads the tree, adds (or refreshes) only its own two child routes, asserts
that every other route is byte-identical and in the same order and that the root is untouched, then writes the tree back. Our routes
are put IN FRONT of the existing children (an older "PawPi folder -> Augusto" route would otherwise match the P2 alerts first); they only
match `pawpi_managed="true"`, so the three legacy rules route exactly as before. Writes send `X-Disable-Provenance: true`, so the tree and the
rules stay editable in the Grafana UI.

| Route | Matches | Receiver | Group by | group_wait / group_interval / repeat |
|---|---|---|---|---|
| P1 | `pawpi_managed="true"`, `severity="P1"` | `Augusto` (email + autofix webhook; unchanged, never written by the script) | `area`, `alertname` | 30s / 5m / 4h |
| P2 digest | `pawpi_managed="true"`, `severity="P2"` | `pawpi-digest` (email, created by the script) | `area` | 10m / **24h** / 24h |

P1 groups by area **and** alertname so each rule reaches the autofix relay as its own dispatch (the relay opens one workflow per
notification and only reads the first firing alert; when several are in one group it names the others in the summary).

**`pawpi-digest` needs `ALERT_DIGEST_EMAIL`** (`;`- or `,`-separated addresses) in the environment of the apply run. Without it the script skips
the contact point AND the P2 route and says so. **Do not resume P2 rules until the digest exists**, otherwise they would match an older generic
route. Addresses are never printed.

**Phone push for P1 (2-minute manual step, cannot be scripted: it needs a stack-specific IRM integration).** (1) Install the Grafana IRM /
Grafana mobile app and log in to the stack (Profile -> notifications on). (2) Grafana -> Alerts & IRM -> IRM -> Integrations -> New integration
-> "Grafana Alerting" -> create. (3) In the IRM integration set an escalation chain that notifies you by **push (important)**. (4) Alerting ->
Contact points -> **Augusto** -> Add contact point integration -> type "Grafana OnCall" / IRM -> pick that integration -> Save. Augusto
is the receiver of the P1 route, so every P1 now also pushes; the apply script never writes `Augusto`, so it will not undo this. Test with the
contact point's "Test" button.

### Apply

```bash
# dry run first (writes nothing; second run after --apply must read all `unchanged`)
GRAFANA_URL=https://<stack>.grafana.net GRAFANA_SA_TOKEN=glsa_... ALERT_DIGEST_EMAIL='you@example.com' \
  node scripts/observability/apply-grafana.mjs --sections alerts,policies
... --sections alerts,policies --apply          # rules created PAUSED, routes merged, pawpi-digest created
... --sections all --apply                      # dashboards + alerts + routing + synthetics (synthetics only with GRAFANA_SM_*)
... --sections alerts --only pawpi-p1-http-5xx-rate --apply
```
The service-account token needs, on top of the Step C permissions, alert rules + notification policies + contact points write. A plain
`apply-grafana.mjs` (no `--sections`) still does exactly what it did in Step C (dashboards only).
**Pause semantics (tested):** a rule that does not exist is created with `isPaused: true`; for an existing rule the live `isPaused` is kept on update
(paused stays paused, resumed stays resumed), so re-applying never re-pauses a rule you resumed and never resumes one you did not. The comparison
ignores `isPaused`. Evaluation interval: new rule groups get Grafana's default (1m); change it in the UI if you want. Nothing is ever deleted:
to retire a rule, delete it in Grafana by hand and delete its JSON here.

### Un-pausing (after data flows; per rule, in the UI)

Alerting -> Alert rules -> folder **PawPi** -> group `pawpi-p1-critical` / `pawpi-p2-digest` -> the rule's menu -> **Resume evaluation**. Check
the rule's query in "View" / Explore first (it must return data or be legitimately empty). Suggested order:
1. Server data (flowing since Step A): `P1-HealthDeepFailing`, `P1-ServerMetricsSilent`, `P1-Http5xxRate`, `P1-DbErrors`. Watch a day for flaps.
2. Business/route rules once there is real traffic: `P1-SigninFailureSpike`, `P1-SignupCollapse` (needs 7 days of history), `P1-PaymentsFailureSpike`, `P1-Route4xxBurst`.
3. Create `pawpi-digest` (set `ALERT_DIGEST_EMAIL`, apply), then the P2 server rules: `P2-SlowRoutesP95`, and `P2-FreeTierUsage` after checking its metric.
4. After app build 25 has been live for a few days: `P1-ClientCrashRate`, `P1-ClientApi5xxShare`, `P2-NavUnexpectedRedirect`, `P2-ActivationFunnelDrop`, and last `P2-TelemetrySilent`.
If a rule is noisy: raise its threshold/`for` in the JSON and re-apply (the resume state survives), or pause it again in the UI.

### Autofix relay payload

`POST /api/internal/grafana-alert` dispatches `client_payload` with exactly these ten top-level keys (GitHub allows 10; a test pins it, also with
hundreds of labels): `source`, `status`, `alertname`, `severity`, `summary`, `value`, `labels`, `generatorURL`, `panelURL`, `runbook`. `labels` is ONE
object holding the allow-listed alert labels (`area`, `route`, `app_version`, `method`, `status_class`, `op`, `event`, `kind`, `funnel`, `step`,
`platform`, `screen`, `alertname`, `severity`, `grafana_folder`; values capped at 80 characters, restricted to `A-Za-z0-9_.-/:@ `). Text fields have
control characters removed and are length-capped. The workflow prompt now tells Claude the area/route and points it at the telemetry contract.

### Synthetic Monitoring checks

Five HTTP checks in `observability/grafana/synthetics/*.json`, every 5 min (`frequency: 300000`), each from two regions (EMEA + AMER; one online public
probe per region chosen at creation), timeout 10s, basic metrics only, labels `service`/`area`/`managed_by`:

| job | URL | passes when |
|---|---|---|
| `pawpi-health-deep` | `/api/health/deep` | 200 and body contains `"ok":true` |
| `pawpi-auth-social-enabled` | `/api/auth/social-enabled` | 200 and body contains `"google":true` and `"apple":true` |
| `pawpi-auth-providers` | `/api/auth/providers` | 200 and body contains the `google` and `apple-native` providers |
| `pawpi-account-signin` | `/account/signin` | 200, body does NOT match `Coming soon`, and contains `account/signin/page` |
| `pawpi-account-signup` | `/account/signup` | 200, body does NOT match `Coming soon`, and contains `account/signup/page` |

The account pages are client-rendered: the SSR HTML (checked with curl against production) contains none of the visible text ("Log in", "Sign in",
"Create"), only the React Router bootstrap. What IS in the HTML, and only on the real page, is the matched route module id (`account/signin/page`,
`account/signup/page`); an unknown `/account/...` URL (also HTTP 200) lacks it, so the check catches a missing page or a "Coming soon" placeholder.
It cannot see a page that renders blank in the browser. Budget: 5 checks x 2 probes x 288 runs/day = about 89k executions in a 31-day month, under the
100k free-tier limit (a third probe would exceed it; a test enforces the budget).

Apply: `GRAFANA_SM_URL=https://synthetic-monitoring-api-<region>.grafana.net GRAFANA_SM_TOKEN=<SM access token> node scripts/observability/apply-grafana.mjs --sections synthetics [--apply]`.
Without both variables the section is a documented no-op. It lists checks, matches by job prefix `pawpi-`, adds missing ones (`/api/v1/check/add`), updates
drifted ones (`/api/v1/check/update`, keeping the live probes) and never deletes. Checks only probe: **no alert is built on them in this step.** Quick
manual option for the total-outage gap: in Synthetic Monitoring set the checks' "alert sensitivity" (it creates `sm_check` alerts); route them like
any other rule.

**Scripted sign-up journey: intentionally NOT implemented.** It would create real production accounts on every run, which the night-run rules forbid
(and each new account is real user data we would have to clean up). Morning proposal: create one clearly labelled test account
(e.g. `synthetic+pawpi@<your domain>`, name "PawPi Synthetic") in an isolated Supabase project or with a dedicated test flag, then add a scripted check that
signs IN (not up) with it and reads a protected endpoint; keep the credential in the SM check's secret store, never in the repo.

## 6. Maintenance

- This repo's `docs/*.md` are version‑controlled — when the observability setup changes,
  update the relevant doc in the same commit so the repo stays the source of truth.
- Tokens have expirations (the GitHub PAT). Regenerate before expiry and update both
  `AUTOFIX_PAT` (GitHub) and `GITHUB_DISPATCH_TOKEN` (Railway) with the new value.
