# Night run 2 — PROGRESS-2

Run date: 2026-10-04 (unattended). Follows `02-RUNBOOK-NIGHT-RUN.md` + `03-UNATTENDED-DEFAULTS.md`. Previous run: `PROGRESS.md`.
Merge rule used: squash-merge only when `mobile (jest)`, `web (vitest)`, `web (integration / real Postgres)` were all `success` on the PR head sha (sha pinned in the merge call), then production verification. Nothing was reverted; no check was skipped or weakened.

## Summary
| # | Task | PR | Merged | Production verified |
|---|---|---|---|---|
| 1 | Logout storage hygiene (`clearAccountStorage`) | [#605](https://github.com/augustotraversa98-dot/PawPi/pull/605) | yes, squash `5e9b4ce` | yes |
| 2 | JSON 404 for unknown `/api/*` | [#606](https://github.com/augustotraversa98-dot/PawPi/pull/606) | yes, squash `6a1f7ae` | yes (`/api/nope/12345` -> 404 `{"error":"not_found"}`) |
| 3 | Build 25 prep, `app.json` only | [#607](https://github.com/augustotraversa98-dot/PawPi/pull/607) | yes, squash `4656c9b` | yes |
| 4 | Privacy data map vs telemetry doc | [#608](https://github.com/augustotraversa98-dot/PawPi/pull/608) | **NO — DRAFT by instruction** | n/a (docs) |
| 5 | Grafana apply | no PR (live apply) | n/a | see below |
| – | This file | docs-only PR (this one) | see final report | docs-only |

Production checks after each merge (all passed first time): `/api/health/deep` -> `{ok:true, version == merged short sha}`; `social-enabled == {"google":true,"apple":true}`; `/api/auth/providers` lists google; `/account/signin` + `/account/signup` 200 with no "Coming soon"; `/api/auth/session` 200. Extra for #606: unknown API path 404 JSON, relay `POST /api/internal/grafana-alert` still 401 without auth.

## 1. Logout storage hygiene (#605)
`OwnerMenu.handleLogout`, business `Profile.doLogout` and `AppSettings.performDelete` no longer call `AsyncStorage.clear()`; they call `clearAccountStorage()` (`src/utils/accountStorage.js`): remove every key **except** a keep-list.
- **Kept:** `pawpi:locale`; `pawpi.notif*` (prefs, frequency-cap log, open-hours); `pawpi.dailyReturnReminderId`; `pawpi.telemetry.*` (opt-out, funnel markers).
- **Removed:** onboarding keys, `pet_profile`, `has_completed_onboarding`, `pawpi:selectedPetId`, `pawpi:activeProviderId`, `pawpi:reminderSnoozes`, `pawpi.streakSaveSent.*`, `pawpi.gettingStartedCelebrated`, and any unknown key.
- Tests: new `accountStorage.test.js`; logout assertions in `OwnerMenu`, business `profile` and `more/settings` tests (incl. "storage fails -> still signed out").

## 2. API 404 (#606)
`app.all('/api/*', apiNotFound)` registered after `app.route(API_BASENAME, api)` in `__create/index.ts`. Fixed body `{"error":"not_found"}`, nothing echoed. Telemetry label for these stays `unmatched`. Verified against a real production build locally and on production after deploy.

## 3. Build 25 prep (#607)
`app.json`: `version` 1.0.1 -> 1.0.2; removed `ios.buildNumber: "1"` (`eas.json` is `appVersionSource: remote` + production `autoIncrement`, so EAS owns it). `fileMapCacheDirectory` is **not in app.json**; it is set in `metro.config.js:180` and is a valid key in the installed Metro 0.83.1 (`hasteMapCacheDirectory` is the deprecated alias) -> no change. `eas.json`, `.easignore`, `metro.config.js`, `runtimeVersion` (still `1.0.0`) untouched.

## 4. Privacy docs (#608, DRAFT)
`docs/app-store-privacy-data-map.md` now declares Usage Data (Product Interaction) + Diagnostics (Crash, Performance, Other), **not linked to identity, not used for tracking**, matching `docs/privacy/telemetry.md` §6, and says not to change App Store Connect until build 25 is submitted. Left as draft for the owner to merge with build 25.

## 5. Grafana apply (stack `sinceretarantula3456`)
**5a. Dry runs (one section each, before any write)**
- dashboards: 11 create, 0 update, 0 unchanged (folder "PawPi" exists, uid `fhfd8q`; datasources resolved to `grafanacloud-…-prom` / `…-logs`).
- alerts: 15 create (10 P1 + 5 P2), all "will be created PAUSED".
- policies: 1 create (`pawpi-policy-p1` P1 -> `Augusto`, group by area+alertname, repeat 4h), **2 skipped** (`pawpi-digest` contact point and `pawpi-policy-p2`, because `ALERT_DIGEST_EMAIL` is not set). Existing tree: root + 0 child routes, preserved untouched.
- synthetics: 5 checks validated, section is a **no-op** (`GRAFANA_SM_URL`/`GRAFANA_SM_TOKEN` not set).

**5b. Applied**
- `--apply --sections dashboards`: 11 dashboards written (version 1), all `pawpi-*`.
- `--apply --sections alerts,policies`: 15 rules written, **all PAUSED** (verified through the provisioning API: 15 `isPaused:true`; the 3 legacy rules `HighServerErrorRate`, `HighLatencyP95`, `PaymentFailuresSpike` still active, untouched); policy route `pawpi-policy-p1` added.
- Synthetics: **skipped**, no SM credentials in the environment.

**5c. Re-run dry run** (`dashboards,alerts,policies,synthetics`): **0 create, 0 update, 27 unchanged, 2 skipped** (the two intentional digest skips). `--exit-code` run exits 0.

**5d. Read-only data checks (Grafana datasource proxy)**
- Prometheus: 14 `pawpi_*` series names present (`pawpi_http_requests_total`, `pawpi_http_request_duration_seconds_*`, `pawpi_db_*`, `pawpi_business_events_total`, `pawpi_health_deep_ok` = 1, `pawpi_process_*`, `pawpi_telemetry_ingest_total`). Server data is flowing. `pawpi_client_*` and `pawpi_funnel_*`: no series, as expected before build 25. `pawpi_telemetry_ingest_total` exists (my probe/garbage requests), no accepted client events.
- Histogram `le` renders as `"1"` (not `"1.0"`), so the dashboards' `le=~"1|1.0"` slow-share matcher works; other `le`: 0.005 … 10, +Inf.
- Loki: `{job="pawpi-web"}` has access-log lines (labels `job, level, area` + auto `service_name`, `detected_level`), e.g. `GET /api/auth/* -> 200`. `{job="pawpi-client"}`: empty, as expected.
- All 15 alert queries were run live against their datasource: every one executes without error. Server rules return no series (nothing breaching, guards hold) except `min(pawpi_health_deep_ok)` = 1.
- `grafanacloud_instance_active_series` **exists** on `grafanacloud-usage`; `P2-FreeTierUsage` currently evaluates to 11.71 (% of the 10k series free tier).

**5e. Safe-to-resume list (nothing was un-paused; do it per rule in the UI: Alerting -> Alert rules -> PawPi -> Resume evaluation)**
1. **Safe now — server rules** (data flowing, none breaching): `P1-ServerMetricsSilent`, `P1-Http5xxRate`, `P1-DbErrors`, `P1-HealthDeepFailing`.
   Caveat for `P1-HealthDeepFailing`: the gauge only updates when `/api/health/deep` is called; with no Synthetic Monitoring applied it only reflects calls from Railway/anyone. Resume it, but treat it as effective only after the synthetics are applied.
2. **Safe once there is real traffic (queries valid, volume guards keep idle quiet):** `P1-SigninFailureSpike`, `P1-PaymentsFailureSpike`, `P1-Route4xxBurst`. `P1-SignupCollapse` needs ~7 days of signup history (earliest sensible resume: 2026-10-11).
3. **Client rules only after build 25 has live data (a few days):** `P1-ClientCrashRate`, `P1-ClientApi5xxShare`, `P2-NavUnexpectedRedirect`, `P2-ActivationFunnelDrop`, and last `P2-TelemetrySilent`.
4. **P2 digest rules only after the digest contact point exists** (apply with `ALERT_DIGEST_EMAIL` set to create `pawpi-digest` + the P2 route): `P2-SlowRoutesP95`, `P2-FreeTierUsage` (metric verified above). Resuming any P2 rule earlier would route it to the default policy instead of the digest.

**5f. `GRAFANA_LOKI_URL` path:** no code change needed. `src/lib/telemetry/loki.js` already accepts the base URL with or without `/loki/api/v1/push` (appends it, strips trailing slashes), and Loki is already receiving `pawpi-web` lines in production, so the Railway env is correct.

## Decisions made
- One working branch reused sequentially (`claude/dreamy-meitner-i90pa5`, restarted from `origin/main` after each merge) per the session branch rules; the docs-only PROGRESS PR uses its own branch because #608 (draft) keeps the first one open.
- Kept `pawpi.notif*` (incl. the frequency-cap log and open-hours history) and `pawpi.dailyReturnReminderId`: they hold no identity, and dropping the reminder id would schedule a second daily OS notification on the next login. `streakSaveSent.*` and the "getting started celebrated" flag are treated as account data (removed).
- Default-deny (remove everything not on the keep-list) so a future account key is cleaned automatically; a future device preference must be added to `KEEP_KEYS`/`KEEP_PREFIXES` or it will be lost on sign-out.
- `clearAccountStorage` never throws (a storage error must not leave the user signed in).
- Left `metro.config.js` alone: the `fileMapCacheDirectory` check found a valid key (see §3).
- PRs 1-3 were opened non-draft because they were merged on green under the owner's authorisation; #608 is a draft.
- `ALERT_DIGEST_EMAIL` and SM credentials were not invented: the digest and synthetics were skipped (default "missing credential -> skip live apply, record it").
- The telemetry opt-out SecureStore mirror (from run 1) stays as defence in depth; its comment was updated.

## Skipped (needs human)
- Synthetic Monitoring apply (no `GRAFANA_SM_URL`/`GRAFANA_SM_TOKEN`).
- `pawpi-digest` contact point + `pawpi-policy-p2` (no `ALERT_DIGEST_EMAIL`).
- Un-pausing any rule; Grafana mobile push on `Augusto`; App Store Connect + live privacy policy (build 25).
- Deleting merged branches (the run's token cannot delete refs; includes `obs/*` from run 1 and this run's `claude/*` branches after #608/this PR are done).

## Found bugs
- (medium, privacy; not fixed) Sign-out / account deletion do not cancel the OS-scheduled local notifications (no `cancelAllScheduledNotificationsAsync` anywhere in the logout paths). Reminders of the previous account's pets can keep firing on the device after another account logs in. Evidence: grep of `src` finds no cancel-on-logout; only `cancelDailyReturnReminder` (permission revoked).
- (low; not fixed) A known `/api` path called with an unsupported method now reads `404 not_found` (it previously fell to the SPA). There is no 405 distinction.
- (low; not fixed) Synthetic Monitoring is not applied, so nothing calls `/api/health/deep` on a schedule that this repo controls; `pawpi_health_deep_ok` only moves when something hits the endpoint.
- (info) Local verification detail: mobile `npm ci` fails in the cloud sandbox because `react-native-calendars` is a `codeload.github.com` tarball dependency the proxy blocks (403). CI is unaffected.
- (info) In-memory zustand state (`selectedPetStore`, `activeProviderStore`) survives logout until the app restarts; React Query is cleared on `setAuth(null)` and a stale pet id is reconciled against the fetched pets, so no leak was found.

## Morning checklist
1. Look at the Grafana folder **PawPi**: 11 new dashboards (No data panels for client/funnel are expected until build 25).
2. Resume the server rules (5e.1), watch a day for flaps; then 5e.2 as traffic allows.
3. To finish Grafana: set `ALERT_DIGEST_EMAIL` and run `node scripts/observability/apply-grafana.mjs --apply --sections policies`; set `GRAFANA_SM_URL`/`GRAFANA_SM_TOKEN` and run `--apply --sections synthetics`. Dry-run first each time.
4. Add the Grafana IRM/OnCall (mobile push) integration to contact point `Augusto` (OPERATIONS.md §5.3).
5. Ship **build 25** (`app.json` is now 1.0.2; EAS assigns the build number). Then merge **#608** (privacy data map), set App Store Connect App Privacy per `docs/privacy/telemetry.md` §6, and publish the privacy-policy paragraph (EN + ES, §5).
6. After build 25 has live data for a few days: resume the client rules (5e.3).
7. Review "Found bugs"; the notification-cancel-on-logout one is the most valuable.
8. Delete the merged branches on GitHub.
