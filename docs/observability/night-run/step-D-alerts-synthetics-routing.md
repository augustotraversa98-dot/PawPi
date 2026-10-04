Read ARCHITECTURE.md and supabase/SCHEMA_NOTES.md to get oriented, then I'll give you the task.

STEP D — Alerts, synthetic checks and notification routing for ONE person.
Design: two tiers so alerts stay readable. P1 = page now (phone push + email + autofix webhook). P2 = daily digest email.
Do:
1. observability/grafana/alerts/*.json + apply script (extend scripts/observability/apply-grafana.mjs; dry-run default). All rules uid prefix `pawpi-`, folder "PawPi", created PAUSED (isPaused=true). Keep the existing 3 rules; re-point them to the new metrics only if equivalent.
   P1: health/deep failing; 5xx rate > 5% (5m); sign-in failure rate spike (by method); signup success collapse vs 7-day; payments failure spike; DB errors; client crash/JS-error rate per app_version spike; any pawpi_client_api_calls 5xx share > 10%; 404/401 burst on a single route template (catches bugs like the /api/me/bookings 404s).
   P2: p95 slow routes (top-N); activation funnel step drop > 30% vs 7-day; nav_unexpected_redirect > 0 sustained; telemetry silent for 6h (client ingest = 0 while sessions expected); free-tier usage > 70%.
2. Notification policies: group by area; P1 -> contact point "Augusto" (email + webhook to autofix) AND the Grafana mobile app / IRM push if available on this stack (else document the 2-minute manual step); P2 -> digest (group_interval 24h).
3. Enrich the autofix relay (anything/apps/web/src/app/api/internal/grafana-alert/route.js): pass alert labels area + route + app_version to the GitHub dispatch. NOTE: client_payload may hold at most 10 properties — keep within it. Update .github/workflows/claude-autofix.yml prompt so Claude gets area/route and the contract file.
4. Synthetic Monitoring (if SM token present, else write the definitions and the apply step only): HTTP checks every 5 min — /api/health/deep (expects ok), /api/auth/social-enabled (expects google:true, apple:true), /api/auth/providers (expects google + apple-native), /account/signin and /account/signup (body must NOT contain "Coming soon", must contain "Log in"/"Create"); one scripted sign-up->session journey with a clearly-labelled test account if that is safe, otherwise skip and say why.
5. Tests: alert JSON lint (valid schema, severity label, runbook annotation with a "what to do" line on every rule).
Acceptance: dry-run clean; applied PAUSED; PR lists each rule with threshold + tier + runbook line; owner un-pauses after data flows (documented in OPERATIONS.md).

UNATTENDED: do not ask questions. Use docs/observability/night-run/03-UNATTENDED-DEFAULTS.md, log decisions in docs/observability/night-run/PROGRESS.md.
