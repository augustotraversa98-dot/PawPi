Read ARCHITECTURE.md and supabase/SCHEMA_NOTES.md to get oriented, then I'll give you the task.

TASK: Observability night-run PREFLIGHT. Prove — BEFORE the owner leaves — that this environment can do
everything the night run needs inside Grafana, GitHub and the repo. Change nothing in production.
RUN THIS IN THE SAME ENVIRONMENT (Claude Code cloud environment, same env vars + network settings) the night run will use.
A pass on the owner's laptop proves nothing about the cloud environment.

1. Read docs/observability/night-run/README.md, 01-TELEMETRY-CONTRACT.md, 02-RUNBOOK-NIGHT-RUN.md, docs/observability/OPERATIONS.md and GRAFANA_SETUP.md.
2. Create scripts/observability/preflight.mjs (Node >=18, zero dependencies). It prints a PASS / WARN / FAIL table and
   NEVER prints secret values (names + booleans only). Exit code 1 on any FAIL. Checks:
   A. Env var NAMES present: GRAFANA_URL, GRAFANA_SA_TOKEN, OTEL_EXPORTER_OTLP_ENDPOINT, OTEL_EXPORTER_OTLP_HEADERS,
      GRAFANA_LOKI_URL, GRAFANA_LOKI_USER, GRAFANA_LOKI_TOKEN, ALERT_WEBHOOK_SECRET, GITHUB_DISPATCH_TOKEN (WARN if missing: GRAFANA_SM_URL, GRAFANA_SM_TOKEN).
   B. Network: HTTPS reachability from this environment to GRAFANA_URL, the OTLP endpoint host, the Loki host, api.github.com, https://www.pawpi.info/api/auth/social-enabled.
      If blocked: FAIL with the exact hostnames to add to the cloud environment's allowed network domains (e.g. *.grafana.net).
   C. Grafana API with GRAFANA_SA_TOKEN: GET /api/health; identify token + role; list datasources (find the Prometheus and Loki uids).
   D. WRITE permission, reversible: create folder "PawPi (preflight)", create a throwaway dashboard in it, read it back, delete both.
   E. Alerting provisioning: list alert rules, contact points, notification policies; create a PAUSED throwaway alert rule in the throwaway folder, read it back, delete it.
   F. Existing data: run an instant query on the Prometheus datasource for count({__name__=~"pawpi_.*"}) and report how many pawpi_* series exist today (informational).
   G. Loki: push one log line {job="pawpi-preflight"} and query it back.
   H. OTLP endpoint: a harmless authenticated request (empty OTLP payload) must not return 401/403 (WARN on other non-2xx).
   I. Synthetic Monitoring (optional): list checks with GRAFANA_SM_TOKEN; WARN if unavailable.
   J. Free-tier headroom: if the grafanacloud usage metrics are queryable, report active series / log GB vs limits; WARN above 70%.
   K. GitHub: `gh auth status`; can create a branch + push (use `git push --dry-run`) and open/list PRs; CI workflow names present.
   L. Repo: node/npm versions; dependency install works; `npm run test:integration` and the mobile + web unit-test commands exist and start.
3. Run it. If anything FAILS, do not "fix around it": write the exact human actions needed (see HUMAN HELP below).
4. Write docs/observability/night-run/PREFLIGHT-RESULT.md (no secrets): date, table, and a final line
   `READY FOR NIGHT RUN: YES` or `READY FOR NIGHT RUN: NO` followed by the numbered list of what the human must fix.
5. Do NOT commit secrets. Open a PR for the script + result file only if everything is clean; otherwise leave the files uncommitted and say so.

HUMAN HELP text to include for common failures:
- No token: Grafana Cloud -> your stack -> Administration -> Users and access -> Service accounts -> add account (role Admin) -> add token. Put it in the Claude Code environment variables as GRAFANA_SA_TOKEN, never in chat/repo. Also set GRAFANA_URL (https://<stack>.grafana.net).
- Loki/OTLP values: Grafana Cloud portal -> your stack -> Details -> Loki and OpenTelemetry sections (URL, user id, token with logs:write / metrics:write).
- Network blocked: Claude Code environment settings -> network access -> allow *.grafana.net (+ the hosts above).

ACCEPTANCE: the final line of PREFLIGHT-RESULT.md is explicit; every FAIL has a concrete fix; no secret value appears anywhere.

UNATTENDED: if run unattended, do not ask questions; report results in PREFLIGHT-RESULT.md and continue per 03-UNATTENDED-DEFAULTS.md.

ADDITIONAL CHECKS FOR AUTO-MERGE (this run merges to main, which auto-deploys production):
 M. GitHub merge capability: `gh api repos/{owner}/{repo} --jq .permissions` shows push/maintain; read branch protection for main (required checks, required reviews). If required reviews would block a self-merge, FAIL with that fact.
 N. Production smoke endpoints reachable from this environment: /api/auth/social-enabled == {"google":true,"apple":true}, /api/auth/providers lists google, /account/signin and /account/signup return 200, /api/auth/session returns 200.
 O. `gh pr checks` works on an existing PR (so the run can watch CI).
