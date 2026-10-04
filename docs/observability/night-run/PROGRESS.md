# Observability night run — PROGRESS

Run date: 2026-10-04 (unattended). Runbook: `02-RUNBOOK-NIGHT-RUN.md`; decisions: `03-UNATTENDED-DEFAULTS.md`.

## Capability gate (Gate 0)
| Capability | Status |
|---|---|
| GitHub push / PR / merge (REST) | OK (admin/push on repo; `gh api` REST; GraphQL `gh pr *` not used) |
| CI (3 required checks) | OK — mobile (jest), web (vitest), web (integration / real Postgres) |
| Grafana write / Loki write / OTLP write / Synthetic Monitoring | NOT AVAILABLE in this environment (accepted by owner) → DEGRADED MODE: all code/tests/JSON/docs/PRs, live apply skipped |
| Production smoke endpoints reachable | OK |

## Decisions made
- Degraded mode (no Grafana/Loki credentials): ship code + tests + JSON + docs; live apply actions listed under "Skipped (needs human)".
- Merge gate enforced by the run (no branch protection): merge only when "mobile (jest)", "web (vitest)", "web (integration / real Postgres)" are all `success` on the PR head sha; squash-merge with `sha` pinned.
- Pre-run production baseline (2026-10-04): `/api/health/deep` returns **200 + SPA HTML** (React Router catch-all), not 404. So the Step A deploy signal is "returns JSON `{ok:true,version}`", not the status code.

## Steps
| Step | PR | Merged | Deployed + verified |
|---|---|---|---|
| A — server metrics | [#599](https://github.com/augustotraversa98-dot/PawPi/pull/599) | yes (squash `e448f8a`, all 3 required checks green on head `780b0ef`) | yes — `/api/health/deep` -> `{"ok":true,"db_ms":1220,"version":"e448f8a"}` after ~1.5 min; smoke (social-enabled, providers, signin/signup pages, session) all PASS |

- Step A decisions (branch `obs/A-server-metrics`):
  - `route` label = matched Hono template with ALL params normalised to `:id` (so matched and fallback routes share one vocabulary). Non-`/api` -> `/__page`; unmatched `/api` (404/405) -> `unmatched`; the digit/uuid/hex normalizer is only a fallback for a served-but-untemplated path, restricted to known top-level prefixes and capped at 100 distinct values (`overflow`) so a hostile path space can never mint unbounded series.
  - `method` bounded to the 7 standard verbs + `OTHER`; `status_class` `1xx..5xx` or `unknown`.
  - Legacy `http.server.request.duration` + `pawpi.payment.*` left byte-for-byte untouched (3 live alerts); new metrics are added beside them in the same middleware.
  - DB metrics hook = a patched own `then` on the very porsager Query object returned by the `sql` Proxy (apply trap + `sql.unsafe`), observer chain has its own rejection handler; metric code is try/catch'd. Queries on a raw `sql.begin(tx => ...)` handle and `pool` (health probe) are not counted. `with ...` CTEs are classified by whether they contain insert/update/delete.
  - Process gauges are OTel observable gauges started once from `__create/index.ts`; event-loop lag = p99 since previous export (reset each read), so a stall shows as a spike. Added `pawpi_process_*` names to the contract.
  - No `unit` set on `pawpi_health_deep_ok`/counters (a unit of "1" makes the OTLP->Prometheus translator append `_ratio`).
  - `/api/health/deep` uses the global `pool` directly through `lib/telemetry/healthDeep.js` (NOT `withRequestContext`: a request tx would resolve identity and turn a DB outage into a generic 500). Because the route therefore needs no wrapper, it was added to the documented `ALLOWLIST` in `rls-rollout-completeness.test.js` (the guard's "no `utils/sql` import in the route file" rule still holds). Not allowed to run any table query, so it cannot be affected by RLS.
  - Business counters only record `ok` for creation events (failures are visible as 5xx by `area`); `fail` exists for signin/signup. Google sign-in is observed via a pass-through wrapper on the auth adapter (`getUserByAccount` hit = returning user, `createUser`+`linkAccount` = signup+signin, `linkAccount` alone = first link); a denied/failed Google attempt never reaches the adapter, so Google has no `fail`. Apple-native: `authorize` ok/fail = `signin`, plus `signup` ok when it creates the user. Credentials sign-in `fail` = any `authorize` returning null/throwing (bad password, unknown email, missing fields).
  - `health_log_created` is recorded on every `/api/health/*` POST that creates a log/record (food, general-checks, medical-care, medications, pee, photo-checks, poo, preventive-treatments, vomit, weight, wellness); `walk_logged` = `/api/health/walk-logs`. `booking_created` = provider book + owner vet-appointments; `order_created` = payments/checkout + pets/:id/shop-checkout (not the subscription-runner, walk-package or daycare order inserts).
  - No migrations, no `.github` change, no app version/eas change.

## Found bugs
- (low) Unknown `/api/...` paths are answered by the React Router SPA catch-all with **HTTP 200 + HTML** instead of a JSON 404 (seen on the production build: `GET /api/nope/12345` -> 200). API clients/monitors can't tell a wrong URL from success; it also makes the HTTP metrics see these as 2xx (they are bucketed by the capped fallback normalizer, never by raw path). Evidence: local `node build/server/index.js`, `curl -i /api/nope/12345`. Not fixed (out of scope for an observability PR). Same root cause as the Step A pre-run baseline note for `/api/health/deep`.

## Skipped (needs human)
- Branch deletion: the proxy rejects both `DELETE /git/refs/heads/*` (403) and `git push --delete` for this run, so merged branches (`obs/A-server-metrics`, ...) are left on origin. Delete them manually.

## Morning checklist
(filled in at the end)
