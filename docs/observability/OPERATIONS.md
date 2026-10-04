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

## 6. Maintenance

- This repo's `docs/*.md` are version‑controlled — when the observability setup changes,
  update the relevant doc in the same commit so the repo stays the source of truth.
- Tokens have expirations (the GitHub PAT). Regenerate before expiry and update both
  `AUTOFIX_PAT` (GitHub) and `GITHUB_DISPATCH_TOKEN` (Railway) with the new value.
