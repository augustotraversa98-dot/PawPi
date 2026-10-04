Read ARCHITECTURE.md and supabase/SCHEMA_NOTES.md to get oriented, then I'll give you the task.

TASK: Observability NIGHT RUN — UNATTENDED, WITH AUTO-MERGE. The owner is asleep and will not answer questions.
NEVER ask a question and wait. Use docs/observability/night-run/03-UNATTENDED-DEFAULTS.md for every decision; log it in PROGRESS.md.
Implement steps A..E (docs/observability/night-run/step-*.md) in order. Contract: 01-TELEMETRY-CONTRACT.md. Background: docs/observability/OPERATIONS.md.

OWNER AUTHORISATION (explicit, for THIS run only): after CI is green you MAY squash-merge each PR into main and let Railway deploy it,
then continue with the next step. Merging to main = production deploy (Railway auto-deploys; the app is LIVE with real users). So:

PER-STEP LOOP
1. git fetch; branch from latest origin/main (obs/A-server-metrics, obs/B-telemetry, obs/C-dashboards, obs/D-alerts, obs/E-logs-guard). Prefer a fresh sub-agent per step.
2. Implement per the step file. Run the full relevant tests locally. Open the PR (attribution lines from session instructions; body: what changed, new metric/event names matching the contract, how verified).
3. CI: `gh pr checks --watch`. If RED: read the failure, fix, push, repeat — up to 3 fix attempts. NEVER merge a PR whose required checks are red or pending, and never bypass/skip/disable a test or check to get green.
   After 3 failed attempts: convert PR to DRAFT, explain in PROGRESS.md, DO NOT merge, continue to the next step only if it does not depend on this one.
4. CI GREEN -> `gh pr merge --squash --delete-branch`. (If branch protection blocks the merge, record it and stop merging for the rest of the run; leave the remaining PRs open and green.)
5. POST-MERGE VERIFICATION (mandatory before the next step; wait up to 15 min for Railway to deploy):
   a. Deploy landed: https://www.pawpi.info/api/health/deep returns 200 {ok:true} and (from step A on) its `version` equals the merged commit's short sha. For step A itself the endpoint is new: 404 -> 200 is the signal. If nothing new after 15 min: STOP merging (see ROLLBACK/STOP).
   b. Smoke checks must all pass: GET /api/auth/social-enabled == {"google":true,"apple":true}; GET /api/auth/providers lists google; GET /account/signin and /account/signup return 200 and do not contain "Coming soon"; GET /api/auth/session returns 200.
   c. Server error check: no new burst of 5xx (compare Railway/health signals if available; else the smoke checks above are the gate).
6. If any verification fails: ROLLBACK = `git revert -m1`/revert the squash commit on a new branch, open the PR, wait for green, squash-merge it, re-run the smoke checks. Then STOP merging for the rest of the run (leave later PRs open, unmerged, green), and record everything in PROGRESS.md.
7. Append to PROGRESS.md: step, PR link, merged yes/no, deployed+verified yes/no, skipped actions, decisions made. Then next step.

CAPABILITIES (Gate 0, never a reason to stop the whole run)
Run scripts/observability/preflight.mjs if present (else follow 00-PREFLIGHT.md). Record: Grafana-write, Loki-write, OTLP-write, Synthetic-Monitoring, GitHub-push/PR/merge, CI.
- GitHub push/PR missing -> hard blocker: write PROGRESS.md and exit.
- Anything else missing -> still do code, tests, JSON, docs, PRs and merges; only SKIP live Grafana/Loki "apply" actions and list them under "Skipped (needs human)".

GRAFANA RULES: apply dashboards when permitted (folder "PawPi", uid prefix `pawpi-`). Alert rules are created PAUSED and stay paused. Never modify or delete anything that is not `pawpi-*`.
OTHER RULES: follow CLAUDE.md in full (no fake data; EN+ES copy; NO database migrations in this run). Do not change app behaviour beyond telemetry. Product bugs found -> PROGRESS.md "Found bugs", not fixed here.
STILL FORBIDDEN even with auto-merge: App Store submit / eas build / eas submit; changing app version, build number or eas.json; printing or committing secrets; deleting Grafana/Railway/Supabase/GitHub resources (except the PR branches via --delete-branch); merging any PR that is not one of this run's five (or its own revert); running migrations; messaging anyone.
Client telemetry code (step B) is merged to main but does NOT reach users until the owner ships build 25 — say so in PROGRESS.md.
BUDGET GUARD: if the same failure loops 3 times or work is clearly running away, stop and write PROGRESS.md. A partial, clean, verified result beats a broken big one.

DONE = PROGRESS.md: every step (status, PR link, merged, verified), Decisions made, Found bugs, Skipped (needs human), Morning checklist:
run `node scripts/observability/apply-grafana.mjs --apply` if skipped; un-pause alert rules after data flows; build 25 + App Store Connect App Privacy + privacy policy text (docs/privacy/telemetry.md); anything else.
