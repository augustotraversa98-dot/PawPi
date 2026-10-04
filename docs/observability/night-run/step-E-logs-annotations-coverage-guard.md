Read ARCHITECTURE.md and supabase/SCHEMA_NOTES.md to get oriented, then I'll give you the task.

STEP E — Logs, deploy markers, and the "nothing is unmonitored" guardrail.
Do:
1. Structured server logs (JSON: level, msg, route template, status, request_id, duration_ms) shipped to Loki as job="pawpi-web" with redaction of tokens, emails, bodies; bounded buffer; no-op without GRAFANA_LOKI_*; honour a log-level env. Do not log request bodies or query strings.
2. Deploy annotations: at server start, post a Grafana annotation (tags: deploy, commit short sha, service.version) so every dashboard shows deploys. Best-effort, never blocks boot.
3. Coverage guard (CI, no network): (a) every route file under src/app/api maps to an `area` (not "other" unless allow-listed with a reason); (b) every mobile screen file has a telemetry registry entry; (c) every funnel step in the contract is emitted somewhere in code; (d) dashboards/alerts reference only contract names. A failing check names the offender.
4. Docs: rewrite docs/observability/OPERATIONS.md (architecture, tiers, what each alert means and the first thing to check, how to add a screen/route so it stays covered, free-tier limits and cardinality rules, kill switches, un-pause procedure); add a short section to ARCHITECTURE.md; add a monthly 15-minute review checklist; update docs/roadmap.md and docs/test-backlog.md (human actions: build 25, App Privacy, privacy policy, un-pause alerts).
5. Do not change application behaviour.
Acceptance: guard fails when a new screen/route is added without coverage (prove with a test); CI green; docs accurate against what actually merged.

UNATTENDED: do not ask questions. Use docs/observability/night-run/03-UNATTENDED-DEFAULTS.md, log decisions in docs/observability/night-run/PROGRESS.md.
