Read ARCHITECTURE.md and supabase/SCHEMA_NOTES.md to get oriented, then I'll give you the task.

STEP B — Anonymous behaviour telemetry: server ingest + mobile SDK. (Ships to users only with app build 25; code lands now.)
Contract: docs/observability/night-run/01-TELEMETRY-CONTRACT.md — follow it literally. Privacy is a hard requirement: anonymous, allowlisted, user-controllable.

SERVER (anything/apps/web):
1. POST /api/telemetry/events — no auth required; body <= 32 KB, <= 50 events; strict schema validation from a registry (event names, screens, targets, features, funnels, step names, prop keys/values). Unknown event/prop => dropped; any string prop not matching the registry or a short safe pattern => event dropped. Per-install_id + per-IP in-memory rate limit. Returns 204 (or 400/429); never 5xx on bad input. Do not store or log the client IP. Honour TELEMETRY_INGEST_ENABLED=false (kill switch).
2. GET /api/telemetry/config -> { enabled, sampleRate }.
3. Forward accepted events: (a) update the client-derived metrics in the contract; (b) write one JSON log line per event to Loki (labels only: job="pawpi-client", event, app_version, platform) via GRAFANA_LOKI_URL/USER/TOKEN, batched, fire-and-forget, bounded memory, no-op if unset. Emit pawpi_telemetry_ingest_total.
4. Tests: schema accepts every contract event; rejects any prop named like email/name/pet/handle/user/address/phone/text, long free text, unknown events; rate limit; kill switch; no PII ever reaches Loki/metrics.

MOBILE (anything/apps/mobile):
5. src/telemetry/: registry.js (screens = route templates for EVERY file under src/app, tap targets, features, funnels), installId.js (SecureStore, random), queue.js (batch: flush every 15 s / 20 events / app background; offline queue capped at 200, drop oldest; never blocks UI), track.js (`track(name, props)`), TelemetryProvider mounted once at the root (session start/end, config fetch, opt-out).
6. Auto-instrumentation so almost nothing needs hand-wiring:
   - screen_view + perf_screen_ready from the expo-router navigation state (templates, never params).
   - tap: add an optional `trackId` to the shared PressableScale (default derived from testID/accessibilityLabel KEY, never visible text), emit tap automatically.
   - api_call + error(kind:api|network): in src/__create/fetch.ts record route template, status_class, ms_bucket.
   - error(kind:js|promise|render): global handler + ErrorBoundary.
   - nav_unexpected_redirect: whenever navigation lands on onboarding*/welcome from anywhere other than the EntryPoint's initial decision or an explicit user action (log from, to, reason).
   - perf_startup from the existing boot-trace (markBootComplete).
   - useFormTelemetry(formName) hook; wire onboarding steps, Add Dog, Edit Profile, routine forms, booking flow, sign-in/sign-up entry.
   - funnel_step for every funnel in the contract.
7. Settings: toggle "Help improve PawPi (anonymous)" EN + ES, default ON; OFF => queue cleared, install_id deleted, one opt_out event, no further events. Put short explanatory copy under it (EN+ES).
8. Tests: registry-coverage test (every screen file in src/app has a registry entry; fails otherwise); PII-guard test on track(); opt-out test; queue overflow test; PressableScale tap test; telemetry never throws when offline/disabled.
9. Docs: docs/privacy/telemetry.md (what is collected/not, retention, how to opt out) + drafted privacy-policy paragraph EN+ES + the exact "App Privacy" answers to set in App Store Connect (Usage Data + Diagnostics, NOT linked to identity, NOT used for tracking). Mark these as HUMAN actions; do not edit live policy pages.
Rules: no new migration; no change to auth logic; no app version/build edits.
Acceptance: all tests + CI green; PR lists every event/prop; verify with a local run that a fake batch lands as metrics + one Loki line each (if env available), otherwise document how to verify.

UNATTENDED: do not ask questions. Use docs/observability/night-run/03-UNATTENDED-DEFAULTS.md, log decisions in docs/observability/night-run/PROGRESS.md.
