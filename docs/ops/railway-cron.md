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

### Creating each service (Railway dashboard, project `surprising-clarity`, env `production`)

Repeat for each row above:

1. **+ New → GitHub Repo →** the PawPi repo (same repo as the `PawPi` backend service).
2. **Settings → Source → Root Directory:** `scripts/cron`. (The `Dockerfile` there builds a ~50 MB node image holding only the script.)
   **Branch:** `ops/railway-cron` while testing before the PR merges, `main` afterwards — see *Cutover* below.
3. **Settings → Deploy → Custom Start Command:** the *Start command* from the table.
4. **Settings → Deploy → Cron Schedule:** the *Cron* expression from the table.
5. **Settings → Deploy → Restart Policy:** *Never* (the script already retries; a failed run should show as failed, not loop).
6. **Settings → Networking:** do **not** generate a domain. No healthcheck.
7. **Variables** (names only — set the values in Railway, never in the repo/chat):
   - `CRON_SECRET` — use a **reference to the backend's variable** (`${{PawPi.CRON_SECRET}}`) so there is one source of truth
     and rotating it on the backend rotates it everywhere. (A plain copy also works; then it must be kept in sync.)
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
| subscriptions | ⚠️ **sequential yes, simultaneous no** | See below. |

**subscriptions — finding.** `app_due_subscriptions()` is a plain `STABLE` read with no row locking. A run that starts
*after* a previous one finished is safe: `next_charge_at` has advanced, and the payment uses a period-stable idempotency key
(`sub-<id>-<date>`). But two runs *at the same moment* both read the same due set and each inserts its own `orders` row
(and `order_items`); the payment dedupes on the key, so the customer is **not double-charged**, but an orphan `pending`
order (and possibly a second stock decrement) can appear. Railway never overlaps itself (a run is skipped if the previous
is still running), so the only exposure is a manual GitHub run fired *during* the 06:00 run. **Don't run the manual
`subscriptions` fallback around 06:00 UTC.**

**Proposed guard (not implemented — it touches job logic; say the word):** at the top of each per-subscription
transaction in `payments/subscriptions/run/route.js`, take `SELECT pg_try_advisory_xact_lock(hashtext('sub-charge'), ${sub.id})`
and skip the sub when it returns `false`; then re-read the sub's `next_charge_at` (under the lock) and skip if it's no longer due.
No migration needed (advisory locks are session/transaction-scoped, nothing is stored).

## Cutover (zero-gap order)

`scripts/cron/` exists only on the PR branch (`ops/railway-cron`) until the PR merges, so a service pointed at `main`
**cannot build yet** (Root Directory not found). Test on the branch first, then switch to `main`.

**A. Create + test BEFORE merging (recommended — no gap in scheduling)**

1. Create each service as above, but set **Settings → Source → Branch = `ops/railway-cron`**. GitHub's cron is still
   running, so nothing is missed while you test; an overlap is harmless (see the idempotency table — just avoid ~06:00 UTC).
2. Get one real run per service and read its log (Deployments → latest → Logs). It must show
   `status=200 … OK` (`{"skipped":"disabled"}` is also a 200 — fine; `NOTIF_V2_ENABLED` is on in prod):
   - Normally the first deploy of a cron service builds and then waits for its schedule. If you don't want to wait,
     temporarily set the **Cron Schedule** to `*/5 * * * *` (Railway's minimum interval), wait for the next 5-minute mark,
     confirm the run, then **set the real expression back** (table above). A run is the real job, not a dry run — the
     endpoints are idempotent, so that's fine. Don't do this for `cron-subscriptions` near 06:00 UTC.
   - A `Redeploy` also re-runs the start command on some plans/versions; if you see a run after Redeploy, use that.
3. Merge the PR. GitHub cron stops at merge (it only runs from the default branch).
4. **Immediately after the merge, for each of the five services: Settings → Source → Branch → `main`, then Redeploy.**
   Do this promptly — GitHub may auto-delete `ops/railway-cron` on merge, after which a service still pointing at it
   fails to build and its schedule silently stops. Confirm each service's *next* scheduled run builds from `main`.
5. Watch the next 24 h (below).

**B. If you merge first and the services already exist**

- Services created on `main` **before** the merge have only failed builds (nothing ran, nothing fired — harmless).
  After the merge: open each → **Redeploy** (or push any commit to `main`). The build now succeeds; do step 2 above on `main`.
- Services that were pointed at `ops/railway-cron`: do step 4 (switch Branch to `main`, Redeploy) right away.
- **There is a scheduling gap between the merge and the first verified Railway run** (GitHub cron is already off).
  Keep it short by finishing step 2 the same day; if a gap hurts (e.g. the 06:00 charge), run the job by hand:
  GitHub → Actions → *Cron jobs (manual fallback)* → Run workflow → pick the job.

## Verify each job fired on time (24 h)

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

Red flags: a deployment marked **Failed** (the log line says `FAILED`, with `status=401` = wrong/missing `CRON_SECRET`,
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
