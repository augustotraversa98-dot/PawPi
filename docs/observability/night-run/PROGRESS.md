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

- Step B (server) decisions (branch `obs/B-telemetry`):
  - Registry = `src/lib/telemetry/registry.js`: plain data, no imports, so the mobile agent copies it BYTE-FOR-BYTE to `anything/apps/mobile/src/telemetry/registry.js` (a web test fails if both exist and differ; another test fails if `SCREENS` misses any file under mobile `src/app`). New names (FORMS, form step/route/error-code patterns, `duration_s` bucket labels, nav redirect reasons, envelope patterns, limits) were added to `01-TELEMETRY-CONTRACT.md`.
  - Screens = route templates; groups `(x)` dropped, trailing `index` collapses, `[id]` -> `:id`; `_layout.*`, `*.test.*`, `AUTH_FLOW.md` and `(tabs)/tabsConfig.js` (a helper, not a screen) excluded; `+not-found.tsx` included as `/+not-found`; bounded fallback value `unknown`.
  - Tap targets are a closed SEED list (unknown target => event dropped); the `^[a-z][a-z0-9_]{0,39}$` pattern is for registry keys (the client normalises testID/accessibilityLabel keys to it). Growing the list is a registry edit that must be mirrored to mobile.
  - Result semantics for `pawpi_telemetry_ingest_total`: `dropped` = well-formed but not allowlisted (unknown event/prop key/screen/target/step), `invalid` = malformed, bad value type, missing required prop or PII-looking prop key (checked before the event name, so even unknown events with such keys count invalid); envelope-level failures count 1 `invalid` per request; `rate_limited` per request; kill switch counts 1 `dropped` per request.
  - Status codes: 204 on success (even if every event was dropped), 400 bad JSON/envelope, 413 > 32 KB (declared length checked before parsing, actual bytes counted while streaming and the stream is cancelled at the limit), 429 limited. The whole handler is in try/catch: an internal bug returns 204, never 5xx.
  - Rate limits (in memory, per instance, bounded maps of 10k keys with sweep-then-evict-oldest): 30 requests/min per install_id, 300/min per IP (a NAT can hold many installs). IP = first `x-forwarded-for` hop (same convention as `rateLimit.js`), salted-hashed per process and only ever a limiter key; the per-IP check runs BEFORE the body is parsed. A request with no derivable IP is not IP-limited. Accepted risk: a flood of fake keys evicts real ones (fail open) and both identifiers are spoofable; the 32 KB body cap + cheap validation bound the cost.
  - Client durations arrive as buckets; histograms record the geometric mean of the bucket edges (top bucket 15 s) with explicit boundaries `[0.1,0.3,1,3,10]`, so quantiles are bucket-resolution only.
  - `app_version` label: strict pattern, max 20 distinct values per process then `other` (a hostile client can fill the slots; a genuinely new release then reads `other` until restart). The Loki label uses the same bounded value; the log line keeps the validated raw version.
  - Loki: stream labels exactly `job, event, app_version, platform` (client forwarder builds them; the generic shipper also refuses labels that are not `[A-Za-z0-9_.:/-]{1,64}`); timestamps are server receive time (the client `t` is in the line); a failed batch is dropped (no retry) to keep memory bounded; queue cap 2000, batch 100 / 5 s, 5 s timeout enforced with a race so a fetch that ignores abort cannot wedge it.
  - Both routes are on the `rls-rollout-completeness.test.js` ALLOWLIST with justification (no DB, no `utils/sql` import); the guard itself is unchanged.
  - No env vars to set for the endpoints to work; `TELEMETRY_INGEST_ENABLED`, `TELEMETRY_SAMPLE_RATE`, `GRAFANA_LOKI_*` are optional. Privacy doc + policy paragraphs + App Store answers are drafts in `docs/privacy/telemetry.md` (HUMAN actions; no live policy/legal file touched). `docs/app-store-privacy-data-map.md` (says "no Diagnostics/Usage") is intentionally NOT edited until build 25 ships.
  - Note for the mobile half: do not attach the session Bearer token to telemetry requests (every authenticated `/api/*` request triggers the token-revocation DB lookup in `__create/index.ts`, and telemetry is anonymous by design).

## Found bugs
- (low) Unknown `/api/...` paths are answered by the React Router SPA catch-all with **HTTP 200 + HTML** instead of a JSON 404 (seen on the production build: `GET /api/nope/12345` -> 200). API clients/monitors can't tell a wrong URL from success; it also makes the HTTP metrics see these as 2xx (they are bucketed by the capped fallback normalizer, never by raw path). Evidence: local `node build/server/index.js`, `curl -i /api/nope/12345`. Not fixed (out of scope for an observability PR). Same root cause as the Step A pre-run baseline note for `/api/health/deep`.
- (low, unverified) `anything/apps/mobile/src/app/(tabs)/tabsConfig.js` is a non-route helper living inside the expo-router `app/` directory, so expo-router may treat it as a route file (missing default export warning). Excluded from the telemetry screen list. Not touched (mobile is out of scope for this half).

## Skipped (needs human)
- Branch deletion: the proxy rejects both `DELETE /git/refs/heads/*` (403) and `git push --delete` for this run, so merged branches (`obs/A-server-metrics`, ...) are left on origin. Delete them manually.

## Morning checklist
(filled in at the end)
