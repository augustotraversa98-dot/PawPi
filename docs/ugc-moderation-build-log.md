# UGC Moderation Build Log (App Store Guideline 1.2)

Per-ticket record of the autonomous build of `docs/phase-ugc-moderation-plan.md` (T1–T7).
Build order: **T1 → T2 → T3 → T4**, then **T5, T6, T7**. Merge gate = green CI (mobile jest +
web vitest + web integration). Device tests deferred to Augusto's return (collected per ticket).

Baselines at start (post-#227, live DB at 0064): **mobile 1101 · web unit 1203 · integration 592.**
(Local web-unit shows 1210 because the uncommitted demo-seed `scripts/**` glob in `vitest.config.ts`
is present in the working tree; CI uses the committed config → 1203. That change is unrelated to this
phase and is deliberately NOT included in any UGC PR.)

---

## T1 — Migration 0065: moderation primitives (DB only)

- **Built:** `supabase/migrations/0065_ugc_moderation.sql` — the single schema change for the whole
  1.2 phase.
  - `content_reports` (polymorphic report ledger; reporter reads/writes only own; FORCE RLS;
    status changes via DEFINER only).
  - `user_blocks` (real user→user block, distinct from `pet_friendships.status='blocked'`;
    blocker reads/writes/soft-deletes own; partial-unique live pair; FORCE RLS).
  - `hidden_at timestamptz` (additive) on 11 peer-UGC content tables (posts, post_barks,
    forum_threads, forum_comments, messages, dm_messages, provider_reviews, adoptable_listings,
    events, social_walks, lost_reports) = "removed by us" (distinct from author `deleted_at`).
  - `banned_at timestamptz` (additive) on `user_profiles`.
  - DEFINER helpers (pinned search_path, EXECUTE→pawpi_app): `app_is_admin`,
    `app_user_is_blocked`, `app_moderate_hide`, `app_moderate_unhide`, `app_ban_user`.
  - Additive widen of `notifications_type_check` for `'report_received'`.
- **Files:** `supabase/migrations/0065_ugc_moderation.sql`,
  `anything/apps/web/test/integration/ugc-moderation.integration.test.ts` (21 tests),
  `supabase/verify_0065.sql` (11 PASS-row checks for the SQL editor).
- **Completeness guard:** the two new tables auto-classify (FORCE-RLS + policies) — no allowlist
  edit needed; `rls-gap-closure.integration.test.ts` still green.
- **Migration status:** harness-proven (65 migrations apply clean on embedded-postgres).
  **PENDING hand-apply to live Supabase** — the DB is unreachable from the build environment
  (`ECONNREFUSED`) and `DATABASE_URL` connects as the non-DDL `pawpi_app` role, so DDL must be run
  by Augusto in the Supabase SQL editor (same hand-apply pattern as every prior migration; "Tats
  ran it"). `supabase/verify_0065.sql` is ready — every row should read PASS.
- **Decision:** target_type `provider_message` maps to the provider-chat `messages` table and
  `dm_message` to owner↔owner `dm_messages`. `pet_profile`/`user_profile` report target_types are
  accepted by the ledger but NOT hideable via `app_moderate_hide` (no content row to hide) — abusive
  users are handled via `app_ban_user`; the hide helper raises on unsupported types. Smallest option
  consistent with the plan.
- **Decision:** skipped the optional `terms_accepted_at` audit column (Deferred list — acceptance is
  client-side in T5; not required for review).
- **Local suite:** mobile 1101 ✓ · web unit 1210 ✓ (1203 on CI) · integration **613** ✓ (592 + 21).
- **CI result:** ✅ all 3 green (mobile jest / web vitest / web integration).
- **Merge status:** ✅ squash-merged to main — **PR #228, commit `a382077`**, branch deleted.
- **Device tests needed:** none (pure DB). Augusto must hand-apply 0065 + run `verify_0065.sql`.

---

## T2 — Report / Block / admin-action APIs (backend, no UI)

- **Built:** thin routes over the 0065 tables/helpers (RLS pins reporter/blocker = caller; admin
  paths go through SECURITY DEFINER helpers).
  - `POST /api/reports` (file; idempotent per open (reporter,target)) · `GET /api/reports` (own).
  - `POST /api/blocks` (block; idempotent live pair) · `GET /api/blocks` (own live list) ·
    `DELETE /api/blocks/[id]` (unblock = soft-delete).
  - `GET /api/admin/reports?status=` (queue) · `POST /api/admin/reports/[id]/action`
    `{action:'hide'|'remove'|'dismiss', ban?}`.
- **DB decision (logged):** the admin queue runs under `pawpi_app` + FORCE RLS, where
  `content_reports`' reporter-own SELECT hides other users' reports and there is no UPDATE policy —
  so an admin literally cannot read the queue or change status directly. T1 shipped no admin
  read/dismiss helper. Smallest correct fix: **extend the single phase migration `0065`** (still
  the only schema change; not yet live-applied; `CREATE OR REPLACE` keeps it idempotent) with two
  admin DEFINER helpers — `app_admin_list_reports(status)` and
  `app_admin_action_report(report_id, action, ban)` (the latter resolves the content author for the
  ban). Updated `supabase/verify_0065.sql` (fn count 5→7). **0065 should be (re)applied in its final
  form after T2 merges** — idempotent, so re-applying over a T1-only 0065 is safe.
- **Files:** `src/app/api/reports/route.js` (+ test), `src/app/api/blocks/route.js` (+ test),
  `src/app/api/blocks/[id]/route.js` (+ test), `src/app/api/admin/reports/route.js` (+ test),
  `src/app/api/admin/reports/[id]/action/route.js` (+ test); `supabase/migrations/0065_ugc_moderation.sql`
  (+2 helpers), `supabase/verify_0065.sql`; extended `test/integration/ugc-moderation.integration.test.ts`
  (+5 admin-helper cases, proven as pawpi_app).
- **Tests:** +27 vitest route tests, +5 integration. All routes wrapped in `withRequestContext`
  (route-wrap completeness guard green).
- **Migration status:** 0065 extended — still PENDING hand-apply (now 7 DEFINER fns; `verify_0065.sql`).
- **Local suite:** mobile 1101 ✓ · web unit 1237 ✓ (1230 on CI) · integration 613 → **618** ✓.
- **CI result:** ✅ all 3 green.
- **Merge status:** ✅ squash-merged to main — **PR #229, commit `64c22ec`**, branch deleted.
- **Device tests needed:** none (curl-provable). Surfaces it powers get device tests in T4.

---

## T3 — Enforcement in read paths (hidden + blocked filtering)

- **Built:** the read-path enforcement that makes hide + block actually do something. Two primitives
  (shared `src/app/api/utils/moderation.js`):
  - **hidden_at IS NULL** — every list/detail read drops content "removed by us".
  - **block exclusion** — feed/discovery/thread/review reads exclude content authored by a user in an
    either-direction `user_blocks` relation with the caller, via the `app_user_is_blocked` DEFINER
    helper. Wrapped routes carry `current_app_user_id()`, so no id threading.
  - **interaction 403** — `isBlockedBetween()` gates the write chokepoints: bark, forum reply, and DM
    send to a blocking/blocked user → 403.
- **Surfaces edited (read):** feed `posts/route.js` (both queries), `posts/[id]/barks` (GET),
  `forum/threads` (list), `forum/threads/[id]` (detail thread 404 + comments), `providers/[id]/reviews`,
  `social-walks` (3 discovery variants), `events`, `lost-reports` (public list), `search` (pets +
  owners; banned excluded), `pets/[id]/profile` (banned/blocked owner → 404; hidden moments dropped),
  `dm-threads/[id]/messages` (GET hidden) + `threads/[id]/messages` (GET hidden, provider chat).
- **Surfaces edited (write 403):** `posts/[id]/barks` POST, `forum/threads/[id]/comments` POST,
  `dm-threads/[id]/messages` POST.
- **Decision (logged):** provider chat (`threads/[id]/messages`, owner↔business) gets the `hidden_at`
  filter only — the counterparty is a business entity, not a peer user, so user-block enforcement
  doesn't apply there. The owner↔owner DM path (`dm-threads`) gets the full block 403.
- **DB changes:** none (uses 0065).
- **Files:** `utils/moderation.js` (new) + 12 edited route files; updated 4 existing route unit tests
  whose mock sequences shifted (dm-threads, barks, pets/profile, search); new
  `test/integration/ugc-enforcement.integration.test.ts` (8 cases) that runs the REAL feed/barks/
  forum/dm handlers AS pawpi_app + FORCE RLS (the #108 pattern) and proves hidden + symmetric block
  filtering + interaction 403.
- **Tests:** +8 integration (real handlers), +2 unit. Suite: mobile 1101 ✓ · web unit 1237 → **1239** ✓
  (1232 on CI) · integration 618 → **626** ✓.
- **CI result:** ✅ all 3 green.
- **Merge status:** ✅ squash-merged to main — **PR #230, commit `1bce205`**, branch deleted.
- **Device tests needed (T3):** with a 2nd test account — block them, confirm their feed/forum/DM/walk
  content disappears from your views (and yours from theirs); confirm you can't DM/bark/reply to each
  other; have an admin hide a post and confirm it vanishes + 404s.

---

## T4 — Report + Block UI actions (mobile)

- **Built:** one shared `<ModerationMenu>` overflow ("···") + the moderation action layer, dropped
  into every UGC surface. Opens a sheet → **Report** (reason picker → POST /api/reports, idempotent) and
  **Block user** (confirm → POST /api/blocks). Own content renders nothing (the surface keeps its Delete).
- **Files (new):** `src/components/moderation/ModerationMenu.jsx` (+ test, 5 cases),
  `src/hooks/useModeration.js` (plain `reportContent` / `blockUser` — NOT react-query hooks, so the menu
  needs no QueryClientProvider in a surface's tree; block invalidates the social caches via the shared
  `queryClient` singleton), `__mocks__/@react-native-async-storage/async-storage.js` (auto-applied jest
  mock so any tree pulling AsyncStorage renders in tests).
- **Surfaces wired (9):** feed post detail (`PostDetailModal`, Report/Block — own shows Delete) + bark
  (`BarkModal`, Report), forum thread + comment (`forum-thread`, Report/Block author), DM header
  (`chat`, Block → leaves the thread), pet profile (`pet-profile`, Report profile / Block owner — hidden
  on your own pet), provider review (`service/provider`, Report), adoption listing (`service/adoption`,
  Report), event (`events`, Report/Block host — hidden on your own), nearby walk (`nearby-walks`, Report).
- **Decision (logged):** the menu uses plain async functions + the `queryClient` singleton rather than
  `useMutation`, because dropping a react-query hook into screens whose jest tests don't wrap a
  `QueryClientProvider` broke 6 suites. Plain functions keep the component provider-free → every existing
  screen test stays green untouched. Surfaces where the viewer's `user_profiles.id` isn't cheaply
  available (forum, bark, review, walk) omit the `isOwn` short-circuit — self-block is still refused
  server-side (400) and self-report is an idempotent no-op, so the only cost is the option showing on
  your own content there (device-polish follow-up).
- **DB changes:** none.
- **Tests:** +5 jest (ModerationMenu). Suite: **mobile 1101 → 1106** ✓ · web unit 1239 ✓ (unchanged) ·
  integration 626 ✓ (unchanged — no web/SQL touched).
- **CI result:** ✅ all 3 green.
- **Merge status:** ✅ squash-merged to main — **PR #231, commit `33525fa`**, branch deleted.
- **Device tests needed (T4) — DEVICE PASS REQUIRED:** walk each of the 9 surfaces with a 2nd account →
  Report (pick a reason) shows the success toast; Block shows the confirm → on success the user's content
  is gone on next fetch (relies on T3); your own post still shows Delete (not Report). Verify the sheet
  dismisses cleanly (tap-outside + Android back).

---

## T5 — EULA acceptance gate + zero-tolerance Terms

- **Built:** a required, unchecked-by-default Terms/Privacy acceptance checkbox on BOTH account-creation
  entry points, plus a zero-tolerance clause in the Terms.
  - **Web signup** (`account/signup/page.jsx`): a required checkbox — *"I agree to the Terms of Service
    and Privacy Policy … including PawPi's zero-tolerance policy"* with live links (env URLs, degrade to
    plain text until set) — that disables **Create account** until checked (and a submit-time guard).
  - **Mobile welcome** (`welcome.jsx`): the same required checkbox gates the **Create account** button
    (alerts + refuses to open signup until checked); replaced the old passive "By continuing…" footer.
  - **Terms** (`docs/legal/terms-of-service.md` §5): a "Zero-tolerance for objectionable content and
    abusive users" section — defines objectionable content, the in-app Report/Block tools, **24-hour**
    review/removal, **account ejection** for abusers, and the submission content filter.
- **DB changes:** none (skipped the optional `terms_accepted_at` audit column — Deferred list).
- **Decision (logged):** the EULA gate lives on the two account-creation surfaces (web signup rendered
  in the mobile WebView + the Expo `welcome` entry). `onboarding.jsx` is the post-account pet-setup flow,
  not an account-creation path, so it needs no separate gate.
- **Files:** `account/signup/page.jsx` (+ test, 4 cases), `src/constants/legal.js` (web, new),
  `welcome.jsx` (+ test, 2 cases), `docs/legal/terms-of-service.md`.
- **Tests:** +4 web vitest, +2 mobile jest. Suite: **mobile 1106 → 1108** ✓ · **web unit 1239 → 1243** ✓
  (1236 on CI) · integration 626 ✓ (unchanged).
- **CI result:** ✅ all 3 green.
- **Merge status:** ✅ squash-merged to main — **PR #232, commit `47b9233`**, branch deleted.
- **Device tests needed (T5):** web signup — Create account stays disabled until the box is checked;
  device — the welcome Create-account flow refuses until the box is checked; the Terms/Privacy links open
  once the URLs are set (T6).

---

## T6 — Contact info wiring + hosted legal URLs

- **Built:** made the dead "Help Center" / "Contact Us" rows real and added the support-contact config.
  - `SettingRow` gained an optional `onPress` → renders a tappable `TouchableOpacity` (else a plain View).
  - **Contact Us** → `mailto:${SUPPORT_EMAIL}` (always works; `SUPPORT_EMAIL` has a default).
  - **Help Center** → `HELP_CENTER_URL` when set, else falls back to the support email.
  - `constants/legal.js` += `SUPPORT_EMAIL` (`EXPO_PUBLIC_SUPPORT_EMAIL`, default `support@pawpi.app`)
    and `HELP_CENTER_URL` (`EXPO_PUBLIC_HELP_URL`, optional).
- **DB changes:** none.
- **Files:** `app/(tabs)/more/settings.jsx` (+ 2 test cases), `src/constants/legal.js`.
- **Tests:** +2 mobile jest. Suite: **mobile 1108 → 1110** ✓ · web unchanged (unit 1243 / integration 626).
- **CI result:** _pending push_
- **Merge status:** _pending_
- **⚠️ Go-live env / hosting (Augusto — the code is ready, these are the manual publish steps):**
  - Host `docs/legal/terms-of-service.md` + `docs/legal/privacy-policy.md` at stable public URLs.
  - Set `EXPO_PUBLIC_TERMS_URL`, `EXPO_PUBLIC_PRIVACY_POLICY_URL` (mobile) and
    `NEXT_PUBLIC_TERMS_URL`, `NEXT_PUBLIC_PRIVACY_POLICY_URL` (web) to those URLs so the T5 signup
    links resolve. Optionally set `EXPO_PUBLIC_SUPPORT_EMAIL` + `EXPO_PUBLIC_HELP_URL`.
  - Make App Store Connect "Support URL"/contact match `EXPO_PUBLIC_SUPPORT_EMAIL`.
- **CI result:** ✅ all 3 green.
- **Merge status:** ✅ squash-merged to main — **PR #233, commit `ad92794`**, branch deleted.
- **Device tests needed (T6):** tap Contact Us → mail composer opens to the support address; tap Help
  Center → opens the hosted help page (or mail) once `EXPO_PUBLIC_HELP_URL` is set.

---

## T7 — Text content filter on submit

- **Built:** a shared server-side `moderateText` filter applied at every UGC write chokepoint — Apple's
  "method to filter objectionable content." On a match the route rejects with **422** (no image
  moderation in v1).
  - `api/utils/moderateText.js`: normalizes text (lowercase, strip diacritics, fold leetspeak) then
    tests each banned term with a regex tolerant of letter-repetition + 0–2 separators between letters
    (catches `f u c k`, `f.u.c.k`, `fuuuck`, `sh1t`, `f@ggot`) AND requiring letter boundaries on both
    ends (so `Scunthorpe` / `assignment` / `shiitake` pass — no Scunthorpe problem). Exposes
    `moderateText(...fields)` + a `moderationResponse(...fields)` route helper (returns the 422 or null).
- **Write routes guarded (13):** posts (caption), barks (text), forum threads (title+body), forum
  comments (body), dm messages (body), provider messages (body), provider reviews (body), events
  (title+description+location), social-walks (name+notes+area), lost-reports (notes+area), pets
  (name+breed+bio), user-profile (name+username), adoptable-listings (name+breed+story).
- **Decision (logged):** chose **reject (422)** over auto-`hidden_at`+report for v1 simplicity (the plan's
  pick). The word-list is intentionally minimal/extensible — the launch bar, not an exhaustive list.
  `moderateText` is a pure function (no SQL), so it added zero risk to existing route-test mock sequences.
- **DB changes:** none.
- **Files:** `api/utils/moderateText.js` (+ test, 12 cases) + 13 edited write routes; +3 route 422 tests
  (barks, forum threads, dm messages).
- **Tests:** +12 unit, +3 route. Suite: mobile 1110 ✓ (unchanged) · **web unit 1243 → 1258** ✓
  (1251 on CI) · integration 626 ✓ (unchanged — benign seed text passes the filter).
- **CI result:** _pending push_
- **Merge status:** _pending_
- **Device tests needed (T7):** post known-bad text on one surface (e.g. a feed caption or forum thread)
  → confirm the rejection copy ("Your text contains language that isn't allowed…"); clean text posts
  normally.

---
