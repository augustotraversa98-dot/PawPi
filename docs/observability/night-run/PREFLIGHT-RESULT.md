# Observability night-run PREFLIGHT — result

- **Date:** 2026-10-04 (run at ~03:33 UTC)
- **Environment:** the Claude Code cloud session environment (same env vars + network policy a night run started from here would get). Branch `claude/night-run-preflight-h9nd9w`.
- **Script:** `scripts/observability/preflight.mjs` (Node >=18, zero deps; prints env var NAMES + booleans only; exit 1 on any FAIL). Re-run with `node scripts/observability/preflight.mjs`.
- **Changes in production / Grafana:** none. No Grafana write test could run (no credentials), so nothing was created or deleted anywhere.
- **Totals:** PASS 11 · WARN 3 · FAIL 17

## Table

| # | Status | Check | Detail |
|---|---|---|---|
| A | **FAIL** | Required env vars (names only) | present: - \| MISSING: GRAFANA_URL, GRAFANA_SA_TOKEN, OTEL_EXPORTER_OTLP_ENDPOINT, OTEL_EXPORTER_OTLP_HEADERS, GRAFANA_LOKI_URL, GRAFANA_LOKI_USER, GRAFANA_LOKI_TOKEN, ALERT_WEBHOOK_SECRET, GITHUB_DISPATCH_TOKEN |
| A | **WARN** | Optional env vars (Synthetic Monitoring) | missing: GRAFANA_SM_URL, GRAFANA_SM_TOKEN |
| B | **FAIL** | Reach GRAFANA_URL | env var not set -> cannot test (host unknown) |
| B | **FAIL** | Reach OTLP endpoint | env var not set -> cannot test (host unknown) |
| B | **FAIL** | Reach Loki | env var not set -> cannot test (host unknown) |
| B | **PASS** | Reach api.github.com | api.github.com -> HTTP 200 |
| B | **FAIL** | Reach pawpi.info social-enabled | www.pawpi.info -> TypeError: fetch failed: Request was cancelled. |
| C | **FAIL** | Grafana API (health / token / datasources) | GRAFANA_URL and/or GRAFANA_SA_TOKEN not set -> skipped |
| D | **FAIL** | Reversible dashboard write test | skipped: Grafana API not usable (see C) |
| E | **FAIL** | Alerting provisioning | skipped: Grafana API not usable (see C) |
| F | **FAIL** | Existing pawpi_* series (informational) | skipped: no Prometheus datasource (see C) |
| G | **FAIL** | Loki push + query back | GRAFANA_LOKI_URL / _USER / _TOKEN not set -> skipped |
| H | **FAIL** | OTLP authenticated empty request | OTEL_EXPORTER_OTLP_ENDPOINT / _HEADERS not set -> skipped |
| I | **WARN** | Synthetic Monitoring (optional) | GRAFANA_SM_TOKEN not set -> SM steps would be skipped |
| J | **WARN** | Free-tier headroom | skipped: Grafana API not usable (see C) |
| K | **FAIL** | `gh auth status` | github.com X Failed to log in to github.com using token (GH_TOKEN) - Active account: true - The token in GH_TOKEN is invalid. |
| K | **PASS** | Can push a branch (`git push --dry-run`) | ok (from claude/night-run-preflight-h9nd9w) |
| K | **FAIL** | Can list PRs (`gh pr list`) | skipped: gh not authenticated |
| K | **PASS** | CI workflow names present | ci.yml[CI: mobile (jest) / web (vitest) / web (integration / real Postgres)]; claude-autofix.yml[Claude autofix (Grafana alert)]; cron-jobs.yml[Scheduled cron jobs] |
| L | **PASS** | node version | node 22.22.0, npm 10.9.4 |
| L | **PASS** | bun (web lockfile manager) | bun 1.3.14 |
| L | **PASS** | web: `npm run test` exists | vitest run |
| L | **PASS** | web: `npm run test:integration` exists | vitest run --config vitest.integration.config.ts |
| L | **PASS** | web: dependency install | node_modules already present |
| L | **PASS** | web: unit tests start + pass | Test Files  302 passed (302) |
| L | **PASS** | web: integration harness starts (embedded Postgres) | ok |
| L | **PASS** | mobile: `npm run test` exists | jest && jest --config jest.config.tz-negative.js |
| L | **FAIL** | mobile: dependency install | forbidden by your security policy, or npm error 403 on a server you do not have access to. npm error A complete log of this run can be found in: /root/.npm/_logs/2026-10-04T03_33_14_000Z-debug-0.log |
| M | **FAIL** | GitHub merge capability + branch protection | skipped: gh not authenticated (see K) |
| N | **FAIL** | Production smoke endpoints | unreachable: www.pawpi.info -> TypeError: fetch failed: Request was cancelled. |
| O | **FAIL** | `gh pr checks` on an existing PR | skipped: gh not authenticated (see K) |

## What is proven vs. NOT proven

- **Proven OK:** Node 22 / npm 10 / bun present; web unit suite (302 files) passes; web integration harness (embedded Postgres) boots and passes; `git push` to origin is permitted (dry-run); `api.github.com` reachable; CI workflows present (`mobile (jest)`, `web (vitest)`, `web (integration / real Postgres)`).
- **Blocked / NOT proven (no verdict possible until the fixes below are done):** every Grafana check (C, D, E, F, J), Loki (G), OTLP (H), Synthetic Monitoring (I), production smoke endpoints (N), branch protection / merge capability (M), `gh pr checks` (O), and the mobile test suite (L). A FAIL here means "cannot be shown to work from this environment", not "known broken in Grafana".
- **Important for the auto-merge run:** the night run MUST NOT merge to production while N is red (it cannot verify deploys) or while `gh` is unauthenticated (it cannot watch CI or merge).

## What the human must fix (exact list)

1. **Add the Grafana/OTel/Loki variables** to the Claude Code environment variables (never in chat/repo): `GRAFANA_URL`, `GRAFANA_SA_TOKEN`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS`, `GRAFANA_LOKI_URL`, `GRAFANA_LOKI_USER`, `GRAFANA_LOKI_TOKEN`.
   - `GRAFANA_SA_TOKEN`: Grafana Cloud -> your stack -> Administration -> Users and access -> Service accounts -> add account (role **Admin**) -> add token. `GRAFANA_URL` = `https://<stack>.grafana.net`.
   - Loki/OTLP values: Grafana Cloud portal -> your stack -> Details -> Loki and OpenTelemetry sections (URL, user id, token with `logs:write` / `metrics:write`).
2. **Add the relay secrets** (same values as Railway, see `docs/observability/OPERATIONS.md` §2): `ALERT_WEBHOOK_SECRET`, `GITHUB_DISPATCH_TOKEN`.
3. **Open the network policy** (Claude Code environment settings -> network access): allow `*.grafana.net`, `www.pawpi.info` (and `pawpi.info`), and `codeload.github.com`. Evidence: the proxy answered 403 to CONNECT for `www.pawpi.info:443`; npm got 403 from `codeload.github.com` (the git-hosted `react-native-calendars` dependency). The Grafana hostnames cannot be tested until item 1 is done — if your stack's Loki/OTLP hosts are not under `grafana.net`, allow those exact hosts too.
4. **Fix `gh` authentication:** the `GH_TOKEN` in this environment is invalid/expired. Replace it with a fine-grained PAT for `augustotraversa98-dot/PawPi` (Contents RW, Pull requests RW, Actions R, Metadata R, plus Administration R so branch protection can be read), set as `GH_TOKEN` in the environment variables.
5. **Decide the branch-protection / required-review policy for `main`** once item 4 lets check M read it: if `main` requires approving reviews, a bot cannot self-merge — set required approvals to 0 for the night, add the PAT owner as a bypass actor, or accept that PRs stay open (green) for morning merge.
6. **Re-run** `node scripts/observability/preflight.mjs` in the same environment after 1–5 and confirm the last line reads `READY FOR NIGHT RUN: YES` before leaving.

READY FOR NIGHT RUN: NO
