# observability/

Grafana objects for PawPi, kept as code. Nothing here runs in the app.

- `grafana/dashboards/*.json` - one file per dashboard, `uid` = `pawpi-<file name>`, pushed to the Grafana folder **PawPi**.
  They use ONLY the metrics in `docs/observability/night-run/01-TELEMETRY-CONTRACT.md` and the Loki streams
  `job="pawpi-client"` / `job="pawpi-web"`. Datasources are the placeholders `${DS_PROMETHEUS}` / `${DS_LOKI}`; the apply
  script resolves the real ones at runtime. Every panel has a one-line description (what a bad value means, what to do).
- Apply them with `scripts/observability/apply-grafana.mjs` (dry run by default, `--apply` to write; needs `GRAFANA_URL` and
  `GRAFANA_SA_TOKEN`). It only touches uids starting with `pawpi-` and never deletes anything.
- A lint test (`anything/apps/web/src/observability/`, part of `npm test`) fails on an unknown metric, a missing description,
  a hard-coded datasource uid or a Loki query outside the two pawpi jobs.
- The pre-existing dashboard `docs/observability/dashboard.json` and the live alert rules are not managed here and are never modified.

Full guide (dashboard list, how to apply, how to add a panel, behaviour-dashboard caveats): `docs/observability/OPERATIONS.md`, section 4 (Dashboards) and section 11 (how to add one; the coverage guard).
