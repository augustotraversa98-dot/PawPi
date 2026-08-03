# PawPi — Observability & Self‑Healing Operations Runbook

**Status: LIVE.** PawPi watches itself (Grafana Cloud), alerts you (email), and drafts
fixes for your approval (Claude → PR). Nothing auto‑deploys. This doc is the single
source of truth for operating it.

_Last updated: 2026‑08‑03._

---

## 1. What's running

```
  Railway: PawPi web/API (React Router + Hono)
    │  OpenTelemetry (instrumentation.mjs, loaded via the start script)
    │  + Hono middleware for HTTP metrics + payment counters
    ▼
  Grafana Cloud (FREE tier)  ── dashboards + 3 alert rules
    │        (alert fires → emails you AND ↓)
    ▼
  App relay: POST /api/internal/grafana-alert  (Bearer secret)
    │  → GitHub repository_dispatch (event: grafana-alert)
    ▼
  GitHub Action: .github/workflows/claude-autofix.yml
    │  Claude reads the alert + code → minimal fix OR diagnosis
    ▼
  Opens a PR (fix)  or  Issue (diagnosis)   ← you review
    │  CI (ci.yml) gates the PR → you merge → Railway auto‑deploys
```

No step ever deploys to production without your merge.

---

## 2. Component inventory

### Code (in this repo, live in production)
| Piece | Path | Commit |
|---|---|---|
| OTel bootstrap (traces+metrics, no‑op if unconfigured) | `anything/apps/web/instrumentation.mjs` | 68857a1 |
| Loaded via start script (`node --import ...`) | `anything/apps/web/package.json` | 0ad3496 |
| HTTP request metrics middleware (bundling‑proof) | `anything/apps/web/__create/index.ts` | 027a319 |
| Payment counters (attempt/success/failure) | `anything/apps/web/src/lib/metrics.js` + checkout route + `utils/payments/index.js` | 42c9180 |
| Alert relay route | `anything/apps/web/src/app/api/internal/grafana-alert/route.js` | 68857a1 / b6ae96a |
| Autofix workflow | `.github/workflows/claude-autofix.yml` | c92546b |

### Grafana Cloud (free tier)
- **Dashboard:** "PawPi — API health (RED)" (import source: `docs/observability/dashboard.json`).
- **Alerts** (folder `PawPi`, group `PawPi`, no‑data → Normal on each):
  - `HighServerErrorRate` — 5xx rate > 5% for 5m.
  - `HighLatencyP95` — p95 > 3s for 10m.
  - `PaymentFailuresSpike` — failure rate > 20% over 15m (populates on first real checkout).
- **Contact point:** `Augusto` — has **email** + **webhook** (webhook → the relay route).

### Credentials (names only — values live in the platforms)
| Name | Where | Purpose |
|---|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` / `_HEADERS` | Railway | Ship telemetry to Grafana OTLP |
| `OTEL_TRACES_SAMPLER` / `_ARG` | Railway | Trace sampling (free‑tier control) |
| `ALERT_WEBHOOK_SECRET` | Railway + Grafana webhook | Auth the Grafana→app call |
| `GITHUB_DISPATCH_TOKEN` | Railway | App → GitHub `repository_dispatch` |
| `AUTOFIX_PAT` | GitHub secret | Bot opens PR/Issue (Contents+PR+Issues RW) |
| `CLAUDE_CODE_OAUTH_TOKEN` | GitHub secret | Claude auth in CI (your Max plan, $0 extra) |

---

## 3. How to operate

**When an alert fires:** you get an email, and the loop opens either a **PR** (Claude
found a safe, tested fix) or an **Issue** (diagnosis only, no change). Review it like
any PR/issue. PRs are gated by CI; merging one triggers a Railway deploy.

**Reviewing an autofix PR:** read Claude's incident summary in the PR body, check the
diff, let CI go green, merge if you agree. Close it if you disagree — nothing is lost.

**Test issues:** the two from setup (`ManualTest`, `TestAlert`) can be closed as "not
planned." Filter all loop output by the `autofix` label.

**Kill switch:** GitHub → Actions → "Claude autofix" → ⋯ → **Disable workflow**. Or
remove `GITHUB_DISPATCH_TOKEN` in Railway (the relay stops firing). Re‑enable anytime.

**Add / tune an alert:** Grafana → Alerting → Alert rules → New (copy an existing one).
Queries and thresholds for more rules are in `docs/observability/GRAFANA_SETUP.md`.
If an alert is noisy, raise its threshold or increase the pending period.

**Cost:** Grafana is free‑tier forever (no card on file, so it can't bill you). The
autofix Claude runs on your Max plan via the OAuth token — $0 extra. It only runs when
an alert actually fires.

---

## 4. Known limitations (by design / platform)

- **No request traces / Application Observability.** The server is Vite‑bundled, which
  blocks OpenTelemetry's automatic HTTP instrumentation. Metrics work (measured at the
  Hono layer); distributed traces would need un‑bundling the server — deferred.
- **Payment metrics need traffic.** `pawpi_payment_*` only exist after real checkouts;
  the payment alert stays Normal (via no‑data→Normal) until then.
- **Trace sampling is 20%** (`OTEL_TRACES_SAMPLER_ARG=0.2`). At higher traffic this
  protects the free‑tier quota; raise toward 1.0 while volume is low if you want more.
- **Logs are not shipped to Grafana** (`OTEL_LOGS_ENABLED` unset) to protect the 50GB
  logs quota. Railway keeps its own logs.

---

## 5. Troubleshooting quick‑reference (issues already solved)

| Symptom | Cause | Fix |
|---|---|---|
| Deploy fails: `Cannot find module '/app/instrumentation.mjs'` | `NODE_OPTIONS` poisons the *build* toolchain | Load `--import` in the **start script**, not `NODE_OPTIONS` (0ad3496) |
| Metric not in Grafana dropdown, no `http_*` metrics | Bundling blocks auto HTTP instrumentation | Hono middleware emits the metric (027a319) |
| Relay returns 502, GitHub 422 "No more than 10 properties" | `client_payload` had 11 keys (max 10) | Trimmed to 9 (b6ae96a) |
| Workflow green but no Issue/PR; log `Header … invalid value` | Claude token saved with a newline/space | Re‑paste `CLAUDE_CODE_OAUTH_TOKEN` as one clean line |
| Log `Resource not accessible by personal access token (createIssue)` | PAT missing Issues permission | Add **Issues: Read and write** to the fine‑grained PAT |
| Alert flips to "NoData" and emails you when idle | Query returns empty with no traffic | Set the rule's **no‑data → Normal** |

---

## 6. Maintenance

- This repo's `docs/*.md` are version‑controlled — when the observability setup changes,
  update the relevant doc in the same commit so the repo stays the source of truth.
- Tokens have expirations (the GitHub PAT). Regenerate before expiry and update both
  `AUTOFIX_PAT` (GitHub) and `GITHUB_DISPATCH_TOKEN` (Railway) with the new value.
