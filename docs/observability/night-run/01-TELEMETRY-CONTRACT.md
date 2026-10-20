# PawPi telemetry contract (single source of truth)

Every step of the night run builds against THIS file, so steps can be developed and merged
independently. If a step needs a new metric/event, add it HERE first (same PR).

## Principles
1. ANONYMOUS by design. No user id, auth id, email, name, phone, pet id/name/handle, post text,
   comment text, address, precise location, IP, device id/IDFA/IDFV. Ever.
2. Allowlist, not blocklist. Event names, screen names, tap targets, feature names and funnel steps come from
   ONE registry (`anything/apps/mobile/src/telemetry/registry.js`, mirrored server-side). Unknown values are dropped.
3. Metrics = low cardinality only (bounded label values). Detail/behaviour = structured log lines (Loki).
   Never put an id, a query string, free text or a raw URL in a metric label.
4. Everything is a no-op when its env var is unset; telemetry can NEVER break or slow the app
   (fire-and-forget, try/catch, timeouts, bounded queues).
5. Remote kill switch: GET /api/telemetry/config -> { enabled, sampleRate }.
6. User control: Settings toggle "Help improve PawPi" (default ON, anonymous). Off = no events,
   queue cleared, install_id deleted.

## Anonymous identifiers
- `install_id`: random UUIDv4 created on first launch, stored in SecureStore, deleted on opt-out. Not linked to any account.
- `session_id`: random UUIDv4 per app foreground session (new after 30 min in background).

## Server metrics (OpenTelemetry, prefix `pawpi_`)
| Metric | Type | Labels |
|---|---|---|
| pawpi_http_requests_total | counter | area, route, method, status_class |
| pawpi_http_request_duration_seconds | histogram | area, route, method |
| pawpi_db_query_duration_seconds | histogram | op (select/insert/update/delete/other) |
| pawpi_db_errors_total | counter | op |
| pawpi_business_events_total | counter | event, outcome (ok/fail), method |
| pawpi_health_deep_ok | gauge | - |
| pawpi_process_memory_bytes | gauge | kind (rss/heap_used/heap_total/external) |
| pawpi_process_event_loop_lag_seconds | gauge (p99 since previous export) | - |
| pawpi_process_uptime_seconds | gauge | - |
| pawpi_telemetry_ingest_total | counter | result (accepted/dropped/invalid/rate_limited) |

`area` in: auth, pets, feed, health, services, providers, booking, payments, shop, forum, walks, messages,
training, adoption, insurance, telehealth, notifications, admin, telemetry, other.
`route` = route TEMPLATE (e.g. /api/pets/:id/profile), never a concrete path. Every path parameter is spelled `:id`.
Non-API traffic (SPA pages, assets) is bucketed to `/__page`; unmatched `/api/...` (404/405) to `unmatched`; a
safety valve `overflow` caps the fallback normalizer. `method` is one of GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS/OTHER;
`status_class` is `1xx`..`5xx` (or `unknown`). Source of truth for `area`: `anything/apps/web/src/lib/telemetry/areas.js`.
Business `event` in: signup, signin, pet_created, post_created, health_log_created, routine_created,
booking_created, order_created, push_token_registered, walk_logged. `method` in: credentials, google, apple, none.

## Client-derived metrics (computed server-side from accepted events)
| Metric | Type | Labels |
|---|---|---|
| pawpi_client_events_total | counter | event, platform, app_version |
| pawpi_client_screen_views_total | counter | screen, app_version |
| pawpi_client_errors_total | counter | kind, screen, app_version |
| pawpi_client_api_calls_total | counter | area, status_class, app_version |
| pawpi_client_api_duration_seconds | histogram | area, app_version |
| pawpi_client_screen_ready_seconds | histogram | screen, app_version |
| pawpi_client_startup_seconds | histogram | app_version |
| pawpi_funnel_step_total | counter | funnel, step |
| pawpi_client_sessions_total | counter | app_version |

## Client event taxonomy (batched POST /api/telemetry/events, Loki line per event)
Envelope: { install_id, session_id, app_version, build, platform, os_major, locale, sent_at, events: [...] }
Event: { name, t (ms since session start), props }
- session_start { cold: bool }, session_end { duration_s_bucket }   (mobile: `session_start` leads the first event of a launch and of every new session (>= 30 min in background);
  `session_end` is sent at EVERY transition to background with the length of that foreground stretch, so a session can have several)
- screen_view { screen }
- tap { target, screen }                      (target = registry key, never visible text)
- form_step { form, step, action: view|complete|abandon|error }
- api_call { area, route, status_class, ms_bucket }
- error { kind: js|promise|render|network|api, screen, code }
- nav_unexpected_redirect { from, to, reason }   <- would have caught the "Services -> onboarding" bug
- perf_startup { ms_bucket }, perf_screen_ready { screen, ms_bucket }
- feature_used { feature }
- funnel_step { funnel, step }
- auth_diag { kind }   (session cleared + why / Keychain write-verify result / cold launch found a stored token or none; `kind` in the registry `AUTH_DIAG_KINDS`; counted as `pawpi_client_auth_diag_total{diag,app_version}`; never a token, id or email)
- opt_out {}   (sent once, then everything stops)
Buckets for durations: <100, <300, <1000, <3000, <10000, >=10000 ms.

### Registry detail (Step B; authoritative file: `anything/apps/web/src/lib/telemetry/registry.js`, mirrored byte-for-byte as `anything/apps/mobile/src/telemetry/registry.js`)
- Bucket LABELS: `ms_bucket` in `lt100|lt300|lt1000|lt3000|lt10000|gte10000`; `session_end.duration_s_bucket` in
  `lt10|lt60|lt300|lt900|lt3600|gte3600` (seconds). Client durations are recorded in the `*_seconds` histograms as a
  representative value per bucket (geometric mean of the edges; open top bucket = 15 s), so quantiles are bucket-resolution.
- `screen` / `from` / `to` = a ROUTE TEMPLATE from the registry `SCREENS` (file `src/app/(tabs)/health.jsx` -> `/health`,
  `index.jsx` -> `/`, `[id].jsx` -> `/:id`; groups `(x)` dropped) or the bounded value `unknown`. Never a concrete URL.
- `tap.target` must be in `TAP_TARGETS` (keys match `^[a-z][a-z0-9_]{0,39}$`); `feature_used.feature` in `FEATURES`;
  `form_step.form` in `FORMS`, `form_step.step` a short key `^[a-z][a-z0-9_]{0,39}$`, `action` in `view|complete|abandon|error`;
  `funnel_step` funnel + step must be a pair from the named funnels above. Unknown values => the event is dropped.
- `api_call.route` = route template (`/api/pets/:id/profile`) or `unknown|unmatched|overflow`; never an id/query. `status_class` in
  `1xx..5xx|unknown`; `error.code` = short machine code `^[A-Za-z0-9_.-]{1,32}$` (HTTP status / error class), never a message.
- `nav_unexpected_redirect.reason` in `onboarding_guard|welcome_guard|session_expired|deeplink|other`.
- `error.kind` in `js|promise|render|network|api`. Event props are strings (or `cold: bool`); nothing else.
- Envelope patterns: `install_id` UUIDv4, `session_id` UUID, `app_version` `1.2[.3[.4]][-tag]`, `build` `[A-Za-z0-9._-]{1,16}`,
  `os_major` 1-3 digits (number or string), `locale` `xx` or `xx-XX`, `sent_at` ISO string or epoch ms. Limits: body <= 32 KB,
  <= 50 events per request. Rate limit (in memory, per instance): 30 requests/min per `install_id`, 300/min per client IP (hashed, never stored).
- `app_version` is the only client-influenced metric label: it must match the pattern and at most 20 distinct values are kept per
  process, everything else is `other`.
- Ingest result semantics (`pawpi_telemetry_ingest_total{result}`): `accepted` / `dropped` (well-formed but not on the allowlist, or the
  kill switch is on; counted per request when the kill switch is on) / `invalid` (malformed, PII-looking prop key, bad envelope; the
  envelope case counts 1 per request) per event; `rate_limited` per request.
- Server env: `TELEMETRY_INGEST_ENABLED` (kill switch, `false` = accept-and-discard), `TELEMETRY_SAMPLE_RATE` (0..1, default 1),
  `GRAFANA_LOKI_URL` / `GRAFANA_LOKI_USER` / `GRAFANA_LOKI_TOKEN` (all three or Loki shipping is a no-op).

## Named funnels (steps in order)
- activation: welcome_view, signup_or_oauth_start, auth_done, onboarding_photo, onboarding_dog_details, onboarding_done, first_post, first_health_log
- services: services_tab, discover_view, provider_view, booking_start, booking_done
- health_logging: health_tab, track_open, log_saved
- routines: routines_open, routine_form_open, routine_saved
- retention helpers (from install_id in Loki): D1/D7/D30 return.

## Logs (Loki)
- job="pawpi-web": ONE structured JSON access-log line per HTTP request (Step E, `src/lib/telemetry/serverLogs.js`). Stream labels ONLY
  `{job, level, area}`; line fields exactly `{ts, level, msg, route, status, request_id, duration_ms, method}` (`route` = the same bounded
  template as `pawpi_http_*`, never the raw path; `level`: 5xx error, 4xx warn, else info). Never contains request bodies, query strings,
  headers, cookies, tokens, emails or user ids (msg is scrubbed of email/Bearer/JWT/long-token substrings). Env: `LOG_LEVEL` (default info),
  `LOG_SHIP_ENABLED=false` (kill switch), `LOG_SAMPLE_2XX`, `LOG_MAX_LINES_PER_SEC`, `LOG_MAX_ERROR_LINES_PER_SEC`, `LOG_STDOUT`.
- job="pawpi-client": one JSON line per accepted client event. Labels: event, app_version, platform (only these).
