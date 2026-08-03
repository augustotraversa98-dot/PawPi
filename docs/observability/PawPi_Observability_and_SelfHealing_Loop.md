# PawPi — Observability + Self-Healing Loop (Grafana × Railway × Claude)

**Goal:** give PawPi eyes (Grafana Cloud watches the live app) and a safe reflex
(when something breaks, Claude investigates and opens a **pull request** with a
fix that your existing CI tests gate and you approve). Same "observe → enhance →
fix" loop your friend described — but with a human checkpoint on anything that
touches production.

---

## ▶ START HERE — your next steps, in order

**Phase 1 — Observe (do this first, run it ~1 week before the loop):**

1. In Grafana, confirm you're on the **Free** plan with **no payment method**
   (Account → Billing).
2. In Grafana: **Connections → Add new connection → OpenTelemetry (OTLP)**. Copy
   the **OTLP endpoint** and the ready-made **`Authorization=Basic …` header**.
3. In your repo, drop the delivered files into place (paths in §5) and run
   **Prompt A** (§6) in Claude Code, then commit + push.
4. Set the **Railway variables** (list in §6, right after Prompt A) — this is what
   turns telemetry on. It triggers one redeploy.
5. Verify: open `https://pawpi-production.up.railway.app/api/internal/grafana-alert`
   (should return `{"ok":true}`), and check Grafana **Explore** for data after ~2 min.
6. In Grafana: import `grafana/dashboard.json`, create the alert rules (§7 /
   GRAFANA_SETUP.md), and point them at **email you** for now. Watch for a week.

**Phase 2 — Turn on the self-healing loop (after the alerts are trustworthy):**

7. Create the GitHub secrets: your Claude token (`CLAUDE_CODE_OAUTH_TOKEN` from
   `claude setup-token`, or `ANTHROPIC_API_KEY`), `AUTOFIX_PAT`, and set
   `GITHUB_DISPATCH_TOKEN` in Railway. (Details in §4.)
8. Add `.github/workflows/claude-autofix.yml` and run **Prompt B** (§6).
9. In Grafana, add the **webhook contact point** → the relay route with your
   `ALERT_WEBHOOK_SECRET`, and route your alerts to it (GRAFANA_SETUP.md).
10. Test it: GitHub → Actions → "Claude autofix" → **Run workflow**. Then let a
    real alert fire and review the PR it opens.

> I (Claude in this chat) can do #4 for you via the Railway tools, and walk #2/#6/#9
> with you live in the browser. Just paste your Grafana OTLP endpoint + token.

---

## 0. What's already done (you don't need to redo this)

- **Railway** is live: project `surprising-clarity`, service `PawPi`, deployed
  from `augustotraversa98-dot/PawPi` (branch `main`, root `anything/apps/web`),
  domain `pawpi-production.up.railway.app`, port 8080.
- **Supabase** Postgres + **MercadoPago** payments are wired (env already set).
- **CI** runs on every PR (`.github/workflows/ci.yml`): mobile jest, web vitest,
  and a real-Postgres integration job. This is what gates the autofix PRs — the
  loop only works *because* you already have these tests.

So this project adds **two** things on top: (A) telemetry → Grafana Cloud, and
(B) the alert → Claude → PR loop.

---

## 1. Architecture

```
  ┌─────────────────────────┐
  │  Railway: PawPi web/API  │   OpenTelemetry (instrumentation.mjs)
  │  (React Router + Hono)   │──── traces + metrics + logs ──┐
  └───────────┬──────────────┘                               │
              │  alert relay route                            ▼
              │  /api/internal/grafana-alert        ┌───────────────────────┐
              │  (Bearer secret)                    │   Grafana Cloud (free) │
              │                                     │  dashboards + alerts   │
              │        ┌────────────── webhook ─────┤  (RED metrics, 5xx,    │
              │        │  (alert fires)             │   latency, payments)   │
              ▼        ▼                            └───────────────────────┘
      ┌─────────────────────────┐
      │ GitHub repository_dispatch (event: grafana-alert)        │
      └───────────┬──────────────────────────────────────────────┘
                  ▼
      ┌─────────────────────────┐   reads alert + code, applies a MINIMAL fix
      │ GitHub Action:          │   writes /tmp/incident.md, runs web unit tests
      │ claude-autofix.yml      │──▶ opens a PR  (never pushes to main)
      └───────────┬─────────────┘
                  ▼
      ┌─────────────────────────┐   ci.yml runs on the PR → you review → merge
      │ Pull Request (gated)    │──▶ Railway auto-deploys main
      └─────────────────────────┘
```

Everything flows through **one** Grafana OTLP endpoint (no extra services to run)
and **one** GitHub event. No auto-deploy to production — ever, in this design.

---

## 2. Cost — and how we stay on Grafana Free forever

**Grafana Cloud Free plan (verified Aug 2026):** 10k active metric series, 50 GB
logs/mo, 50 GB traces/mo, 14-day retention, 3 users, alerting included. It's a
"forever free" plan with **no time limit and no credit card required**.

**Why you can't accidentally get billed by Grafana:** because Free has no card on
file, there is literally no way for it to charge you. If you exceed a free limit,
Grafana throttles/drops the extra ingestion — it does **not** bill you. The only
ways to ever pay Grafana are to *actively* click "Upgrade to Pro" or start a Pro
trial and add a card. So the rule is simple: **stay on Free, add no payment
method, and decline any "upgrade"/trial prompt.**

**Staying comfortably under the free limits (baked into the config):**
- **Traces** are sampled to ~20% (`OTEL_TRACES_SAMPLER_ARG=0.2`) — the biggest
  lever against the 50GB traces quota.
- **Logs shipping is OFF by default** (`OTEL_LOGS_ENABLED` unset) — logs are the
  easiest way to burn quota, and Railway already keeps logs. Turn on only if you
  want Grafana log search later.
- **Metrics** use route *templates* (`/api/pets/[id]`, not per-id URLs), so series
  count stays bounded — your ~30 API routes sit far under the 10k-series limit.
- Check **Grafana → Billing/Usage** occasionally; if any meter creeps toward the
  limit, trim before it matters (drop a label, lower the sample rate). You'll get
  throttled, never charged.

**Other costs:**
- **Railway**: already paying; telemetry is outbound only, adds ~nothing.
- **The Claude that runs in the GitHub Action** needs a login. If you have Claude
  Pro/Max, use a subscription token (`claude setup-token` → `CLAUDE_CODE_OAUTH_TOKEN`)
  and it costs **nothing extra** — it draws on the plan you already pay for. Only
  if you don't have a subscription do you fall back to a pay-per-use
  `ANTHROPIC_API_KEY` (a few cents to low dollars per alert investigation). Either
  way it's unrelated to Grafana, and it only runs when an alert actually fires.

---

## 3. Rollout order (important — don't enable everything at once)

**Phase 1 — Observe only (do this first, live for ~a week).**
Ship telemetry, build the dashboard, set alerts to notify *you* (email). Watch
what's normal vs. noisy. Tune thresholds. No Claude in the loop yet.

**Phase 2 — Turn on the loop.**
Once the alerts are trustworthy (not flapping), point the alert contact point at
the relay route and enable the `claude-autofix` workflow. Start with the loop
opening PRs for *warning*-level alerts; you'll see the quality before trusting it
with critical paths.

**Phase 3 — Business metrics.**
Add the payment/auth/db counters (`metrics.js`) and the payment-failure alert.
These are the ones that actually protect revenue.

---

## 4. Manual steps only you can do (accounts + secrets)

1. **Grafana Cloud** — (account created ✓). First, confirm you're on **Free**:
   Account/Org → **Billing** should show the Free plan with **no payment method**.
   If signup started a Pro trial, that's fine to let expire — just never add a
   card, and it drops to Free. Then open
   **Connections → Add new connection → OpenTelemetry (OTLP)**. Copy:
   - the **OTLP endpoint** (looks like `https://otlp-gateway-<zone>.grafana.net/otlp`)
   - the **instance ID** and an **API token**, and compute the auth header value:
     `Authorization=Basic <base64 of "instanceID:token">`.
   (Grafana's OTLP page shows this exact string — just copy it.)

2. **GitHub → fine-grained PAT** (for the app to trigger the workflow):
   Settings → Developer settings → Fine-grained tokens → new token, scoped to the
   `PawPi` repo, **Contents: Read and write**. Call it `GITHUB_DISPATCH_TOKEN`.

3. **GitHub → a second PAT** `AUTOFIX_PAT` (so the autofix PR triggers CI):
   same repo, **Contents: R/W** + **Pull requests: R/W**. (Optional but
   recommended — without it, CI won't auto-run on the bot's PR and you'll have to
   nudge it.)

4. **Claude login for the Action** — pick ONE:
   - **Best if you have Claude Pro/Max (no extra cost):** run `claude setup-token`
     on your machine, copy the token, and save it as the GitHub secret
     `CLAUDE_CODE_OAUTH_TOKEN`. This makes the Action use your existing
     subscription instead of metered API billing.
   - **Otherwise:** create an API key at console.anthropic.com and save it as the
     secret `ANTHROPIC_API_KEY` (pay-per-use).

5. **Your generated relay secret** (already made for you — reuse this exact value
   in Railway and in the Grafana contact point):

   ```
   ALERT_WEBHOOK_SECRET=452b0c4067f646c3921119b73cba38e5f0818afbb078445a476fb72829834fb4
   ```

---

## 5. The files (delivered alongside this doc — drop each at its path)

| File | Put it at (in the repo) |
|---|---|
| `instrumentation.mjs` | `anything/apps/web/instrumentation.mjs` |
| `metrics.js` | `anything/apps/web/src/lib/metrics.js` |
| `grafana-alert-route.js` | `anything/apps/web/src/app/api/internal/grafana-alert/route.js` |
| `claude-autofix.yml` | `.github/workflows/claude-autofix.yml` |
| `grafana/dashboard.json` | import into Grafana (Dashboards → New → Import) |
| `grafana/GRAFANA_SETUP.md` | reference for alert rules + contact point |

---

## 6. Grey-box prompts for Claude Code (run in order, in the repo)

### Prompt A — wire in telemetry + the alert relay (Phase 1)

```
We are adding observability to the PawPi web service (anything/apps/web — React
Router v7 + Hono on Railway, started in prod via `npm start` →
node ./build/server/index.js).

I've placed these files:
- anything/apps/web/instrumentation.mjs
- anything/apps/web/src/app/api/internal/grafana-alert/route.js

Do the following, surgically, and change nothing else:
1. Add these deps to anything/apps/web/package.json:
   @opentelemetry/sdk-node, @opentelemetry/api,
   @opentelemetry/auto-instrumentations-node,
   @opentelemetry/exporter-trace-otlp-http,
   @opentelemetry/exporter-metrics-otlp-http,
   @opentelemetry/exporter-logs-otlp-http,
   @opentelemetry/sdk-metrics, @opentelemetry/sdk-logs,
   @opentelemetry/resources, @opentelemetry/semantic-conventions
   Then run `bun install` in anything/apps/web so bun.lock updates (CI installs
   with --frozen-lockfile and will fail otherwise).
2. Confirm the new API route file matches this repo's route convention (compare
   it to an existing route like src/app/api/payments/subscriptions/run/route.js —
   same export style, POST handler, Response usage). Fix the export style if it
   differs. Do NOT change any other route.
3. Verify instrumentation.mjs is a no-op when OTEL_EXPORTER_OTLP_ENDPOINT is
   unset (it must not affect dev/test/CI).
4. Run `npm test` in anything/apps/web and make sure it still passes.
Report exactly what you changed. Do not touch payments/auth/env/CI.
```

After Prompt A passes, set these **Railway variables** on the PawPi service
(dashboard → Variables, or ask me and I'll set them via the Railway tools):

```
OTEL_EXPORTER_OTLP_ENDPOINT = <from Grafana OTLP page>
OTEL_EXPORTER_OTLP_HEADERS  = Authorization=Basic <base64 instanceID:token>
OTEL_SERVICE_NAME           = pawpi-web
ALERT_WEBHOOK_SECRET        = 452b0c4067f646c3921119b73cba38e5f0818afbb078445a476fb72829834fb4
GITHUB_DISPATCH_TOKEN       = <the fine-grained PAT from step 2>

# --- Free-tier guardrails (keep these) ---
OTEL_TRACES_SAMPLER         = parentbased_traceidratio
OTEL_TRACES_SAMPLER_ARG     = 0.2
# Keep only ~20% of traces so you stay under the 50GB/mo traces quota. Raise later
# if you want more detail and you're still well under limits.
#
# Do NOT set OTEL_LOGS_ENABLED. Leaving it unset keeps log-shipping OFF, which
# protects the 50GB/mo logs quota. Railway keeps its own logs, and the autofix
# loop doesn't need Grafana logs. Set it to "true" only if you later want log
# search in Grafana and you've confirmed you're under quota.
```

> **How telemetry is switched on — do NOT use `NODE_OPTIONS`.** `NODE_OPTIONS`
> applies to *every* Node process including Railway's build toolchain, which fails
> the build with `Cannot find module '/app/instrumentation.mjs'`. Instead, the
> loader is added to the **start script only**, in `anything/apps/web/package.json`:
> `"start": "NODE_ENV=production node --import ./instrumentation.mjs ./build/server/index.js"`.
> That scopes `--import` to the running server, where the file exists at runtime.
> (This is already committed — commit `0ad3496`.)

(Setting the variables triggers one redeploy. After it's up, the boot log should
show `[otel] telemetry started → …grafana.net/otlp`, `GET
https://pawpi-production.up.railway.app/api/internal/grafana-alert` should return
`{"ok":true,...}`, and telemetry should appear in Grafana Explore within a couple
of minutes.)

### Prompt B — add the autofix workflow (Phase 2)

```
Add the file .github/workflows/claude-autofix.yml (already provided) to the repo.
Then VERIFY it against the currently installed Claude Code CLI:
- Check `claude --help` for the exact flags. The workflow uses:
  `claude -p "<prompt>" --permission-mode acceptEdits --allowedTools "..." --output-format text`
  Adjust flag names/values if the installed version differs.
- Confirm the "Open PR or Issue" step's gh commands are valid.
Do not weaken the guardrails in the prompt (PR-only, never push to main, minimal
fixes, no secret/CI/env edits). Report any flag changes you made.
```

Then add these **GitHub repo secrets** (Settings → Secrets and variables →
Actions):

```
# Claude login — set ONE of these:
CLAUDE_CODE_OAUTH_TOKEN = <from `claude setup-token`>   # uses your subscription, no extra $
ANTHROPIC_API_KEY       = <Anthropic API key>           # OR pay-per-use, if no Pro/Max

AUTOFIX_PAT = <the second PAT, PR write>   # so the PR triggers CI
GRAFANA_URL   = https://<your-stack>.grafana.net   # optional, gives Claude read context
GRAFANA_TOKEN = <Grafana read token>               # optional
```

### (Optional) Prompt C — business metrics (Phase 3)

```
I've added anything/apps/web/src/lib/metrics.js. Instrument the payment flow with
it, minimally:
- In the MercadoPago create/checkout route: paymentAttempt.add(1, {provider:'mercadopago'}).
- In the payment webhook/confirmation route: paymentSuccess or paymentFailure
  with a `reason` attribute on failure.
- Wrap the main DB helper's catch paths with dbError.add(1) where an error is
  already being logged.
Keep it to one-line counter calls at existing branch points. Don't restructure
anything. Run `npm test` after. Report the exact lines you added.
```

---

## 7. Grafana dashboards + alerts

Import `grafana/dashboard.json` (Dashboards → New → Import → upload → pick your
Prometheus data source). Then create the alert rules and the webhook contact
point exactly as in `grafana/GRAFANA_SETUP.md`. The contact point URL is the
relay route; its Bearer credential is the `ALERT_WEBHOOK_SECRET` above.

---

## 8. Guardrails & how to pause the loop

- **It never deploys.** Claude only opens PRs; your CI + your click ships it.
- **Scope-limited.** The Action's prompt forbids touching secrets, env, CI, and
  payment/auth-charging logic without flagging; it prefers guards over refactors;
  and it makes **no** change when the cause isn't clear (opens an issue instead).
- **Kill switch.** To pause: GitHub → Actions → "Claude autofix" → **Disable
  workflow**. Or remove `GITHUB_DISPATCH_TOKEN` in Railway (relay stops firing).
- **Noise control.** Grafana's notification policy group/repeat intervals cap how
  often an alert can wake the loop.
- **Review every autofix PR like any PR.** The bot is a junior on-call that
  drafts a fix; you're still the reviewer.

---

## 9. Honest caveats

- The Claude Code CLI flags in the workflow (`-p`, `--permission-mode`,
  `--allowedTools`) evolve; Prompt B has your local Claude Code verify them
  against the installed version. Same for the official `anthropics/claude-code`
  GitHub Action if you'd rather use that than the CLI.
- Exact Prometheus metric names after OTLP conversion can vary by version —
  confirm them in Grafana Explore and paste the real names into the alert rules
  (noted in GRAFANA_SETUP.md).
- Start in **observe-only** for a week. A self-healing loop is only as good as the
  alerts feeding it; garbage alerts → garbage PRs.
```
