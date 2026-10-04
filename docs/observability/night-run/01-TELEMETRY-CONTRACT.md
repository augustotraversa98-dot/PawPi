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
- session_start { cold: bool }, session_end { duration_s_bucket }
- screen_view { screen }
- tap { target, screen }                      (target = registry key, never visible text)
- form_step { form, step, action: view|complete|abandon|error }
- api_call { area, route, status_class, ms_bucket }
- error { kind: js|promise|render|network|api, screen, code }
- nav_unexpected_redirect { from, to, reason }   <- would have caught the "Services -> onboarding" bug
- perf_startup { ms_bucket }, perf_screen_ready { screen, ms_bucket }
- feature_used { feature }
- funnel_step { funnel, step }
- opt_out {}   (sent once, then everything stops)
Buckets for durations: <100, <300, <1000, <3000, <10000, >=10000 ms.

## Named funnels (steps in order)
- activation: welcome_view, signup_or_oauth_start, auth_done, onboarding_photo, onboarding_dog_details, onboarding_done, first_post, first_health_log
- services: services_tab, discover_view, provider_view, booking_start, booking_done
- health_logging: health_tab, track_open, log_saved
- routines: routines_open, routine_form_open, routine_saved
- retention helpers (from install_id in Loki): D1/D7/D30 return.

## Logs (Loki)
- job="pawpi-web": structured JSON server logs (level, msg, route, status, request_id, duration_ms). Redacted.
- job="pawpi-client": one JSON line per accepted client event. Labels: event, app_version, platform (only these).
