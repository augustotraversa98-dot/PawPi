# Scheduled jobs on Railway cron

**Why:** GitHub Actions `schedule:` is best-effort. The hourly jobs were firing ~6×/day (gaps of ~4.5 h), delaying
notifications, push receipts and charges. The five schedules now run as **Railway cron services**; the GitHub
workflow (`.github/workflows/cron-jobs.yml`) is a **manual fallback only** (no `schedule:` trigger, so nothing
double-fires).

**How it works:** each cron service runs `node cron-trigger.mjs <job>` ([`scripts/cron/cron-trigger.mjs`](../../scripts/cron/cron-trigger.mjs),
dependency-free) on its schedule. The script POSTs the job's backend endpoint with the `x-cron-secret` header and exits
`0` on 2xx, `1` otherwise (so Railway shows the run as failed). It logs only job name, HTTP status and duration — never
the secret, URL, headers or response body. Timeout 120 s per attempt; up to 2 retries (2 s, 4 s backoff) on connection
errors and 5xx. It deliberately does **not** retry timeouts (the server may still be running the first request) or 4xx.

## The five services

All schedules are **UTC** (Railway cron is UTC; minimum interval 5 min; a run is skipped if the previous one is still running).

| Service name | Start command | Cron | Endpoint hit | Replaces GitHub cron |
|---|---|---|---|---|
| `cron-weekly-digest` | `node cron-trigger.mjs weekly-digest` | `0 * * * *` (hourly :00) | `POST /api/engagement/weekly-digest/run` | `0 * * * *` |
| `cron-winback` | `node cron-trigger.mjs winback` | `30 13 * * *` (daily 13:30) | `POST /api/engagement/reengagement/run` | `30 13 * * *` |
| `cron-push-receipts` | `node cron-trigger.mjs push-receipts` | `20 * * * *` (hourly :20) | `POST /api/notifications/push-receipts/run` | `20 * * * *` |
| `cron-subscriptions` | `node cron-trigger.mjs subscriptions` | `0 6 * * *` (daily 06:00) | `POST /api/payments/subscriptions/run` | `0 6 * * *` |
| `cron-calendar-sync` | `node cron-trigger.mjs calendar-sync` | `15 6 * * *` (daily 06:15) | `POST /api/providers/calendar/sync` | `15 6 * * *` |

### Recreating a service (Railway dashboard, project `surprising-clarity`, env `production`)

Only needed if one is lost or you add a job. Repeat for the row in question:

1. **+ New → GitHub Repo →** the PawPi repo (same repo as the `PawPi` backend service).
2. **Settings → Source → Root Directory:** `/scripts/cron`, **Branch:** `main`. (The `Dockerfile` there builds a ~50 MB node image holding only the script.)
3. **Settings → Deploy → Custom Start Command:** the *Start command* from the table.
4. **Settings → Deploy → Cron Schedule:** the *Cron* expression from the table.
5. **Settings → Deploy → Restart Policy:** *Never* (the script already retries; a failed run should show as failed, not loop).
6. **Settings → Networking:** do **not** generate a domain. No healthcheck.
7. **Variables** (names only — set the values in Railway, never in the repo/chat):
   - `CRON_SECRET` — use a **reference to the backend's variable** (`${{PawPi.CRON_SECRET}}`) so there is one source of truth
     to edit. **A reference does NOT rotate the secret everywhere by itself:** each cron service resolves it when a
     deployment is built, so after you change `CRON_SECRET` on the backend every cron service keeps sending the OLD value
     (and gets `401`) until it is **redeployed**. After rotating, redeploy all five services and update the GitHub Actions
     `CRON_SECRET` too; see `docs/ops/secret-rotation-runbook.md` §6. (A plain copy also works; then it must be kept in sync
     by hand.) We hit exactly this on 2026-10-21: `cron-weekly-digest` and `cron-push-receipts` returned `401` after the
     rotation until they were redeployed.
   - `CRON_BASE_URL` — the backend origin. Use the backend's **public** URL (the same host the GitHub workflow called).
     Optional: `CRON_TIMEOUT_MS` (default `120000`), `CRON_RETRIES` (default `2`).
8. Deploy. A cron service builds once, then runs on schedule (it shows "Completed" between runs; that is normal).

> **Private networking:** the backend has a private endpoint (`pawpi.railway.internal`, port 8080), but the server binds
> `0.0.0.0` (IPv4 only), so Railway's IPv6 private network may not reach it. Use the public URL unless you've proven the
> private one works (`CRON_BASE_URL=http://pawpi.railway.internal:8080`; the script allows plain `http` only for
> `localhost` / `*.railway.internal`).

**If the Dockerfile build misbehaves:** Railpack needs a `package.json` to detect Node. Delete nothing — just add
`scripts/cron/package.json` containing `{"private":true,"type":"module"}`; Railway then builds it as a plain Node service (same start command).

## Idempotency review (is it safe if a manual GitHub run overlaps a Railway run?)

| Job | Safe to hit twice? | Why |
|---|---|---|
| weekly-digest | ✅ | Claims `weekly_digest_state` (`UNIQUE(pet_id, week_start)`, `ON CONFLICT DO NOTHING`) *before* sending; a concurrent run waits on the row and skips. |
| winback | ✅ | Claim is `INSERT … ON CONFLICT DO UPDATE … WHERE last_winback_sent < now() - cap`; the second run re-evaluates the guard after the row lock and skips. |
| push-receipts | ✅ | Only touches unresolved tickets; resolve / mark-invalid / log GC are idempotent. Worst case an overlap fetches the same receipts twice. |
| calendar-sync | ✅ | Replaces each feed's busy blocks wholesale — same input, same result. |
| subscriptions | ✅ | Per-subscription `pg_try_advisory_xact_lock` + re-check of `next_charge_at` under the lock (see below); the payment also dedupes on `sub-<id>-<date>`. |

**subscriptions — overlap guard.** `app_due_subscriptions()` is a plain `STABLE` read with no row locking, so two runs *at the
same moment* read the same due set. Before the guard, each inserted its own `orders` row (and `order_items`); the payment
deduped on its period-stable idempotency key (`sub-<id>-<date>`), so the customer was never double-charged, but an orphan
`pending` order (and possibly a second stock decrement) could appear. A run that starts *after* another finished was always
safe (`next_charge_at` had advanced).

Now, at the top of each per-subscription transaction in `payments/subscriptions/run/route.js`:

1. `SELECT pg_try_advisory_xact_lock(hashtext('sub-charge'), <sub id>)` — if it returns `false` another run is charging that
   subscription right now, so this run **skips it immediately** (`skipped: "already being charged"`; it never waits).
2. Under the lock it re-reads the subscription (`status = 'active' AND next_charge_at <= now()`); if a run that held the lock
   before it already advanced the schedule, it skips (`skipped: "no longer due"`). This covers a run holding a stale due-set
   snapshot that only reaches the lock after the first run committed.

The lock is **transaction-scoped** and per subscription: nothing is stored (no migration), it is released automatically at
COMMIT/ROLLBACK (including when a charge throws), and it is safe behind the Supabase pooler (transaction mode). Different
subscriptions never block each other. `pawpi_app` can call the lock functions (they live in `pg_catalog`, executable by default).
Proven against real Postgres, as `pawpi_app`, by `test/integration/subscription-run-overlap.integration.test.ts`. A skipped
sub shows up in the response body's `skipped` list, which is normal when a manual run overlaps the scheduled one — the manual
`subscriptions` fallback is therefore safe to run at any time.

## Current setup

The five services above exist in Railway (project `surprising-clarity`, env `production`) and deploy from **`main`**
(Root Directory `/scripts/cron`, Restart Policy *Never*, no public domain). They were created after PR #632 merged, directly
on `main` via the Railway API, with `CRON_SECRET` = reference to the backend's `${{PawPi.CRON_SECRET}}` and `CRON_BASE_URL` = the
backend's public Railway service domain (not the custom domain). GitHub cron has been off since that merge, so Railway is the
only scheduler. **Status: DONE, verified 2026-10-16** — over 24 h all five ran on schedule with `status=200 … OK` (hourly jobs every hour, no gaps; subscriptions 06:04, calendar-sync 06:15, winback 13:33 UTC). Expect a start lag of up to ~5 min.

**Changing a schedule or start command later:** Railway → the service → **Settings → Deploy** → *Cron Schedule* /
*Custom Start Command*, then update the table above (and keep `cron-trigger.mjs` job names in sync for a new job).
Changing the script itself needs a push to `main`; the services pick it up on their next deploy (Redeploy to force it).

## Verify each job fired on time (24 h) — how, if you ever need to re-check

In Railway → each cron service → **Deployments** (one row per run) and **Logs**. A healthy run logs one line:

```
cron-trigger: job=weekly-digest attempt=1/3 status=200 duration=840ms OK
```

| Service | Expected in 24 h | On-time check |
|---|---|---|
| `cron-weekly-digest` | 24 runs | one per hour, started at :00 (±a few min) |
| `cron-push-receipts` | 24 runs | one per hour, started at :20 |
| `cron-winback` | 1 run | 13:30 UTC |
| `cron-subscriptions` | 1 run | 06:00 UTC |
| `cron-calendar-sync` | 1 run | 06:15 UTC |

Red flags: a deployment marked **Failed** (the log line says `FAILED`, with `status=401` = wrong/missing `CRON_SECRET`
(after a rotation: the cron service was not redeployed, see the runbook above),
`status=503` = `CRON_SECRET` unset on the backend, `error="timeout"` / `"connection error"` = backend down or wrong
`CRON_BASE_URL`); a gap > ~5 min past the expected minute; fewer rows than the table. The hourly jobs should show **no
4.5 h gaps** — that was the whole bug. A 2xx only proves the endpoint answered; per-pet / per-subscription failures are in
the response body (not logged here by design) — see the backend (`PawPi`) service logs / `notification_send_log`.

## Rollback to GitHub scheduling

1. Pause the Railway services (Settings → Deploy → clear the Cron Schedule, or delete the service) so nothing double-fires.
2. In `.github/workflows/cron-jobs.yml` re-add under `on:` (keep `workflow_dispatch`):
   ```yaml
   schedule:
     - cron: '0 6 * * *'    # subscriptions
     - cron: '15 6 * * *'   # calendar-sync
     - cron: '0 * * * *'    # weekly-digest
     - cron: '30 13 * * *'  # winback
     - cron: '20 * * * *'   # push-receipts
   ```
   and gate each job on `github.event.schedule` as before (the pre-change file is in git history: `git log -- .github/workflows/cron-jobs.yml`).
   The simplest rollback is `git revert` of the PR that introduced this doc.

## Manual fallback (no schedule)

GitHub → Actions → **Cron jobs (manual fallback)** → *Run workflow* → pick a job. Uses the repo secret `CRON_SECRET`.
