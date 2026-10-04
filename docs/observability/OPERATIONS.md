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
  Grafana Cloud (FREE tier)  ── dashboards + 3 alert rules
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
| Relay returns 502, GitHub 422 "No more than 10 properties" | `client_payload` had 11 keys (max 10) | Trimmed to 9 (b6ae96a) |
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
  rules still read them until Step D re-points them.
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

## 6. Maintenance

- This repo's `docs/*.md` are version‑controlled — when the observability setup changes,
  update the relevant doc in the same commit so the repo stays the source of truth.
- Tokens have expirations (the GitHub PAT). Regenerate before expiry and update both
  `AUTOFIX_PAT` (GitHub) and `GITHUB_DISPATCH_TOKEN` (Railway) with the new value.
