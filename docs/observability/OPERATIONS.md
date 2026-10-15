# PawPi — Observability & Self-Healing Operations Runbook

PawPi watches itself (Grafana Cloud free tier), alerts you (email, plus phone push once you add it), and drafts fixes for your
approval (Claude -> PR). Since night run 3 a small, gated class of fixes can **merge and deploy automatically** (section 17); everything else
still waits for you. This is the single source of truth for operating it.

_Last updated: 2026-10-04 (night run steps A-E; night run 3: server rules resumed as code, automatic fix loop)._

**What is live vs. what still needs you.** Server metrics, client-telemetry ingest, the alert relay and the autofix loop are live in
production. The dashboards, 15 new alert rules, routing, synthetic checks, structured logs and deploy markers are merged **as code**
but start working only after the human actions in section 14 (Grafana apply, Railway env vars, app build 26). The three original alert
rules (section 5.4) have been live since before the night run.

Contents: 1 Architecture - 2 Tiers and alerts - 3 Signals - 4 Dashboards - 5 Alert rules, routing, synthetics - 6 Environment variables -
7 Applying to Grafana - 8 Un-pausing - 9 Kill switches - 10 Free-tier limits and cardinality - 11 Keeping it covered - 12 Known limitations -
13 Troubleshooting - 14 Morning/human checklist - 15 Monthly 15-minute review - 16 Autofix loop and maintenance - 17 Automatic fix loop (safety gate, kill switch).

---

## 1. Architecture

```
  iPhone app (build 26+)                    Railway: PawPi web/API  (React Router + Hono, one instance)
   anonymous allowlisted events               instrumentation.mjs: OpenTelemetry SDK (metrics + 20% traces)
        │  POST /api/telemetry/events         Hono middleware (__create/index.ts), after each response:
        ▼                                       - pawpi_http_* metrics (+ the legacy http.server.request.duration)
   server ingest ── validate, rate-limit        - ONE structured access-log line                 ─┐
        │  derives pawpi_client_* metrics       process / DB / business metrics                   │ Loki push
        │  one log line per event ──────────────────────────────────────────────────────────────┤ job="pawpi-client"
        │                                     at start: ONE deploy annotation ─┐                │ job="pawpi-web"
        ▼                                                                       │                ▼
   OTLP metrics ────────────────────────────────────────────────────────────────┼──►  Grafana Cloud (FREE tier)
                                                                                └──►    11 dashboards
                                                                                        3 legacy alert rules (live)
                                                                                        15 new rules (PAUSED until you resume)
                                                                                        5 Synthetic Monitoring checks
                                                                                        policies: P1 -> Augusto, P2 -> pawpi-digest
                                                                                                │ alert fires
                                         email to you  ◄────────────────────────────────────────┤
                                         P1 webhook ──► App relay POST /api/internal/grafana-alert  (Bearer secret)
                                                          │  GitHub repository_dispatch (event: grafana-alert)
                                                          ▼
                                         GitHub Action .github/workflows/claude-autofix.yml
                                           Claude reads the alert + code -> minimal fix OR diagnosis
                                                          ▼
                                         Opens a PR (fix) or an Issue (diagnosis)  <- you review
                                           CI (ci.yml) gates the PR -> you merge -> Railway auto-deploys
```

No step ever deploys to production without your merge. Every telemetry path is a **no-op without its env vars** and can never break
or slow a request (fire-and-forget, try/catch, timeouts, bounded queues; contract principle 4 in
`docs/observability/night-run/01-TELEMETRY-CONTRACT.md`, the single source of truth for every metric, label, event and log field).

### 1.1 Code map (all live in this repo)
| Piece | Path |
|---|---|
| OTel bootstrap (traces + metrics, no-op if unconfigured; `service.version` = first 7 chars of `RAILWAY_GIT_COMMIT_SHA`, `dev` locally) | `anything/apps/web/instrumentation.mjs`, loaded by `node --import ./instrumentation.mjs` in the `start` script (`package.json`) |
| Request middleware: HTTP metrics, access log, process metrics, deploy annotation | `anything/apps/web/__create/index.ts` (console override that tags lines with `[traceId:...]` is unchanged) |
| Server metrics, route/area labelling | `src/lib/telemetry/{httpMetrics,routes,areas,dbMetrics,process,business,authMetrics,healthDeep}.js` |
| Telemetry registry (allowlist; mirrored byte-for-byte to `anything/apps/mobile/src/telemetry/registry.js`) | `src/lib/telemetry/registry.js` |
| Client ingest | `src/app/api/telemetry/{events,config}/route.js`, `src/lib/telemetry/{ingest,ingestSchema,ingestLimiter,clientMetrics}.js` |
| Generic Loki shipper | `src/lib/telemetry/loki.js` |
| Structured server logs | `src/lib/telemetry/serverLogs.js` |
| Deploy annotation | `src/lib/telemetry/deployAnnotation.js` |
| Legacy payment counters | `src/lib/metrics.js` + checkout route + `utils/payments/index.js` |
| Alert relay route + payload builder | `src/app/api/internal/grafana-alert/route.js`, `src/lib/alertRelayPayload.js` |
| Autofix workflow | `.github/workflows/claude-autofix.yml` |
| Dashboards / alerts / synthetics as code | `observability/grafana/{dashboards,alerts,synthetics}/*.json` |
| Apply script | `scripts/observability/apply-grafana.mjs` |
| Lints + the coverage guard (run in `npm test`) | `anything/apps/web/src/observability/` |
| Mobile SDK | `anything/apps/mobile/src/telemetry/` |

Paths without a prefix are under `anything/apps/web/`. Everything above is merged to `main` (so deployed by Railway); the mobile SDK reaches users only with app build 26, and the structured logs / deploy annotation are no-ops until the Railway env vars of section 6.1 exist.

---

## 2. Tiers and alerts

**P1 = page now.** Email + autofix webhook through contact point `Augusto`, plus phone push once you add the integration (section 5.3).
**P2 = one digest email per day** through contact point `pawpi-digest`.

The fifteen new rules live in `observability/grafana/alerts/p1-critical.json` (10) and `p2-digest.json` (5) and are **PAUSED** until you
resume them (section 8). All use `noDataState: OK` and `execErrState: OK`, so an idle service, a client that does not exist yet or a
Grafana/Prometheus hiccup can never page. Each carries labels `severity` (P1/P2), `area`, `pawpi_managed="true"` (the routing key) and,
through the query's `by (...)`, `route` / `app_version` / `method` where relevant; annotations `summary`, `description` and `runbook` (always a
single line starting `What to do:`). Rule titles (= the alertname the autofix loop sees) contain no spaces on purpose: they end up in a git
branch name. Minimum-volume guards (`and ... >= N`) keep one failed request at idle from paging.

### 2.1 What each alert means and the first thing to check

**P1 rules** (file `p1-critical.json`, group `pawpi-p1-critical`)

| uid | Tier | Threshold | `for` | First thing to check (annotation `runbook`) |
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

| uid | Tier | Threshold | `for` | First thing to check (annotation `runbook`) |
|---|---|---|---|---|
| `pawpi-p2-slow-routes` | P2 | top 5 routes by p95 **> 3s** over 15m (> 0.02 req/s) | 15m | What to do: dashboard pawpi-bottlenecks (routes by p95 x volume) and pawpi-database-infra (slow-DB-op share); check whether the route is DB-bound. |
| `pawpi-p2-activation-funnel-drop` | P2 | step events last 24h **< 0.7x** the 7-day daily average (drop > 30%; baseline >= 5/day) | 1h | What to do: dashboard pawpi-auth-onboarding (activation funnel and step-to-step drop-off) and pawpi-behaviour; check which release changed and the screens around that step. |
| `pawpi-p2-nav-unexpected-redirect` | P2 | `nav_unexpected_redirect` **> 0** in every 10m window, sustained 30m | 30m | What to do: dashboard pawpi-auth-onboarding (unexpected redirects), then Loki {job="pawpi-client", event="nav_unexpected_redirect"} \| json to read from/to/reason. |
| `pawpi-p2-telemetry-silent` | P2 | **0** accepted client events for 6h while the previous 7 days had >= 10 sessions | 30m | What to do: curl -s https://www.pawpi.info/api/telemetry/config (enabled:true?), check TELEMETRY_INGEST_ENABLED on Railway, and pawpi_telemetry_ingest_total by result (rate_limited/invalid). |
| `pawpi-p2-free-tier-usage` | P2 | active series **> 70%** of the 10k free tier (usage datasource) | 1h | What to do: Grafana Cloud -> Usage (metrics, logs, traces) and Explore topk(10, count by (__name__)({__name__=~"pawpi_.+"})); drop or relabel the noisiest metric or raise the trace sampler. |

Plus the **three legacy rules** (live, folder `PawPi`, group `PawPi`, no-data -> Normal): `HighServerErrorRate` (5xx rate > 5% for 5m),
`HighLatencyP95` (p95 > 3s for 10m today; the tuned definition, 15m plus a minimum-traffic guard, is in section 18 and is applied by hand in the Grafana UI), `PaymentFailuresSpike` (failure rate > 20% over 15m; populates on the first real checkout).

Notes on the rules:
- Thresholds not fixed by the plan (sign-in 50%, signup 0.2x, payments 20%, DB 5 errors, client 0.2 errors/session, route 90%, slow route 3s)
  are starting points; tune the number in the JSON, run `apply`, done.
- `status_class` cannot tell a 404 from a 401, so the route burst rule is "4xx burst"; the runbook line says to look up which status in the logs
  (the structured access logs of section 3.2 carry the exact `status` per request once they flow).
- Payments use the HTTP metrics of the `payments` and `shop` areas because the contract has no payment counters (the legacy
  `pawpi.payment.*` metrics keep feeding the legacy `PaymentFailuresSpike`).
- `P2-TelemetrySilent` only becomes meaningful after **app build 26** ships. Before that there are no client series, the query is empty and the
  rule stays Normal (no-data -> OK). It needs at least 10 sessions in the previous 7 days to exist at all.
- `P2-FreeTierUsage` reads `grafanacloud_instance_active_series` from the `grafanacloud-usage` datasource (placeholder `${DS_USAGE}`, resolved by
  name; the apply script SKIPS the rule with a message if no such datasource exists). The metric name comes from Grafana's docs and was not queried
  live: verify it in Explore on that datasource before resuming. Logs (50 GB/month) and traces (50 GB/month) have no rule: check Grafana Cloud ->
  Usage by hand (section 15).
- `P1-ServerMetricsSilent` is an addition to the original plan: `pawpi_health_deep_ok` goes stale (not 0) when the process is dead, so without it a
  full outage with no probe would never alert from metrics.
- Every rule's query must be run once in Explore before you resume it (`execErrState: OK` would otherwise hide a broken query).

---

## 3. Signals

### 3.1 Server metrics (night-run Step A)

Emitted by the web/API process over the same OTLP pipe as the legacy metrics (no-op without `OTEL_EXPORTER_OTLP_ENDPOINT`; every metric call is
wrapped so it can never throw into a request). Names/labels are the contract; label values are **bounded** (no ids, query strings, emails, raw paths)
and a test (`src/lib/telemetry/labels.test.js`) fails if any label looks unbounded. In Grafana/Prometheus, counters appear with `_total` and
histograms as `_bucket/_sum/_count`.

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

- `route` is the matched Hono route template with every parameter as `:id` (`/api/pets/:id/profile`). SPA pages/assets are `/__page`, unmatched
  `/api/...` is `unmatched`, and a safety valve `overflow` caps the fallback normalizer at 100 distinct values. `area` comes from
  `src/lib/telemetry/areas.js` (the one prefix map; 20 areas, the contract lists them). `method` is the 7 standard verbs or `OTHER`; `status_class`
  is `1xx`..`5xx` or `unknown`.
- The **legacy** `http.server.request.duration` histogram and `pawpi.payment.*` counters are unchanged: the 3 live alert rules still read them.
- DB metrics label the operation only (first SQL keyword), never SQL text or params. Queries issued on a raw `sql.begin(tx => ...)` handle (not
  through the shared `sql` import) and the health probe are not counted.
- Business events (`recordBusinessEvent` in `src/lib/telemetry/business.js`; unknown values are dropped): `signup`/`signin` (credentials `authorize`
  callbacks ok/fail; Apple-native `authorize`; Google via the auth adapter, ok only), `pet_created` (POST /api/pets), `post_created` (POST /api/posts),
  `health_log_created` (POST on every `/api/health/*` log/record route except walk-logs), `walk_logged` (POST /api/health/walk-logs),
  `routine_created` (POST /api/routines), `booking_created` (POST /api/providers/:id/book and POST /api/vet-appointments), `order_created`
  (POST /api/payments/checkout and POST /api/pets/:id/shop-checkout), `push_token_registered` (POST /api/push-tokens). Creation events count successful
  creations (`ok`); creation failures show up as 5xx in the HTTP metrics by `area`.
- `service.version` on every series = `RAILWAY_GIT_COMMIT_SHA` first 7 chars (`dev` locally), set in `instrumentation.mjs`.
- **Payment metrics need traffic.** `pawpi_payment_*` (legacy) only exist after real checkouts; the payment alert stays Normal until then.
- **Trace sampling is 20%** (`OTEL_TRACES_SAMPLER_ARG=0.2`), protecting the free-tier traces quota. OTel's own log export stays off (`OTEL_LOGS_ENABLED`
  unset): server logs reach Loki through the structured, redacted, capped path of section 3.2 instead.

**`GET /api/health/deep`** — public, no auth, `Cache-Control: no-store`. Runs a bare `select 1` on the DB pool (3s timeout) and returns
`{ "ok": true, "db_ms": 4, "version": "abc1234" }`, or **503** `{ "ok": false, ... }` if the database is unreachable/slow. The body never contains error
text or config. Use it for uptime/synthetic checks and as the deploy signal: it returns JSON only once the new build is live; before that the SPA
catch-all answers with HTML (see section 12).

### 3.2 Structured server logs (night-run Step E)

**One access-log JSON line per HTTP request**, written after the response is produced by the same middleware that records the HTTP metrics
(`serverLogs.js`, wired in `__create/index.ts` inside its own try/catch; same ordering, no change to any response). Shipped to Loki as
`job="pawpi-web"` through the generic shipper (`loki.js`).

```json
{"ts":"2026-10-04T12:00:00.000Z","level":"info","msg":"GET /api/pets/:id/profile -> 200","route":"/api/pets/:id/profile","status":200,"request_id":"3f2b8c1e-9a4d-4e7b-8c55-0d1f2a3b4c5d","duration_ms":12,"method":"GET"}
```

| Field | Value |
|---|---|
| `ts` | ISO-8601 UTC |
| `level` | `error` for 5xx, `warn` for 4xx, `info` for the rest |
| `msg` | `<METHOD> <route template> -> <status>` (passed through the redactor) |
| `route` | the **same bounded template** as `pawpi_http_*` (`/api/pets/:id/profile`, `/__page`, `unmatched`, `overflow`), never the raw path |
| `status` | HTTP status (number) |
| `request_id` | the Hono `requestId()` value if it is a safe token (`[A-Za-z0-9_-]{1,64}`), else `null` |
| `duration_ms` | integer milliseconds |
| `method` | GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS/OTHER |

- **Loki stream labels are ONLY `{job, level, area}`** (`area` from `areas.js`). Everything else is a JSON field (`| json`). The dashboards
  that query `job="pawpi-web"` (database-infra: server logs by level + error lines; bottlenecks: slow requests) read exactly these field names; the
  coverage guard (section 11) fails if a dashboard reads a field that is not in the line schema.
- **Never logged:** request bodies, query strings, headers, cookies, tokens, emails, user ids, raw paths. The line is built from a fixed set of
  bounded values, never from the request object; `msg` is also scrubbed of email-like, `Bearer`/`Basic`, JWT-like, long-token, uuid and `?a=b`
  substrings, capped at 200 characters. Tests pin this (`serverLogs.test.js`, including a hostile request with an email/JWT/password everywhere).
- **Free-tier protection (50 GB/month of logs):** 4xx, 5xx and slow (>= 1 s) requests are never sampled (they are only capped by an abuse bucket of
  `LOG_MAX_ERROR_LINES_PER_SEC`, default 50/s, so a scanner flood cannot burn the quota). 2xx/3xx lines are sampled with `LOG_SAMPLE_2XX` (0..1,
  default 1) and limited by a per-process token bucket of `LOG_MAX_LINES_PER_SEC` (default 20/s, burst 2x). A line is about 220 bytes, so 20 lines/s
  sustained is about 11 GB/month; the error bucket adds at most about 28 GB if it ran saturated all month (it will not). The shipper queue is
  bounded (2000 lines, oldest dropped), a failed batch is dropped, never retried.
- **No-op** unless `GRAFANA_LOKI_URL` + `GRAFANA_LOKI_USER` + `GRAFANA_LOKI_TOKEN` are all set; `LOG_SHIP_ENABLED=false` is the kill switch; `LOG_LEVEL`
  (`debug|info|warn|error`, default `info`) drops lines below that level. `LOG_STDOUT=true` additionally prints each line to stdout (Railway logs);
  it is off by default to keep deploy logs quiet and Railway's log rate limit untouched.
- What is **not** shipped: arbitrary `console.*` output (it can contain free text with names/ids that no regex can promise to scrub); it stays
  in Railway's own logs, tagged `[traceId:...]` as before. The `request_id` equals that traceId, so a Loki access line can be matched to the
  Railway lines of the same request.
- Loki/LogQL note: because `level` and `area` are stream labels, a query's `| json level="level"` gets the extracted copy under `level_extracted`
  while `by (level)` and `| level="error"` use the stream label (same value). The existing panels work either way; verify them once logs flow.

### 3.3 Deploy annotations (night-run Step E)

At server start, **one** Grafana annotation is posted: `POST {GRAFANA_URL}/api/annotations` with `Authorization: Bearer <token>`, body
`{ time, tags: ["deploy","pawpi","<short sha>"], text: "Deploy pawpi-web <sha> (service.version <sha>, <environment>)" }`. `dashboardUID` is omitted, so it is
org-wide, and the Deploys annotation query of `pawpi-overview` (built-in Grafana source, tag `deploy`) draws it as a line on that dashboard.

- Runs only when the deploy is identifiable (`RAILWAY_GIT_COMMIT_SHA` set by Railway, or the explicit flag `GRAFANA_ANNOTATE_DEPLOY=true`) **and** `GRAFANA_URL`
  plus a token are set (`GRAFANA_ANNOTATION_TOKEN` preferred, `GRAFANA_SA_TOKEN` as fallback). So dev, CI and tests never post.
  `GRAFANA_ANNOTATE_DEPLOY=false` is the kill switch.
- Best-effort: scheduled 3 s after start on an unref'd timer, never awaited by the boot path, 5 s timeout, every error swallowed; it prints at most one
  short line (`[deploy-annotation] posted (HTTP 200)` or `not posted (reason ...)`, status only, never the token).
- Use a Grafana service-account token limited to **annotations write** (the narrowest role/permission that can create annotations in your Grafana; do not put the broad apply token on Railway).
- A restart of the same commit (crash, manual restart) posts another marker with the same sha tag; that doubles as a restart marker.

### 3.4 Client telemetry ingest (night-run Step B)

Anonymous behaviour telemetry from the mobile app (ships with app build 26; the endpoints are live earlier and simply idle). Full privacy/retention
description: `docs/privacy/telemetry.md`. Names/labels/events are the contract; the allowlist is `src/lib/telemetry/registry.js`, mirrored byte-for-byte into
the mobile app (a web test fails if they differ). Mobile client behaviour (anonymous `install_id`/`session_id`, fail-closed until `GET /api/telemetry/config`
says `enabled`, Settings opt-out, bounded queue) is described in `docs/privacy/telemetry.md` and PROGRESS.md.

**Endpoints** (both public, no auth, no database)
- `POST /api/telemetry/events` — batched events. Body <= 32 KB and <= 50 events (else 413 / 400), strict registry validation, per-`install_id` (30/min) and
  per-IP (300/min) in-memory rate limit (429), `204` on success even if some events were dropped, `400` for a bad envelope, never 5xx. The client IP is hashed
  in memory for the limiter only and is never stored, logged or emitted.
- `GET /api/telemetry/config` — `{ "enabled": true, "sampleRate": 1 }`, `Cache-Control: public, max-age=300`. The app reads it to honour the kill switch and sampling.

**What it emits**
- Metrics (via the OTLP pipe): `pawpi_client_events_total`, `pawpi_client_screen_views_total`, `pawpi_client_errors_total`, `pawpi_client_api_calls_total`,
  `pawpi_client_api_duration_seconds`, `pawpi_client_screen_ready_seconds`, `pawpi_client_startup_seconds`, `pawpi_client_sessions_total`,
  `pawpi_funnel_step_total`, and `pawpi_telemetry_ingest_total{result=accepted|dropped|invalid|rate_limited}` (watch `invalid`/`rate_limited` spikes: a client bug or
  abuse). Durations arrive as buckets, so the histograms are bucket-resolution. `app_version` is validated and capped at 20 distinct values per process (then
  `other`); a flood of fake versions can push a genuinely new release into `other` until the next deploy/restart.
- Loki: ONE JSON line per accepted event, stream labels ONLY `{job="pawpi-client", event, app_version, platform}`; the line holds `install_id`, `session_id`,
  `event`, `props`, `t`, `screen`, `os_major`, `locale`, `build`, `app_version`, `platform`, `sent_at`. Batched (5 s / 100 lines), queue capped at 2000 lines
  (oldest dropped), 5 s timeout, errors swallowed. It uses the same shipper as the server logs.
- Caveat: requests are counted per instance (limiter state is in memory). No state survives a restart.

**Result semantics** of `pawpi_telemetry_ingest_total`: `accepted` / `dropped` (well-formed but not on the allowlist, or the kill switch is on; counted per request
when the kill switch is on) / `invalid` (malformed, PII-looking prop key, bad envelope; the envelope case counts 1 per request) per event; `rate_limited` per request.

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
Then in Grafana: Explore -> Prometheus `pawpi_telemetry_ingest_total` (accepted +2) and `pawpi_client_screen_views_total{screen="/health"}`; Explore -> Loki
`{job="pawpi-client"}` shows two lines (needs the three `GRAFANA_LOKI_*` vars). An event with a PII-looking key (e.g. `"props":{"email":"x"}`) must show up under
`result="invalid"` and never in Loki. **Kill switch drill:** set `TELEMETRY_INGEST_ENABLED=false` on Railway, redeploy, confirm `config` -> `"enabled":false` and the
POST above still returns 204 but `accepted` stops growing.

### 3.5 Client diagnostics beacon (`[client-diagnostics]` log line)

The mobile app can report "something that should never happen" via `POST /api/client-diagnostics` (authenticated, allow-listed event names, no DB, per-user cap of
5/min per instance). The only effect is **one structured line in the Railway deploy logs** — search for `[client-diagnostics]`. (It is separate from the anonymous
telemetry above and not shipped to Loki.)

Event `onboarding_wizard_for_existing_owner` (added after an owner who had finished onboarding was thrown back into the wizard after tapping Services — see PR #596):
fired when an account that already has a dog reaches an onboarding screen (`where: "mount"`) or is about to create one (`where: "submit"`). Fields: `auth_user_id`,
`screen`, `session_age_s` (seconds since the app's JS session started — **a tiny value means the app had just restarted; a large one means a navigation did it**),
`trail` (last <= 15 screens with how many seconds ago each was shown, e.g. `/services` -> `/onboarding-photo`), `platform`, `os_version`, `app_version`, `build`. Ids and
screen paths only — never add PII to this beacon.

---

## 4. Dashboards (night-run Step C)

Eleven dashboards live in the repo as JSON (`observability/grafana/dashboards/*.json`, folder **PawPi** in Grafana) and are pushed by
`scripts/observability/apply-grafana.mjs`. They chart ONLY metrics from the telemetry contract and the Loki streams `job="pawpi-client"` / `job="pawpi-web"`; every panel
has a one-line description saying what a bad value means and what to do. Panels read "No data" until the servers/clients actually report (client panels need app build 26+;
`job="pawpi-web"` panels need server logs shipped to Loki, section 3.2). The old dashboard "PawPi - API health (RED)" (`docs/observability/dashboard.json`) is untouched.

| uid | Purpose |
|---|---|
| `pawpi-overview` | Start here: availability (deep health + request success), 5xx rate, p95, sessions, active installs (Loki), deploy annotations (Grafana annotations tagged `deploy`, section 3.3) |
| `pawpi-auth-onboarding` | Sign-in/up success by method, activation funnel + step-to-step drop-off, unexpected redirects (`nav_unexpected_redirect`), onboarding form steps |
| `pawpi-pets-feed-social` | Pets + feed areas: RED per route, `pet_created`/`post_created`, phone view of the same areas, taps/features/forms |
| `pawpi-health-reminders` | Health area, health logs + routines, health_logging and routines funnels |
| `pawpi-services-bookings-providers` | Services/providers/booking/telehealth/...: RED, `booking_created`, services funnel |
| `pawpi-payments-shop` | Payments + shop: checkout 5xx, orders, booking conversion, checkout p95 |
| `pawpi-walks-messaging-forum` | Walks, messages, forum, notifications: RED, `walk_logged`, push tokens |
| `pawpi-mobile-client-health` | Errors by app version/kind/screen, crash-free sessions, API failures seen by phones vs server, startup + slow screens, ingest quality |
| `pawpi-behaviour` | Anonymous: top screens/taps, entry screens, session path explorer, feature usage, all funnels, D1/D7/D30 return, active installs |
| `pawpi-database-infra` | DB latency/errors/slow share, process memory, event loop lag, uptime/restarts, server error logs (`job="pawpi-web"`) |
| `pawpi-bottlenecks` | Routes by p95 x volume, slowest screens, API calls per screen view outliers, slow-DB-op share, slow requests in logs (`job="pawpi-web"`) |

**Safety rules (enforced in code + tests):** only uids starting with `pawpi-` are ever written; **nothing is ever deleted** (the HTTP helper refuses DELETE; to remove a dashboard
do it by hand in Grafana, and delete its JSON here); an existing folder named "PawPi" (it holds the three legacy alert rules) is reused and never modified; existing
dashboards/alerts/contact points are never touched. Editing a dashboard in the Grafana UI is fine for exploring, but the next `--apply` overwrites it: copy the JSON back into the repo.

**Behaviour dashboard caveats (be honest with yourself reading it):**
- *Paths:* LogQL cannot join consecutive events, so there is no screen -> screen Sankey. The dashboard shows entry screens (first `screen_view` with `t < 3 s`), a session path
  explorer (paste one `session_id` into the variable), exact from -> to pairs for unexpected redirects, and top screens. Real transition counts need an external job over the Loki lines.
- *D1/D7/D30 return* = share of installs active N days ago that are active again today, computed as `count(A and A offset Nd) / count(A offset Nd)` with
  `A = sum by (install_id) (count_over_time({job="pawpi-client", event="session_start"} | json install_id="install_id" [1d]))`. It is rolling-activity retention (LogQL cannot find an
  install's first event), not a first-seen cohort. It needs Loki to hold N+1 days: Grafana Cloud free keeps roughly 14 days, so D1 and D7 work and **D30 stays blank until Loki retention
  is raised**. Loki also caps a query at ~500 series by default, so distinct-install counts (`count by install_id`, active installs, distinct-session crash-free) stop being exact above
  ~500 active installs per window: shorten the range or move the calculation to a recording rule.
- Client durations are bucket-resolution (section 3.4); `app_version` is capped at 20 values then `other`.

---

## 5. Alert rules, routing and synthetic checks (night-run Step D)

The rules themselves are tabulated in section 2.1. This section is how they are routed, applied and probed.

### 5.1 Routing (notification policies)

The policy tree is ONE shared object, so the script MERGES: it reads the tree, adds (or refreshes) only its own two child routes, asserts that every other route is byte-identical and in
the same order and that the root is untouched, then writes the tree back. Our routes are put IN FRONT of the existing children (an older "PawPi folder -> Augusto" route would otherwise
match the P2 alerts first); they only match `pawpi_managed="true"`, so the three legacy rules route exactly as before. Writes send `X-Disable-Provenance: true`, so the tree and the rules
stay editable in the Grafana UI.

| Route | Matches | Receiver | Group by | group_wait / group_interval / repeat |
|---|---|---|---|---|
| P1 | `pawpi_managed="true"`, `severity="P1"` | `Augusto` (email + autofix webhook; unchanged, never written by the script) | `area`, `alertname` | 30s / 5m / 4h |
| P2 digest | `pawpi_managed="true"`, `severity="P2"` | `pawpi-digest` (email, created by the script) | `area` | 10m / **24h** / 24h |

P1 groups by area **and** alertname so each rule reaches the autofix relay as its own dispatch (the relay opens one workflow per notification and only reads the first firing alert; when
several are in one group it names the others in the summary).

**`pawpi-digest` needs `ALERT_DIGEST_EMAIL`** (`;`- or `,`-separated addresses) in the environment of the apply run. Without it the script skips the contact point AND the P2 route and says so.
**Do not resume P2 rules until the digest exists**, otherwise they would match an older generic route. Addresses are never printed.

### 5.2 The three legacy rules stay exactly as they are
(Exception in waiting: the live `HighLatencyP95` has a tuned definition in section 18 that a human applies in the Grafana UI; it is also issue-only for the autofix loop.)
`HighServerErrorRate`, `HighLatencyP95`, `PaymentFailuresSpike` (folder `PawPi`, group `PawPi`): the script never lists, reads, updates or deletes anything it does not own (uid prefix `pawpi-`). They
could be re-pointed later, but only when strictly equivalent: `pawpi_http_requests_total{status_class="5xx"}` over all requests is the same ratio as `HighServerErrorRate`'s
`http_server_request_duration_seconds_count{http_response_status_code=~"5.."}`, so that one is equivalent once you trust the new series; `HighLatencyP95` would need
`pawpi_http_request_duration_seconds_bucket` (bucket boundaries differ, so p95 values are not identical) and `PaymentFailuresSpike` has no equivalent in the contract. Until you decide, they
stay on the legacy metrics. The new P1 5xx rule overlaps with `HighServerErrorRate` on purpose; once you resume it and are happy, you can pause the legacy one yourself.

### 5.3 Phone push for P1 (2-minute manual step; cannot be scripted: it needs a stack-specific IRM integration)
(1) Install the Grafana IRM / Grafana mobile app and log in to the stack (Profile -> notifications on). (2) Grafana -> Alerts & IRM -> IRM -> Integrations -> New integration -> "Grafana Alerting" ->
create. (3) In the IRM integration set an escalation chain that notifies you by **push (important)**. (4) Alerting -> Contact points -> **Augusto** -> Add contact point integration -> type
"Grafana OnCall" / IRM -> pick that integration -> Save. Augusto is the receiver of the P1 route, so every P1 now also pushes; the apply script never writes `Augusto`, so it will not undo this.
Test with the contact point's "Test" button.

### 5.4 Legacy Grafana objects (live before the night run)
- **Dashboard:** "PawPi — API health (RED)" (import source: `docs/observability/dashboard.json`).
- **Alerts** (folder `PawPi`, group `PawPi`, no-data -> Normal on each): the three legacy rules of section 2.
- **Contact point:** `Augusto` — has **email** + **webhook** (webhook -> the relay route). Never modified by the script.

### 5.5 Autofix relay payload
`POST /api/internal/grafana-alert` dispatches `client_payload` with exactly these ten top-level keys (GitHub allows 10; a test pins it, also with hundreds of labels): `source`, `status`,
`alertname`, `severity`, `summary`, `value`, `labels`, `generatorURL`, `panelURL`, `runbook`. `labels` is ONE object holding the allow-listed alert labels (`area`, `route`, `app_version`, `method`,
`status_class`, `op`, `event`, `kind`, `funnel`, `step`, `platform`, `screen`, `alertname`, `severity`, `grafana_folder`; values capped at 80 characters, restricted to `A-Za-z0-9_.-/:@ `). Text fields
have control characters removed and are length-capped. The workflow prompt tells Claude the area/route and points it at the telemetry contract.

### 5.6 Synthetic Monitoring checks
Five HTTP checks in `observability/grafana/synthetics/*.json`, every 5 min (`frequency: 300000`), each from two regions (EMEA + AMER; one online public probe per region chosen at creation),
timeout 10s, basic metrics only, labels `service`/`area`/`managed_by`:

| job | URL | passes when |
|---|---|---|
| `pawpi-health-deep` | `/api/health/deep` | 200 and body contains `"ok":true` |
| `pawpi-auth-social-enabled` | `/api/auth/social-enabled` | 200 and body contains `"google":true` and `"apple":true` |
| `pawpi-auth-providers` | `/api/auth/providers` | 200 and body contains the `google` and `apple-native` providers |
| `pawpi-account-signin` | `/account/signin` | 200, body does NOT match `Coming soon`, and contains `account/signin/page` |
| `pawpi-account-signup` | `/account/signup` | 200, body does NOT match `Coming soon`, and contains `account/signup/page` |

The account pages are client-rendered: the SSR HTML (checked with curl against production) contains none of the visible text ("Log in", "Sign in", "Create"), only the React Router bootstrap. What IS in
the HTML, and only on the real page, is the matched route module id (`account/signin/page`, `account/signup/page`); an unknown `/account/...` URL (also HTTP 200) lacks it, so the check catches a missing
page or a "Coming soon" placeholder. It cannot see a page that renders blank in the browser. Budget: 5 checks x 2 probes x 288 runs/day = about 89k executions in a 31-day month, under the 100k free-tier
limit (a third probe would exceed it; a test enforces the budget).

Apply: see section 7. Checks only probe: **no alert is built on them yet.** Quick manual option for the total-outage gap: in Synthetic Monitoring set the checks' "alert sensitivity" (it creates `sm_check`
alerts); route them like any other rule.

**Scripted sign-up journey: intentionally NOT implemented.** It would create real production accounts on every run, which the night-run rules forbid (and each new account is real user data we would have to
clean up). Proposal: create one clearly labelled test account (e.g. `synthetic+pawpi@<your domain>`, name "PawPi Synthetic") in an isolated Supabase project or with a dedicated test flag, then add a scripted
check that signs IN (not up) with it and reads a protected endpoint; keep the credential in the SM check's secret store, never in the repo.

---

## 6. Environment variables (names only; values live in the platforms)

### 6.1 Railway (web service)
| Name | Required? | Purpose |
|---|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS` | live | Ship metrics + traces to Grafana OTLP. Unset = telemetry off. |
| `OTEL_TRACES_SAMPLER`, `OTEL_TRACES_SAMPLER_ARG` | live | Trace sampling (free-tier control; currently 20%). |
| `OTEL_SERVICE_NAME` | optional | Defaults to `pawpi-web`. |
| `OTEL_LOGS_ENABLED` | leave unset | `true` would ship raw OTel logs (burns the 50 GB logs quota). Use the structured logs below instead. |
| `ALERT_WEBHOOK_SECRET` | live | Auth for the Grafana -> app relay call (also stored in the Grafana webhook). |
| `GITHUB_DISPATCH_TOKEN` | live | App -> GitHub `repository_dispatch`. Removing it stops the relay firing (autofix kill switch). |
| `RAILWAY_GIT_COMMIT_SHA`, `RAILWAY_ENVIRONMENT_NAME` | set by Railway | `service.version`, `/api/health/deep` version, deploy annotation tag. |
| `TELEMETRY_INGEST_ENABLED` | optional | `false` = client-ingest kill switch (204 + discard; config reports `enabled:false`). |
| `TELEMETRY_SAMPLE_RATE` | optional | 0..1 (default 1), returned by `/api/telemetry/config`. |
| `GRAFANA_LOKI_URL`, `GRAFANA_LOKI_USER`, `GRAFANA_LOKI_TOKEN` | **TO ADD** | Loki push for `job="pawpi-client"` and `job="pawpi-web"`. URL may be the base (`https://logs-prod-XXX.grafana.net`) or the full `/loki/api/v1/push`. All three or no shipping. |
| `LOG_LEVEL`, `LOG_SHIP_ENABLED`, `LOG_SAMPLE_2XX`, `LOG_MAX_LINES_PER_SEC`, `LOG_MAX_ERROR_LINES_PER_SEC`, `LOG_STDOUT` | optional | Structured-log controls (section 3.2). Defaults are safe: `info`, on, 1.0, 20, 50, off. |
| `GRAFANA_URL` | **TO ADD** | Stack URL (`https://<stack>.grafana.net`) for the deploy annotation. |
| `GRAFANA_ANNOTATION_TOKEN` | **TO ADD** | Service-account token limited to annotations write. Falls back to `GRAFANA_SA_TOKEN` if you set that instead. |
| `GRAFANA_ANNOTATE_DEPLOY` | optional | `false` disables the deploy annotation; `true` forces it without a commit sha. |

### 6.2 GitHub (repository secrets)
| Name | Purpose |
|---|---|
| `AUTOFIX_PAT` | **Required** for the loop to open and merge PRs (a PR from the default token does not trigger CI). Fine-grained: Contents + Pull requests + Issues read/write. Has an expiry. Without it the loop opens `needs-human` issues instead. |
| `CLAUDE_CODE_OAUTH_TOKEN` | Claude auth in CI (your Max plan, $0 extra). |
| `ANTHROPIC_API_KEY` | Alternative to the OAuth token (pay per use). |
| `GRAFANA_URL`, `GRAFANA_TOKEN` | Optional: Claude can query Grafana while investigating. |
| `GRAFANA_ANNOTATION_TOKEN` | Optional (with `GRAFANA_URL`): annotation posted when an automatic merge is reverted (section 17.3). Repository **secret**, separate from the Railway variable of the same name. |
| _variable_ `AUTOFIX_ENABLED` | Repository **variable** (not a secret): `false` switches the whole automatic fix loop off (section 17.4). |

### 6.3 Your shell (only for the apply script, never stored)
| Name | Purpose |
|---|---|
| `GRAFANA_URL`, `GRAFANA_SA_TOKEN` | Apply dashboards/alerts/policies (service-account token: dashboards + folders write, datasources read, alert rules + notification policies + contact points write). |
| `ALERT_DIGEST_EMAIL` | Recipients of the P2 digest (`;` or `,` separated). |
| `GRAFANA_SM_URL`, `GRAFANA_SM_TOKEN` | Synthetic Monitoring API URL + access token. Without both the section is a no-op. |
| `GRAFANA_PROM_DS`, `GRAFANA_LOKI_DS` | Optional: force a datasource by name or uid instead of resolving by type/name. |

### 6.4 Grafana Cloud (set in the UI)
Contact point `Augusto` (email + webhook with the `ALERT_WEBHOOK_SECRET` bearer), optional IRM integration for phone push (5.3), contact point `pawpi-digest` (created by the script).

---

## 7. Applying to Grafana

Needs a service-account token (section 6.3); the token is never printed or stored. Always **dry-run first**: it validates the files and shows create/update/unchanged per object, writing nothing.
```bash
export GRAFANA_URL=https://<stack>.grafana.net GRAFANA_SA_TOKEN=glsa_... ALERT_DIGEST_EMAIL='you@example.com'
node scripts/observability/apply-grafana.mjs                                          # dashboards, DRY RUN
node scripts/observability/apply-grafana.mjs --apply                                  # dashboards: writes folder "PawPi" (if missing) + dashboards
node scripts/observability/apply-grafana.mjs --sections alerts,policies               # dry run
node scripts/observability/apply-grafana.mjs --sections alerts,policies --apply       # rules created PAUSED, routes merged, pawpi-digest created
node scripts/observability/apply-grafana.mjs --sections all --apply                   # dashboards + alerts + routing + synthetics (synthetics only with GRAFANA_SM_*)
node scripts/observability/apply-grafana.mjs --apply --only pawpi-overview            # one dashboard (--only also takes rule uids / SM job names)
GRAFANA_SM_URL=https://synthetic-monitoring-api-<region>.grafana.net GRAFANA_SM_TOKEN=<SM access token> \
  node scripts/observability/apply-grafana.mjs --sections synthetics [--apply]
```
A plain `apply-grafana.mjs` (no `--sections`) still means dashboards only. Without the env vars a dry run still validates the files and lists the objects ("live diff skipped").
**Run it again after `--apply`: every object must read `unchanged`** (idempotent; if a real Grafana rewrites stored JSON you may see `update` on the second run; harmless, the overwrite is idempotent).

Exit codes: 0 ok, 1 usage/invalid files, 2 `--apply` without env, 3 Grafana unreachable/rejected/datasource missing, 4 pending changes with `--exit-code`.
Datasources are resolved at runtime by type (preferring names like `grafanacloud-*-prom` / `*-logs`; override with `GRAFANA_PROM_DS` / `GRAFANA_LOKI_DS`): the JSON only holds the placeholders
`${DS_PROMETHEUS}` / `${DS_LOKI}` / `${DS_USAGE}`.

**Pause semantics (tested):** `isPaused: true` in the repo file (every rule's default) means: a rule that does not exist is created paused, and for an existing rule the live `isPaused` is kept on update (paused stays paused, resumed stays resumed), so
re-applying never re-pauses a rule you resumed and never resumes one you did not. `isPaused: false` is an **explicit, reviewed "resume this rule" declaration** (a commit on main): `--apply` creates the rule active / resumes it, and the dry run lists it as an `update` until live matches (so after `--apply` the next dry run is 0 changes). The script **never pauses** a rule: pausing stays a UI action. Exactly four rules are declared `false` (night run 3; a test pins the list), see section 8. Evaluation interval: new rule groups get Grafana's default (1m); change it in the UI
if you want. Nothing is ever deleted: to retire a rule or check, delete it in Grafana by hand and delete its JSON here.

**Synthetics:** the section lists checks, matches by job prefix `pawpi-`, adds missing ones (`/api/v1/check/add`), updates drifted ones (`/api/v1/check/update`, keeping the live probes) and never deletes.

---

## 8. Un-pausing (after data flows; per rule, in the UI)

Alerting -> Alert rules -> folder **PawPi** -> group `pawpi-p1-critical` / `pawpi-p2-digest` -> the rule's menu -> **Resume evaluation**. Check the rule's query in "View" / Explore first (it must return data or be
legitimately empty). Order:
1. **Server rules first** (data flowing since Step A): `P1-HealthDeepFailing`, `P1-ServerMetricsSilent`, `P1-Http5xxRate`, `P1-DbErrors`. **Done as code on 2026-10-04 (night run 3, #610): `isPaused: false` in `p1-critical.json`, applied, live state verified.** They are the alerts that can start the automatic fix loop (section 17). Watch a day for flaps.
2. **Business/route rules once there is real traffic:** `P1-SigninFailureSpike`, `P1-SignupCollapse` (needs 7 days of history), `P1-PaymentsFailureSpike`, `P1-Route4xxBurst`.
3. **P2 only after the digest exists:** apply with `ALERT_DIGEST_EMAIL` set (creates `pawpi-digest` + the P2 route), then `P2-SlowRoutesP95`, and `P2-FreeTierUsage` after checking its metric.
4. **Client rules only after app build 26** has been live for a few days: `P1-ClientCrashRate`, `P1-ClientApi5xxShare`, `P2-NavUnexpectedRedirect`, `P2-ActivationFunnelDrop`, and last `P2-TelemetrySilent`.

If a rule is noisy: raise its threshold/`for` in the JSON and re-apply (the resume state survives), or pause it again in the UI. To resume another rule **as code**, set its `isPaused` to `false` in a PR (and add it to the allow-list in `alerts.lint.test.js` / `apply-alerts.test.js`), merge, dry-run, `--apply --sections alerts`, dry-run again (0 changes). To stop a rule paused by the repo file from being resumed again, change the file back to `true` **and** pause it in the UI (`true` never pauses a live rule).

---

## 9. Kill switches

| What | How | Effect / how to undo |
|---|---|---|
| All client telemetry | Railway `TELEMETRY_INGEST_ENABLED=false` (+ redeploy) | Ingest answers 204 and discards; `/api/telemetry/config` -> `enabled:false`, apps stop sending within ~5 min. Unset to re-enable. |
| Structured server logs to Loki | Railway `LOG_SHIP_ENABLED=false` | Access lines stop being built and queued. Or remove any of the three `GRAFANA_LOKI_*` vars (also stops `job="pawpi-client"`). |
| Log volume only | Railway `LOG_SAMPLE_2XX=0` and/or lower `LOG_MAX_LINES_PER_SEC` | Keeps 4xx/5xx/slow lines, drops routine 2xx/3xx. |
| Deploy annotation | Railway `GRAFANA_ANNOTATE_DEPLOY=false` (or remove `GRAFANA_URL`) | No annotation at the next start. |
| OTel metrics/traces entirely | Remove `OTEL_EXPORTER_OTLP_ENDPOINT` | Whole OTel bootstrap is a no-op. |
| Autofix loop (fastest, also stops in-flight runs before they merge) | GitHub repo variable `AUTOFIX_ENABLED` = `false` (section 17.4) | Set `true` / delete it. |
| Autofix loop | GitHub -> Actions -> "Claude autofix" -> ... -> **Disable workflow**; or remove `GITHUB_DISPATCH_TOKEN` in Railway (the relay stops firing) | Re-enable anytime. |
| One alert rule | Grafana -> Alerting -> rule menu -> **Pause evaluation** | The next `apply` keeps it paused. |
| All new rules | Pause each, or delete the P1/P2 groups by hand | Never auto-resumed by the script. |

---

## 10. Free-tier limits and cardinality rules

Grafana Cloud Free (no card on file, so it cannot bill you): **10,000 active metric series**, **50 GB logs/month** (about 14 days retention), **50 GB traces/month**, **100k Synthetic Monitoring executions/month**.

**Cardinality rules (the contract's principle 3; tests enforce them):**
1. A metric label value comes from a small closed set: area (20), route TEMPLATE (never a path), method (8), status_class (6), op (5), event/outcome/method of the business counter, `app_version` (<= 20, then `other`), screen (registry, 79 values including `unknown`).
2. Never an id, query string, email, free text or raw URL in a metric label. Detail and behaviour go to log lines (Loki), not labels.
3. Loki stream labels are as few as possible: `job="pawpi-client"`: `event`, `app_version`, `platform`; `job="pawpi-web"`: `level`, `area`. Everything else is a JSON field.
4. In doubt: drop the label, keep the data in the log line.

**Series budget (estimates from the label sets, not measurements; read the real number in Grafana Cloud -> Usage and alert `P2-FreeTierUsage` at 70%):**
| Family | Theoretical worst case | Expected |
|---|---|---|
| `pawpi_http_requests_total` | routes (~280) x methods x status classes | a few hundred (only routes actually hit) |
| `pawpi_http_request_duration_seconds` (12 buckets + sum + count = 14 series per area/route/method) | ~280 x 1.4 x 14 = ~5.5k | ~1-2k |
| `pawpi_client_*` and `pawpi_funnel_step_total` | dominated by `app_version` (<= 21) x screen (79) x histogram buckets; can exceed 10k in theory | small with 1-3 live app versions |
| DB, process, health, business, ingest | tens | tens |
The big lever is the HTTP duration histogram (14 series per route/method) and the number of simultaneously live `app_version` values. If usage nears 70%: drop a label or the histogram bucket count, or reduce live versions.

**Log GB:** an access line is about 220 bytes. The 2xx/3xx bucket (`LOG_MAX_LINES_PER_SEC`, default 20/s) caps routine lines at about 11 GB/month; 4xx/5xx/slow lines have their own bucket (default 50/s, cap about 28 GB/month if it ran saturated all month, which a healthy service never does). Client telemetry adds one line per accepted event, so it grows with users: check Usage monthly (section 15) and lower `LOG_SAMPLE_2XX` or `TELEMETRY_SAMPLE_RATE` before you reach the quota.

---

## 11. Keeping it covered ("nothing is unmonitored")

One vitest entry point runs in web CI (`npm test`): **`anything/apps/web/src/observability/coverageGuard.test.js`** (pure core `coverageGuard.js`, disk loader `coverageGuardFs.js`). No network. Each failure names the offender and the fix:

| Check | Fails when | Fix |
|---|---|---|
| (a) routes | a `route.js` under `src/app/api` maps to area `other` (and its top-level dir is not in `ALLOWED_OTHER_API_DIRS` with a reason; today `upload`, `__create`) | map the directory in `src/lib/telemetry/areas.js` (`TOP_LEVEL_AREA`, or a nested rule) |
| (b) screens | a mobile screen file under `anything/apps/mobile/src/app` has no entry in the web registry **or** in the mobile mirror | add the screen to `src/lib/telemetry/registry.js` `SCREENS` first, then copy that file over `anything/apps/mobile/src/telemetry/registry.js` verbatim |
| (c) funnels | a funnel step in the contract or either registry has no literal `trackFunnel("funnel", "step")` call in mobile code (tests, comments and the registry do not count), or a call names an unknown pair | emit it, or remove the step from contract + registry |
| (d) dashboards/alerts | a dashboard or alert rule references a metric/label/event/Loki job outside the contract (the Step C/D lint functions are re-used as-is), or a `job="pawpi-web"` panel reads a field that is not in the log line schema | fix the query, or add the name to the contract first |

The guard is proven by negative tests on temp-dir fixtures (a new route / screen / unemitted step / dashboard or alert with an unknown metric makes it fail with the offender named). The older focused tests remain (`areas.test.js`,
`registry.test.js`, the dashboard/alert/synthetics lints, `labels.test.js`, and on mobile `registry.coverage.test.js` + `funnelCoverage.test.js`).

### How to add...
- **A server route (`src/app/api/<dir>/.../route.js`):** nothing to do if `<dir>` is already mapped in `areas.js`; otherwise add it to `TOP_LEVEL_AREA` (guard (a) tells you). Metrics, access logs and `route` labels pick it up automatically (the Hono matched template). Also regenerate `anything/apps/mobile/src/telemetry/apiRoutes.js` so phones report the route instead of `unknown` (safe direction when forgotten).
- **A mobile screen:** create the file; add `/<route>` to `SCREENS` in the web registry, copy the file to the mobile mirror; guard (b) names the file. `screen_view` / `perf_screen_ready` are emitted automatically by the nav observer.
- **A client event, tap target, feature or form:** edit the **contract first** (`01-TELEMETRY-CONTRACT.md`), then the web registry (`TAP_TARGETS` / `FEATURES` / `FORMS` / `EVENT_NAMES` + `PROP_SCHEMA`), copy to mobile, then emit (`trackTap`, `trackFeature`, `useFormTelemetry`). Unknown values are dropped by design.
- **A funnel step:** add the step to the contract's "Named funnels", the web registry `FUNNELS` and the mobile mirror, then add a literal `trackFunnel("funnel", "step")` call where it happens (guard (c) fails until you do).
- **A metric:** add it to the contract tables first (dashboards and alerts lint against that file), then emit it with bounded labels (`labels.test.js` checks the cardinality).
- **A dashboard or panel:** edit/add the JSON in `observability/grafana/dashboards/`, keeping `datasource` = `{"type":"prometheus","uid":"${DS_PROMETHEUS}"}` or `{"type":"loki","uid":"${DS_LOKI}"}`, a unique panel `id`, a one-line `description` ("Bad: ...; do: ..."), and `uid` = `pawpi-<file name>`. For a new dashboard add its name to `EXPECTED_DASHBOARDS` in `src/observability/dashboardLint.js`. Then `cd anything/apps/web && npx vitest run src/observability`, dry-run, `--apply`. The PromQL check is conservative (balanced brackets, known functions, contract metric/label names), not a full parser; the lezer grammars `@prometheus-io/lezer-promql` / `@grafana/lezer-logql` parsed every expression when the dashboards and rules were written.
- **An alert rule:** add it to `observability/grafana/alerts/p1-critical.json` or `p2-digest.json` (copy a neighbour: instant PromQL -> reduce -> threshold, `isPaused: true`, `noDataState: OK`, minimum-volume guard, labels `severity`/`area`/`pawpi_managed`, a one-line `What to do:` runbook, a title without spaces), add its uid to the expected list in `alerts.lint.test.js`, add a row to section 2.1 here, dry-run, apply, then resume it by hand when ready.
- **A server log field:** add it to `LOG_FIELDS` and the line builder in `serverLogs.js`, the contract's Logs section and section 3.2 here (the guard checks dashboards against `LOG_FIELDS`). Keep stream labels at `{job, level, area}`.

---

## 12. Known limitations (by design / platform)

- **Traces exist but are scrubbed before export.** (An earlier version of this note said there were none; Tempo shows `pawpi-web` spans.) The auto-instrumentations record raw paths, query strings, client IPs and user-agents, so `SpanScrubber` (`src/lib/telemetry/spanScrubber.js`, registered before the exporter in `instrumentation.mjs`) removes `client.*`, `network.peer.*`, `network.local.*` and `url.query`, coarsens `user_agent.original` to `ios|android|other`, replaces `url.path` and the path in `url.full` with a route template (`/unknown` if none matches, `/__page` for incoming pages), and drops exception messages/stacks. If the scrubber cannot load, NO traces are exported (metrics are unaffected). Do not add `headersToSpanAttributes` or any attribute hook without extending `spanScrubber.test.js`.
- **Unknown `/api/...` paths answer 200 + HTML** (the React Router SPA catch-all) instead of a JSON 404. So the HTTP metrics and access logs see them as 2xx (bucketed by the capped fallback normalizer, never by raw path), monitors cannot tell a wrong URL from success, and before a new deploy is live `/api/health/deep` returns 200 + HTML (deploy signal = JSON with `"ok":true`). Product bug, not fixed in the observability work (see PROGRESS.md "Found bugs").
- **Google sign-in has no `fail` outcome:** a denied/failed Google attempt never reaches the auth adapter, so `pawpi_business_events_total{method="google"}` only counts successes; `P1-SigninFailureSpike` cannot see Google failures.
- **Creation events only count successes** (`ok`); creation failures are visible as 5xx by `area`.
- **`status_class` cannot tell a 404 from a 401**, hence "4xx burst"; the exact `status` is in the access logs.
- **Client telemetry exists only from app build 26**; before that all client panels read "No data" and client rules stay Normal. Native Hermes has no `unhandledrejection`, so `error{kind:promise}` is web-only; the iOS tab bar is native so `tab_*` taps are not emitted (the tab opening is a `screen_view`); the "misrouted API returned HTML" case counts as a `network` error.
- **Client durations are bucket-resolution**; `app_version` is capped at 20 values per process then `other`.
- **LogQL limits:** no screen -> screen Sankey; D1/D7/D30 are rolling-activity return, D30 needs Loki retention beyond ~14 days; distinct-install counts are exact only below ~500 series per query.
- **Limiter and sampling state is per process and in memory** (one Railway instance today); nothing survives a restart. The deploy annotation can repeat for a restart of the same commit.
- **Arbitrary `console.*` output is not shipped to Loki** (only the redacted access lines are); it stays in Railway's logs.
- **Payment metrics (legacy) need traffic**; trace sampling is 20%.
- **Alert metric names to verify live:** `grafanacloud_instance_active_series` (P2-FreeTierUsage) and the `le` label rendering of whole-number histogram buckets (`le=~"1|1.0"` is used defensively).
- **Free-tier retention is short (~14 days for Loki)**, which is why D30 and any month-over-month view need an external store.
- **Scripted sign-up journey is not implemented** (it would create real production accounts); see 5.6.

---

## 13. Troubleshooting quick-reference (issues already solved + new)

| Symptom | Cause | Fix |
|---|---|---|
| Deploy fails: `Cannot find module '/app/instrumentation.mjs'` | `NODE_OPTIONS` poisons the *build* toolchain | Load `--import` in the **start script**, not `NODE_OPTIONS` (0ad3496) |
| Metric not in Grafana dropdown, no `http_*` metrics | Bundling blocks auto HTTP instrumentation | Hono middleware emits the metric (027a319) |
| Relay returns 502, GitHub 422 "No more than 10 properties" | `client_payload` had 11 keys (max 10) | Trimmed to 9 (b6ae96a); since Step D exactly 10 fixed keys, enforced by `grafana-alert/route.test.js` |
| Workflow green but no Issue/PR; log `Header … invalid value` | Claude token saved with a newline/space | Re-paste `CLAUDE_CODE_OAUTH_TOKEN` as one clean line |
| Log `Resource not accessible by personal access token (createIssue)` | PAT missing Issues permission | Add **Issues: Read and write** to the fine-grained PAT |
| Alert flips to "NoData" and emails you when idle | Query returns empty with no traffic | Set the rule's **no-data -> Normal** (all new rules already are) |
| `{job="pawpi-web"}` is empty in Loki | `GRAFANA_LOKI_*` missing (all three needed), `LOG_SHIP_ENABLED=false`, `LOG_LEVEL` above the traffic, or sampling at 0 | Check the Railway variables; set `LOG_STDOUT=true` temporarily to see the lines in Railway logs; `curl` any route and wait ~5 s for the batch |
| `{job="pawpi-client"}` empty but ingest returns 204 | Same Loki variables missing, or no app build 26 yet, or `TELEMETRY_INGEST_ENABLED=false` | Section 3.4 verify-with-curl; check `pawpi_telemetry_ingest_total` by result |
| No deploy line on `pawpi-overview` | `GRAFANA_URL` / token missing, token lacks annotations write, `RAILWAY_GIT_COMMIT_SHA` absent, or the dashboard time range is wrong | Look for `[deploy-annotation]` in the Railway start logs (it prints status only); curl the endpoint with the token by hand |
| Dry run shows `update` for every dashboard on the second run | Real Grafana normalises stored JSON | Harmless (idempotent); rerun `--apply` if in doubt |
| `npm test` fails in the coverage guard | A new route/screen/funnel step/dashboard/alert is not covered | Read the failure line: it names the file and the fix (section 11) |
| P2 rule would not route to the digest | `pawpi-digest` not created (no `ALERT_DIGEST_EMAIL` during apply) | Apply again with the variable set; do not resume P2 before |
| `/api/health/deep` returns 200 + HTML | Deploy not live yet (SPA catch-all) | Wait; the deploy signal is JSON `{"ok":true,"version":"<sha>"}` |

---

## 14. Human checklist (nothing here is automated; owner actions)

1. **Railway env vars** (names in 6.1): add `GRAFANA_LOKI_URL` + `GRAFANA_LOKI_USER` + `GRAFANA_LOKI_TOKEN` (Grafana Cloud -> Loki "Send logs" details), `GRAFANA_URL` and `GRAFANA_ANNOTATION_TOKEN` (service-account token limited to annotations write). Redeploy. Verify with 3.2/3.3/3.4.
2. **Grafana apply:** dry run, then `--apply`, for dashboards, then alerts + policies (with `ALERT_DIGEST_EMAIL`), then synthetics (7). A second dry run must read all `unchanged`.
3. **Rules stay paused** until data flows; un-pause in the order of section 8; verify `grafanacloud_instance_active_series` before `P2-FreeTierUsage`.
4. **App build 26** (client telemetry) — submitted for App Store review. **App Store Connect -> App Privacy** is published per `docs/privacy/telemetry.md` section 6 (Product Interaction, Performance Data, Other Diagnostic Data; no Crash Data) and `docs/app-store-privacy-data-map.md` matches; confirm the **live privacy policy** carries the matching paragraph.
5. **Optional:** Grafana mobile push for P1 on Augusto (5.3); scripted sign-in journey with a clearly labelled test account (5.6).
6. Tracked in `docs/roadmap.md` and `docs/test-backlog.md`.

---

## 15. Monthly 15-minute review

1. **Usage (3 min):** Grafana Cloud -> Usage: active series (< 7k), logs GB (< 35 of 50), traces GB, Synthetic Monitoring executions (< 100k). Over a line? Section 10 levers.
2. **Alerts (3 min):** Alerting -> Alert rules: any rule in Error state, any that never evaluates data, any that fired and was ignored. Tune threshold/`for` in the JSON and re-apply, or pause.
3. **Dashboards (3 min):** open `pawpi-overview` and `pawpi-mobile-client-health`: any "No data" panel that should have data (a metric/label rename, an env var lost), the deploy markers present, `pawpi_telemetry_ingest_total` `invalid` share near 0.
4. **Coverage (2 min):** `cd anything/apps/web && npx vitest run src/observability` is green on main; new screens/routes added this month were covered by the guard, not by an allow-list.
5. **Autofix loop (2 min):** GitHub -> label `autofix`: close stale issues/PRs; confirm the PAT expiry date (rotate `AUTOFIX_PAT` + `GITHUB_DISPATCH_TOKEN` together).
6. **Privacy (1 min):** `docs/privacy/telemetry.md` still matches what the registry collects (the allowlist test and guard keep it honest; re-read the "not collected" list if the registry grew).
7. **Kill-switch drill (1 min, quarterly):** confirm `TELEMETRY_INGEST_ENABLED=false` and `LOG_SHIP_ENABLED=false` still do what section 9 says.

---

## 16. Autofix loop and maintenance

**When an alert fires:** you get an email, and the loop opens either a **PR** (Claude found a safe, tested fix) or an **Issue** (diagnosis only, no change). A PR that passes the safety gate of section 17 is merged by the loop itself; any other PR/issue carries `needs-human`: review it like any PR/issue. PRs are gated by CI; merging
one triggers a Railway deploy. **Reviewing an autofix PR:** read Claude's incident summary in the PR body, check the diff, let CI go green, merge if you agree. Close it if you disagree — nothing is lost.
**Test issues:** the two from setup (`ManualTest`, `TestAlert`) can be closed as "not planned." Filter all loop output by the `autofix` label.

**Add / tune an alert:** see section 11 (as code). Queries for the legacy rules are in `docs/observability/GRAFANA_SETUP.md`; if an alert is noisy, raise its threshold or increase the pending period.

**Cost:** Grafana is free-tier forever (no card on file, so it can't bill you). The autofix Claude runs on your Max plan via the OAuth token — $0 extra. It only runs when an alert actually fires.

**Maintenance:**
- This repo's `docs/*.md` are version-controlled — when the observability setup changes, update the relevant doc in the same commit so the repo stays the source of truth.
- Tokens have expirations (the GitHub PAT). Regenerate before expiry and update both `AUTOFIX_PAT` (GitHub) and `GITHUB_DISPATCH_TOKEN` (Railway) with the new value.
- Related docs: `docs/observability/GRAFANA_SETUP.md` (legacy alert setup), `docs/observability/PawPi_Observability_and_SelfHealing_Loop.md` (original design plan), `docs/observability/night-run/` (contract, step prompts, PROGRESS.md with every decision), `observability/README.md`, `docs/privacy/telemetry.md`.

---

## 17. Automatic fix loop

_Added in night run 3. Source of truth for the rules: `scripts/autofix/gate.mjs` (unit-tested). Workflow: `.github/workflows/claude-autofix.yml`._

A **P1 alert fires -> Claude investigates -> a fix PR is opened -> the safety gate decides -> checks -> squash-merge -> Railway deploys -> production is verified -> auto-revert if it is not healthy.** A person is only needed when the gate says "no" (label `needs-human`) or when something was reverted.

### 17.1 The flow

```
Grafana P1 rule fires (contact point Augusto webhook)
  -> POST /api/internal/grafana-alert (app relay, Bearer ALERT_WEBHOOK_SECRET)
  -> GitHub repository_dispatch "grafana-alert"
  -> workflow "Claude autofix (Grafana alert)"
       1. preflight    kill switch? duplicate open autofix PR for this alert? ensure labels
       2. investigate  Claude (read-only token, no PAT) reads the alert + code, writes /tmp/incident.md and maybe a patch
       3. deliver      issue-only | PR -> merge gate -> wait for the 3 required checks -> sha-pinned squash merge
                       -> verify production (<= 15 min) -> OK: done | FAIL: revert PR (merged when green) + issue + annotation
       4. outcome      one comment on the PR / issue: merged | left for human | reverted
```

Only the four server rules are live today (`P1-ServerMetricsSilent`, `P1-Http5xxRate`, `P1-DbErrors`, `P1-HealthDeepFailing`; see 17.5), so those are the only alerts that can start the loop.

### 17.2 The safety gate (ALL must hold to auto-merge; otherwise the PR gets `needs-human` and the loop stops)

| # | Rule | Where it is enforced |
|---|---|---|
| 1 | The PR was opened **by this workflow run** (its own branch `autofix/<alert>-<runId>`, same repo, label `autofix`, open, not draft, base `main`) | `checkProvenance` |
| 2 | The three required checks are `success` on the **head sha**: `mobile (jest)`, `web (vitest)`, `web (integration / real Postgres)` (REST check-runs, polled up to **25 min**; a failed check stops immediately; a timeout is "left for human") | `evaluateChecks` |
| 3 | Changed files are **only under `anything/apps/web/src/`** and none matches `payment`, `mercadopago`, `auth`, `session`, `migrations` or `supabase/` | `pathProblems` |
| 4 | No `package*.json`, lockfile, `.github/**`, `app.json`, `eas.json`; no deleted, renamed or binary/mode-only files | `pathProblems`, `evaluateFiles` |
| 5 | **At most 5 files and 80 changed lines** (additions + deletions) | `evaluateFiles` |
| 6 | `/tmp/incident.md` has the exact line `CONFIDENCE: high` (and no other CONFIDENCE line). Claude may write `high` only if it reproduced the problem or clearly traced the cause **and** the web tests pass | `isHighConfidence` + the prompt |
| 7 | **Rate limit:** fewer than 3 autofix PRs merged in the last 24 h, and no autofix **revert** merged in the last 24 h | `rateLimit` |
| 8 | The kill switch is still off, and the PR head is unchanged, immediately before merging | `deliver.sh` |
| 9 | The merge is `PUT /pulls/{n}/merge` with `merge_method=squash` and `sha=<head sha>` (GitHub refuses if anything was pushed in between) | `deliver.sh` |

Never auto-merged, whatever the checks say: alerts `P1-ServerMetricsSilent` and `P1-HealthDeepFailing` (**issue only**: the app itself may be down, so any patch is discarded), the legacy `HighLatencyP95` (**issue only** since 2026-10-05: at current traffic its p95 is moved by a single app-launch burst and the cause is DB round-trip latency, not a code defect a patch can safely guess at; see section 18), and **manual** runs (`workflow_dispatch`) unless you pass `allow_merge=true`.

**Dedupe:** if an open PR labelled `autofix` already exists for the same alertname, the run does nothing (see its run summary). A re-fire of an alert whose diagnosis issue is still open comments on that issue.

### 17.3 After the merge: verification and automatic revert

Within **15 min** of the merge: `GET https://www.pawpi.info/api/health/deep` must return `ok:true` **and** `version` equal to the merge commit's 7-char sha (proves the new build is the one serving), then `/api/auth/session` and `/api/telemetry/config` must both return 200.

If that fails the workflow: (1) opens a **revert PR** (`git revert` of the merge commit, label `autofix-revert`), (2) merges it once its three checks are green (sha-pinned), (3) opens an issue **`🚨 Autofix reverted: <alert> (PR #n)`** labelled `autofix` + `needs-human` containing the incident report, (4) posts a Grafana annotation if `GRAFANA_ANNOTATION_TOKEN` and `GRAFANA_URL` are GitHub secrets. If the revert itself cannot be applied or its checks do not go green, the issue says **URGENT** and the revert PR stays open: merge it by hand. A merged revert pauses auto-merge for 24 h (rule 7).

### 17.4 Kill switch and how to disable it

| Goal | How | Undo |
|---|---|---|
| **Stop everything now** (no investigation, no PR, no merge; in-flight runs stop before merging) | GitHub -> Settings -> Secrets and variables -> Actions -> **Variables** -> `AUTOFIX_ENABLED` = `false` | set it to `true` or delete it |
| Stop the alerts reaching GitHub at all | Railway: remove `GITHUB_DISPATCH_TOKEN` (the relay stops dispatching) | add it back |
| Stop merging but keep investigating | Remove the `AUTOFIX_PAT` secret: the loop then opens a `needs-human` issue (with the patch) instead of a PR | add it back |
| Disable the workflow | GitHub -> Actions -> "Claude autofix" -> **Disable workflow** (does not cancel a run already in progress; use the variable for that) | Enable workflow |
| Stop one noisy alert | Grafana: pause the rule (the next `apply-grafana.mjs` never re-pauses or resumes it unless the repo file says `isPaused:false`) | Resume evaluation |

### 17.5 Pause state as code

`observability/grafana/alerts/*.json`: `isPaused: true` = created paused, and an update keeps the live state (you can resume or pause in the UI). `isPaused: false` = an explicit, reviewed "resume this rule": `apply-grafana.mjs --apply --sections alerts` resumes it (the dry run lists it as an update until live matches). The script **never pauses** a rule. Currently `false` for exactly four rules (a test pins the list).

### 17.6 What a human must review

- **Every `needs-human` PR / issue** (filter by label): the gate said no, or nothing was fixable. Read the incident summary, then merge, fix or close.
- **Every merged autofix PR, the next morning** (label `autofix`, state merged): the loop merged it without a person. Confirm the change is sensible; revert it if not. Merged PRs are small by construction (<= 5 files, <= 80 lines, web `src/` only, no payments / auth / session / migrations).
- **Every `🚨 Autofix reverted` issue**: something that passed CI broke production. Find out why the checks did not catch it and add a test.
- **The rate limit and revert pause**: if auto-merge keeps stopping with "rate limit", the same problem is probably recurring: fix the root cause by hand.
- **Weekly:** the gate itself (`scripts/autofix/gate.mjs`) is part of the safety system: any PR that touches `scripts/autofix/` or `.github/workflows/claude-autofix.yml` needs a human review (the loop can never change them: they are outside the allowed path).

### 17.7 Secrets and variables (names only)

| Where | Name | Needed for |
|---|---|---|
| GitHub secret | `AUTOFIX_PAT` | **Required** to open / merge PRs (fine-grained: Contents + Pull requests + Issues read/write). Without it the loop opens `needs-human` issues. |
| GitHub secret | `CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY` | The investigation |
| GitHub secret (optional) | `GRAFANA_URL`, `GRAFANA_TOKEN` | Claude can query Grafana while investigating |
| GitHub secret (optional) | `GRAFANA_ANNOTATION_TOKEN` (+ `GRAFANA_URL`) | Annotation when a merge is reverted |
| GitHub variable | `AUTOFIX_ENABLED` | `false` = kill switch |
| Railway | `ALERT_WEBHOOK_SECRET`, `GITHUB_DISPATCH_TOKEN` | Grafana -> app -> GitHub relay |

### 17.8 Testing the loop safely

Actions -> "Claude autofix (Grafana alert)" -> Run workflow with `alertname = ManualTest`, `summary = loop test - no code change expected`. A manual run **never merges** (unless you tick `allow_merge`): expect a `needs-human` issue. Do not tick `allow_merge` unless you want the change deployed.

## 18. HighLatencyP95: stall investigation and tuned rule (2026-10-05)

**Symptom.** Grafana showed API-wide p95 of 5-10 s for 5-13 minutes (2026-09-29 19:20-19:33 UTC, 2026-10-03 19:25-19:31 and 20:16-20:21 UTC), on every route at once, with no deploy and almost no traffic.

**Cause (from Railway HTTP logs, per request).** Not a stall: no restarts, no 5xx, no upstream errors, no pool or timeout log lines, and static assets were still served in 2-12 ms in the middle of the slow minutes (event loop alive). In every window one client IP produced the whole burst: one phone opening the app fires about 37-61 API calls in 2-3 seconds. The server answers one idle request in a constant ~1.4 s (`GET /api/threads/unread-count`, a single trivial query, took 1.43-1.51 s on all 15 isolated calls in the 09-29 window), and a burst of N requests finishes in waves of 10 because the pool holds `max` = 10 connections, one per request, for the whole request (37 requests = 4 waves x 1.4 s = the observed 5.0-5.4 s maximum). The 1.4 s floor is round trips, not query time (app queries are fast in `pg_stat_statements`: `app_leaderboard` averages 58 ms, the slowest are the provider-discover SELECTs at 100-250 ms, AUDIT A-14; nothing near 1.4 s): Railway runs in `us-east4`, Supabase in `sa-east-1`, so each sequential statement is a cross-continent round trip, and by reading the code a request paid about 8 of them (token-revocation check, `BEGIN`, profile lookup, `set_config`, the same profile lookup and `set_config` again in the handler, the real query, `COMMIT`). The p95 alert looks at a window holding only the burst, so a handful of launch-burst requests IS the whole distribution.

**Fix in code.** `withRequestContext` resolves and stamps the caller in one statement (was two) and `resolveUserId` / `resolveOrCreateUserId` reuse that result instead of repeating the lookup and the stamp: about 8 -> 5 round trips per request (by count; expect roughly a third off the latency floor on the 209 routes that use the helpers; measure after deploy). `utils/requestIdentity.js` has the safety argument. Not changed: `isTokenRevoked` (auth), pool size, anything in migrations or payments.

**Not changed, needs a human decision.**
- `postgres()` in `utils/sql.js` uses porsager defaults: `max` 10, no acquire timeout (a request waits in the queue indefinitely), `idle_timeout` 0. Raising `max` (for example 20) halves burst queueing, but only if `DATABASE_URL` is the Supavisor **transaction** pooler (port 6543); on the session pooler or a direct connection the limit is the pooler pool size / `max_connections` (60 on this project) and a larger `max` risks "max clients reached". Check the port in Railway before changing it.
- Co-locating the web service with the database (a Railway region near `sa-east-1`, or a Supabase region near `us-east4`) removes most of the floor and is worth more than any code change.
- The app fires duplicate calls at launch (`/api/pets`, `/api/providers`, `/api/services/discover` twice within one second); de-duplicating them in the mobile client is a separate ticket.

**Tuned `HighLatencyP95` (the live legacy rule; edit it in the Grafana UI, the apply script never touches non-`pawpi-` rules, see 5.2).** Pending period 15m (was 10m) and a minimum-traffic guard:

```
histogram_quantile(0.95, sum by (le) (rate(http_server_request_duration_seconds_bucket[5m]))) > 3
and on() sum(rate(http_server_request_duration_seconds_count[5m])) > 0.07
```

`0.07` req/s is about 21 requests per 5 minutes. Be aware of what it does and does not filter: a single launch burst (37-61 requests) is above it, so on its own the guard would not have silenced these three events. The `for: 15m` is what does: every observed event lasted 5-13 minutes. The rule is `issue only` for the autofix loop (section 17.2): it opens a diagnosis issue, never a patch and never an auto-merge. The earlier `HighLatencyP95` autofix PRs (#562 household N+1, #576 walk-requests fan-out) were speculative edits driven by the same noise.
