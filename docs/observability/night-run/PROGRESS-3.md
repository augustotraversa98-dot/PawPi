# Night run 3 — PROGRESS-3

Run date: 2026-10-04 (unattended). Same rules as run 2 (`02-RUNBOOK-NIGHT-RUN.md`, `03-UNATTENDED-DEFAULTS.md`). Previous: `PROGRESS-2.md`.
Merge rule used: squash-merge only when `mobile (jest)`, `web (vitest)`, `web (integration / real Postgres)` were all `success` on the PR head sha (sha pinned in the merge call), then production verification. Nothing was reverted; no check was skipped or weakened.
Goal: close the loop **Grafana alert -> Claude investigates -> fix PR -> checks -> merge -> deploy -> verify**, safely and automatically.

## Summary
| # | Task | PR | Merged | Production verified |
|---|---|---|---|---|
| 1 | Resume the 4 server alert rules as code (+ apply) | [#610](https://github.com/augustotraversa98-dot/PawPi/pull/610) | yes, squash `5634881` | yes |
| 2 | Harden `claude-autofix.yml` (kill switch, dedupe, rate limit, merge gate, verify, revert) | [#611](https://github.com/augustotraversa98-dot/PawPi/pull/611) | yes, squash `a2a5426` | yes |
| 3 | Test the loop (`workflow_dispatch` ManualTest) | no PR (live run) | n/a: ended with issue [#613](https://github.com/augustotraversa98-dot/PawPi/issues/613), no PR, no merge | yes (3a); 3b skipped |
| 4 | OPERATIONS.md "Automatic fix loop" | [#612](https://github.com/augustotraversa98-dot/PawPi/pull/612) | yes, squash `cab5d51` (docs only) | yes |
| – | This file | docs-only PR (this one) | see final report | docs-only |

After every merge: `/api/health/deep` -> `{ok:true, version == merged short sha}`; `social-enabled == {"google":true,"apple":true}`; `/api/auth/providers` lists google; `/account/signin` + `/account/signup` 200 without "Coming soon"; `/api/auth/session` 200; `/api/telemetry/config` 200. All passed first time for #610, #611, #612.

## 1. Server alert rules resumed as code (#610)
- **Field name:** the rule field is `isPaused` (not `paused`).
- **Why a tooling change was needed:** `apply-grafana.mjs` ignored the file's `isPaused` on update and both the loader and `alertLint` *rejected* `false`, so "resume as code" was impossible. `isPaused: false` is now an **explicit, reviewed resume declaration** (create active / resume a paused rule; the dry run lists it as an update until live matches). `isPaused: true` keeps the old semantics (create paused; update keeps the live state; never re-pauses). The script still never pauses, deletes, or touches non-`pawpi-` objects. Tests: allow-list test pins exactly the four active rules; new apply tests for explicit resume (dry run -> apply -> 0 changes) and for "an owner-resumed rule is not re-paused".
- `p1-critical.json`: `isPaused:false` only for `P1-ServerMetricsSilent`, `P1-Http5xxRate`, `P1-DbErrors`, `P1-HealthDeepFailing`.
- Dry run (read-only, before merge): `0 create, 4 update, 11 unchanged`; after merge `--apply --sections alerts` wrote exactly those 4; re-run dry run (`alerts,dashboards,policies`): **0 create, 0 update, 27 unchanged, 2 skipped** (the two intentional digest skips, no `ALERT_DIGEST_EMAIL`), exit 0.
- Verified live through the provisioning API (token never printed): **ACTIVE** = `P1-DbErrors`, `P1-HealthDeepFailing`, `P1-Http5xxRate`, `P1-ServerMetricsSilent`; **paused (11)** = `P1-ClientApi5xxShare`, `P1-ClientCrashRate`, `P1-PaymentsFailureSpike`, `P1-Route4xxBurst`, `P1-SigninFailureSpike`, `P1-SignupCollapse`, `P2-ActivationFunnelDrop`, `P2-FreeTierUsage`, `P2-NavUnexpectedRedirect`, `P2-SlowRoutesP95`, `P2-TelemetrySilent`; the 3 legacy rules (`HighServerErrorRate`, `HighLatencyP95`, `PaymentFailuresSpike`) untouched and active.
- **Consequence to be aware of:** these four are now live P1 rules routed to `Augusto` (email + webhook -> relay -> the autofix workflow). From `a2a5426` on, a firing one can start the automatic loop.

## 2. Hardened autofix loop (#611)
`claude-autofix.yml` is now three jobs in two trust zones; the investigation step and its hard rules are kept verbatim, plus a required final `CONFIDENCE: high|medium|low` line (high only if reproduced / clearly traced **and** tests pass).

| job | token | what |
|---|---|---|
| `preflight` | `GITHUB_TOKEN` | kill switch (`vars.AUTOFIX_ENABLED == 'false'`), dedupe (open `autofix` PR for the same alertname), creates labels `autofix` / `needs-human` / `autofix-revert` |
| `investigate` | read-only, **no PAT** | Claude investigates, hands back an artifact (report + patch). Alerts `P1-ServerMetricsSilent` / `P1-HealthDeepFailing` are issue-only: any patch is discarded |
| `deliver` | `GITHUB_TOKEN`; `AUTOFIX_PAT` only for push / create PR / merge | no model; scripts run from a copy made before the patch exists |

Gate (`scripts/autofix/gate.mjs`): PR opened by this run; the 3 required checks green on the head sha (REST check-runs, 25 min); only `anything/apps/web/src/`, none matching `payment|mercadopago|auth|session|migrations|supabase/`, no `package*.json`/lockfile/`.github`/`app.json`/`eas.json`; <= 5 files and <= 80 changed lines; `CONFIDENCE: high`; rate limit (< 3 autofix merges and no autofix revert in 24 h); then `PUT pulls/{n}/merge` squash **sha-pinned**. Post-merge: `/api/health/deep` `ok:true` + `version == merge short sha` (15 min), `/api/auth/session` and `/api/telemetry/config` 200; on failure a revert PR (merged when green), a `needs-human` incident issue and a Grafana annotation (when `GRAFANA_ANNOTATION_TOKEN` + `GRAFANA_URL` secrets exist). Always ends with an outcome comment (merged / left for human / reverted).

**`.github/workflows` push:** accepted by the proxy/GitHub, so no `docs/observability/claude-autofix.proposed.yml` fallback was needed. Nothing has to be pasted by hand.

**Tests:** `autofix-gate.test.js` (82: every rule and boundary, injection-safe names, workflow invariants incl. "no `${{ }}` inside shell", "model job has no write token / PAT", required check names equal the `ci.yml` job names) and `autofix-deliver.test.js` (40: the **real** `preflight.sh` / `deliver.sh` / `outcome.sh` + real `gate.mjs` against a fake `gh`/`curl` and a real local git remote: issue-only, missing PAT, rejected push, every gate refusal, failed/pending/missing checks, rate limit, kill switch, head change, merge refusal, happy path where the PAT is used only for create-PR + merge, failed verification -> revert PR -> pinned merge -> issue -> annotation, revert that cannot apply, outcome comments, dedupe, hostile alertname). The harness caught one real bug before merge (the revert issue showed the *revert's* verification result instead of the original failure). Full web suite: 329 files / 2937 tests green locally and in CI.

## 3. Loop test
**3a. `workflow_dispatch` on `main` (`a2a5426`)**, inputs `alertname=ManualTest`, `summary="loop test - no code change expected"`, `allow_merge=false`: [run 37226938504](https://github.com/augustotraversa98-dot/PawPi/actions/runs/37226938504).
- `preflight` success (kill switch off, no duplicate, labels ensured) -> `investigate` success (9.5 min; the Claude credential works; no patch) -> `deliver` success -> outcome step success.
- **Outcome: a `needs-human` issue, not a PR and not a merge:** [#613 "Grafana alert (no auto-fix): ManualTest"](https://github.com/augustotraversa98-dot/PawPi/issues/613), labels `autofix` + `needs-human`, created by `github-actions[bot]`, carrying Claude's incident report (correctly identified it as the seeded self-test, made no change, final line `CONFIDENCE: low`) and one outcome comment "left for a human: diagnosis only: no code change was proposed". No autofix PR exists (open PRs are only the older #608 and #187). Nothing was merged or deployed by the run; production version stayed on the previous merge until the next PR.
- Side findings: the investigation works end to end on GitHub, so a Claude credential secret exists. `AUTOFIX_PAT` was not exercised (no code change), so its existence is still unverified. #613 can be closed as "not planned" (OPERATIONS.md says test issues can be).

**3b. Synthetic Grafana-shaped POST to `/api/internal/grafana-alert`: SKIPPED.** `ALERT_WEBHOOK_SECRET` is not available in this environment (not fetched from Railway). Recorded instead: a `POST` without credentials returns `401 {"error":"unauthorized"}`, so the route is live and refuses unauthenticated callers.

## 4. Docs (#612)
`docs/observability/OPERATIONS.md` section 17 "Automatic fix loop": flow, the 9-rule gate (each tied to its enforcing function), post-merge verification and auto-revert, kill switch and every way to disable it, pause-state-as-code, **what a human must review**, secrets/variables (names only), how to test safely. Intro, 6.2, 7, 8, 9, 16 brought in line.

## Decisions made
- **`isPaused:false` as explicit resume** (task 1 could not be expressed as code otherwise). The script still never pauses; to retire a resumed rule: set the file back to `true` **and** pause it in the UI.
- **Two trust zones.** Claude runs with `contents: read` and no PAT; delivery runs no model and executes the gate from a trusted copy, because a prompt-injected model (it reads production logs) must not be able to rewrite its own gate or reach the PAT. `AUTOFIX_PAT` is a step-level env of the single delivery step.
- **Manual runs never merge** unless `allow_merge=true`, so the task 3 test cannot ship code (extra restriction beyond the brief).
- **Stricter than the brief:** deleted/renamed/binary/mode-only files are never auto-merged; a merged autofix *revert* pauses auto-merge for 24 h; the kill switch is re-read right before merging (best effort); head sha unchanged check before merging.
- **REST (`gh api`) everywhere** in the workflow scripts instead of `gh pr/issue` subcommands (those use GraphQL and misbehave with `GITHUB_TOKEN`); the PAT is used only for push, PR creation and merge.
- **A re-fire** of an alert whose diagnosis issue is open comments on that issue instead of opening another (P1 repeat interval is 4 h).
- **Dedupe key** = branch `autofix/<slug>-<runId>` parsed exactly (no prefix collisions); label `autofix` required.
- **Draft-then-ready:** PRs were opened as drafts (session rule) and marked ready only at merge time, after green CI.
- **Branch reuse:** one working branch (`claude/exciting-faraday-c2x13t`) restarted from `origin/main` after each merge; the stale remote tip was always exactly the previous squash-merged commit, replaced with `--force-with-lease` against that sha.
- `docs/observability/claude-autofix.yml` (older design copy) differs from the live workflow; it is left as is (historical). The live file is `.github/workflows/claude-autofix.yml`.

## Skipped (needs human)
- **Synthetic Grafana-shaped POST to `/api/internal/grafana-alert`:** skipped, `ALERT_WEBHOOK_SECRET` is not available in this environment (I did not pull it from Railway). Only the unauthenticated case was checked: `POST` without the secret -> `401 {"error":"unauthorized"}`. To test end to end, run the same POST yourself with the Bearer secret and a payload whose `alertname` is `ManualTest`.
- **A live PR -> gate -> merge -> verify -> revert pass was not exercised on GitHub** (it would deploy code to production). That path is covered by the behavioural harness only. Suggested supervised test: dispatch with `allow_merge=true` and a trivial instruction; watch one full cycle once, with `AUTOFIX_ENABLED` ready to flip.
- Nothing in this run needed `AUTOFIX_PAT` live (the test ends in an issue). **Whether the secret exists was not verified** (secrets are not readable): if it is missing the loop opens a `needs-human` issue saying so (with the patch attached), never a PR.
- Synthetic Monitoring apply and `pawpi-digest` (unchanged from run 2: no `GRAFANA_SM_*` / `ALERT_DIGEST_EMAIL`).
- Deleting merged branches (the run's token cannot delete refs).

## Found bugs
- (low) `gh` CLI in this sandbox has an invalid `GH_TOKEN`; the GitHub MCP tools were used instead. Not a repo bug.
- (info) `docs/observability/claude-autofix.yml` is a stale design copy of the workflow (see Decisions).
- (cosmetic, not fixed) The outcome comment joins the detail and the next sentence without a period ("...no code change was proposed The `needs-human` label is set"), `scripts/autofix/outcome.sh`. Not worth a deploy-triggering PR tonight.
- (info) The `claude -p ... --permission-mode acceptEdits --allowedTools ...` flags were kept from the original workflow and worked in the live test run.

## Secrets / variables the workflow still needs (names only)
| Where | Name | Status |
|---|---|---|
| GitHub secret | `AUTOFIX_PAT` | **Required for any PR/merge.** Existence not verifiable from here. Fine-grained: Contents + Pull requests + Issues read/write. |
| GitHub secret | `CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY` | Needed for the investigation. **Works** (the test run investigated successfully). |
| GitHub secret (optional) | `GRAFANA_URL`, `GRAFANA_TOKEN` | Claude can query Grafana while investigating. |
| GitHub secret (optional) | `GRAFANA_ANNOTATION_TOKEN` (+ `GRAFANA_URL`) | Annotation when a merge is reverted. |
| GitHub variable | `AUTOFIX_ENABLED` | Not set = loop on. `false` = kill switch. |
| Railway | `ALERT_WEBHOOK_SECRET`, `GITHUB_DISPATCH_TOKEN` | Relay (already live per OPERATIONS.md). |

## Morning checklist
1. **Decide whether you want the loop live.** The four server rules are active and the loop can now merge small fixes by itself. Kill switch: GitHub -> Settings -> Secrets and variables -> Actions -> **Variables** -> `AUTOFIX_ENABLED` = `false`. (OPERATIONS.md section 17.4.)
2. Check the repo secrets listed above exist, especially `AUTOFIX_PAT` (fine-grained, not expired) and a Claude credential.
3. Look at issue [#613](https://github.com/augustotraversa98-dot/PawPi/issues/613) (the loop test result). Close it, and the old `ManualTest` / `TestAlert` issues, as "not planned" if you like.
4. Watch the first real alert end to end. Filter by label `autofix`; `needs-human` = a person must act; any `🚨 Autofix reverted` issue = urgent.
5. Next morning after any automatic merge: review it (`label:autofix is:merged`), it was merged without a person.
6. Optional: run one supervised full cycle with `allow_merge=true` (see Skipped).
7. Run-2 items still open: Grafana IRM push on `Augusto`, `ALERT_DIGEST_EMAIL` + digest policies, `GRAFANA_SM_*` synthetics, build 25 + #608 + App Store privacy, resume the other rules per OPERATIONS.md section 8 (as code now: set `isPaused:false` in a PR).
8. Delete merged branches on GitHub.
