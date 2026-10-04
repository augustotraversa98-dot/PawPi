Read ARCHITECTURE.md and supabase/SCHEMA_NOTES.md to get oriented, then I'll give you the task.

STEP C — Grafana dashboards as code, one per app area + behaviour + bottleneck finder.
Use only metric/log names from docs/observability/night-run/01-TELEMETRY-CONTRACT.md (they will start filling after A/B deploy).
Do:
1. observability/grafana/dashboards/*.json with stable uids `pawpi-<name>`, folder "PawPi". Dashboards:
   overview (availability, error rate, p95, active installs/sessions, deploy annotations);
   auth-onboarding (sign-in/up success by method, activation funnel drop-off per step, unexpected redirects);
   pets-feed-social; health-reminders; services-bookings-providers; payments-shop; walks-messaging-forum;
   mobile-client-health (errors by app_version, crash-free sessions, API failures seen by phones, slow screens/startup);
   behaviour (anonymous: top screens, top taps, paths between screens, feature usage, funnels, D1/D7/D30 return from install_id in Loki);
   database-infra (DB latency/errors, memory, event loop, Railway restarts);
   bottlenecks (top routes by p95 x volume, slowest screens, requests-per-screen outliers, slow-DB-op share).
   Every panel has a one-line description saying what a bad value means and what to do.
2. scripts/observability/apply-grafana.mjs: idempotent, DRY-RUN by default, `--apply` to write through the Grafana HTTP API using GRAFANA_URL + GRAFANA_SA_TOKEN. Only creates/updates objects with uid prefix `pawpi-`; never deletes others. Datasource uids resolved by type/name at runtime (no hard-coded uids).
3. A lint test (runs in CI, no network) that fails if any dashboard references a metric not in the contract, or a panel lacks a description.
4. Run --apply for real (preflight proved permission) and record in the PR which dashboards now exist. Panels will show "No data" until A/B ship: that is expected; say so in the PR.
Acceptance: lint passes; dry-run diff clean on second run (idempotent); CI green; docs/observability/OPERATIONS.md has a "Dashboards" section.

UNATTENDED: do not ask questions. Use docs/observability/night-run/03-UNATTENDED-DEFAULTS.md, log decisions in docs/observability/night-run/PROGRESS.md.
