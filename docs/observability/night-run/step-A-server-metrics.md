Read ARCHITECTURE.md and supabase/SCHEMA_NOTES.md to get oriented, then I'll give you the task.

STEP A — Server metrics for EVERY feature area (web/API only; no mobile change; no migration).
Context: Grafana Cloud receives OpenTelemetry metrics from anything/apps/web (instrumentation.mjs, Hono middleware in __create/index.ts, src/lib/metrics.js). Today we only have overall 5xx rate, p95 and payment counters. Contract: docs/observability/night-run/01-TELEMETRY-CONTRACT.md (use its exact metric/label names).
Do:
1. HTTP: replace/extend the middleware to emit pawpi_http_requests_total and pawpi_http_request_duration_seconds with area/route(template)/method/status_class. Derive `route` from the matched router template; fall back to a normalizer that replaces numeric/uuid segments with :id and strips query strings. `area` from the path prefix map in one file (src/lib/telemetry/areas.js). Keep existing metrics working (don't break the 3 alert rules); keep old names until step D re-points the alerts.
2. DB: wrap the shared `sql` helper to record pawpi_db_query_duration_seconds / pawpi_db_errors_total by operation type only (never SQL text or params).
3. Process: memory, event-loop lag, uptime via OTel runtime/host metrics; attach service.version = RAILWAY_GIT_COMMIT_SHA (short) as a resource attribute.
4. Business counters pawpi_business_events_total at the real code sites: signup, signin (by method credentials/google/apple, outcome ok/fail), pet_created, post_created, health_log_created, routine_created, booking_created, order_created, push_token_registered, walk_logged.
5. GET /api/health/deep -> { ok, db_ms, version }, 503 if DB unreachable, no secrets, no auth, cheap query. Also expose pawpi_health_deep_ok.
6. Everything no-op without OTEL env; metric calls wrapped so they can never throw into a request.
Acceptance: unit tests for route normalization, area mapping, and /api/health/deep; a test that fails if any metric label value is unbounded-looking (contains digits-only segments, '?', '@'); CI green; PR body lists every metric + label and updates docs/observability/OPERATIONS.md.

UNATTENDED: do not ask questions. Use docs/observability/night-run/03-UNATTENDED-DEFAULTS.md, log decisions in docs/observability/night-run/PROGRESS.md.
