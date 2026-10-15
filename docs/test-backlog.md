# PawPi — Device-test backlog (your queue, test on your own time)

**How this works.** Claude Code develops continuously and merges whenever CI is green — but CI can't
test real-phone behavior (navigation feel, push notifications, camera, layout on a device). Every time
something ships that needs a human check, an entry lands here. **You test when you have time, then tell
Claude Code or Cowork:**
- *"X passed"* → the entry moves to **Passed** below (or is deleted).
- *"X is wrong: <what you saw>"* → it becomes a fix ticket and gets reworked.

Merged + CI-green ≠ device-verified. This list is the gap between the two.

---

## ⚙️ ACTION 1 — Apply Phase 2 migrations to Supabase (in order, after the merges)

These were built + proven in the test harness but, per Cowork's rule, NOT applied to live Supabase.
Hand-apply in numeric order, then the live app gets all the new features. (Same harness-only pattern
as the RLS migrations 0019–0026.)

```
0027_provider_capabilities.sql        (2.1 — one business, many services)
0028_rls_provider_reviews_surfacing.sql (2.2 — reviews/ratings)
0029_payments_foundation.sql          (2.3 — money tables)
0030_generalized_booking.sql          (2.4 — booking for all services)
0031_chat_messaging.sql               (2.5 — owner↔provider chat)
0032_grooming_sessions.sql            (2.6)
0033_walk_sessions.sql                (2.7)
0034_daycare_boarding.sql             (2.8)
0035_sitting_visits.sql               (2.9)
0036_training_module.sql              (2.10)
0037_shop_ecommerce.sql               (2.11)
0038_adoption.sql                     (2.12)
0039_subscription_due_fn.sql          (2.17 — auto-charge cron; SECURITY DEFINER enumerator, no table)   ✅ APPLIED + VERIFIED 2026-06-17
0040_telehealth.sql                   (2.18 — telehealth_sessions + widen two capability CHECKs)          ✅ APPLIED + VERIFIED 2026-06-17
0041_provider_links.sql               (2.20 — website/instagram/facebook/google_maps columns on providers) ✅ APPLIED + VERIFIED 2026-06-17
0042_provider_posts.sql               (2.22 — provider_posts table + providers.cover_image_url)            ✅ APPLIED + VERIFIED 2026-06-17
0043_provider_service_images.sql      (2.23 — provider_services.image_urls[])                              ✅ APPLIED + VERIFIED 2026-06-17
0044_notifications.sql                (2.26 — notifications table + app_notify DEFINER insert helper)       ✅ APPLIED + VERIFIED 2026-06-17
0045_owner_messaging.sql              (2.27 — dm_threads + dm_messages, participant-scoped RLS)             ✅ APPLIED + VERIFIED 2026-06-17
0046_walks_with_buddies.sql           (2.43 — social_walks lat/lng/location_name + social_walk_invites)    ✅ APPLIED + VERIFIED 2026-06-18
0047_community_forum.sql              (2.44 — forum_threads + forum_comments + forum_votes + forum_vote fn) ✅ APPLIED + VERIFIED 2026-06-18
0048_training_progress_self.sql       (2.45 — training_progress_self, owner-scoped DIY training completion)  ✅ APPLIED + VERIFIED 2026-06-18
0049_family_caregiver_sharing.sql     (2.47 — pet_caregivers + audit + person-access RLS on pet data tables) ✅ APPLIED + VERIFIED 2026-06-18
0050_lost_and_found.sql               (2.48 — lost_reports + lost_sightings + widen notifications type)       ✅ APPLIED + VERIFIED 2026-06-18
0051_emergency_medical_card.sql       (2.51 — pet_emergency_cards + pet_emergency_share_links + DEFINER public-read fns)  ✅ APPLIED + VERIFIED 2026-06-18
0052_transport_trips.sql              (2.52 — transport_trips on the spine; owner + provider-staff RLS)                    ✅ APPLIED + VERIFIED 2026-06-18
0053_vet_prescriptions.sql            (2.53 — prescriptions + rx_refill_requests; STRICTEST clinical append-only RLS)       ✅ APPLIED + VERIFIED 2026-06-18
0054_insurance_marketplace.sql        (2.54 — widen capability CHECKs +insurance; insurance_plans + insurance_leads RLS)     ✅ APPLIED + VERIFIED 2026-06-18
0055_adoption_foster_urgent_flags.sql (2.57 — additive columns on adoptable_listings + adoption_applications; ride 0038 RLS) ✅ APPLIED + VERIFIED 2026-06-18
--- WAVE 7 (planned numbers; each created at build time = next free, then flagged here on merge) ---
0056_transport_trip_locations.sql     (2.70 — live driver GPS pings on transport_trips; owner+driver+staff RLS)        BUILT + harness-proven (PR 2.70) — ✅ APPLIED + VERIFIED 2026-06-19
0057_rx_fulfillment.sql               (2.71 — rx_fulfillment_orders; owner/pharmacy-staff RLS + fulfill_rx_order safe path; `pharmacy` already in CHECK since 0040 — no widen) BUILT + harness-proven (PR 2.71) — ✅ APPLIED + VERIFIED 2026-06-19
0058_insurance_policies.sql           (2.72 — insurance_policies; in-app bind+pay; owner can't self-issue/activate; activate_insurance_policy safe path) BUILT + harness-proven (PR 2.72) — ✅ APPLIED + VERIFIED 2026-06-19
0059_pet_friendly_places.sql          (2.73 — saved_places owner-FOR-ALL RLS; NO cache table [proxy fetches live]; Google Places via key-gated web route) BUILT + harness-proven (PR 2.73) — ✅ APPLIED + VERIFIED 2026-06-19
0060_events_meetups.sql               (2.74 — events + event_rsvps; published public read, host-only writes, own-only rsvp; no DEFINER/notify) BUILT + harness-proven (PR 2.74) — ✅ APPLIED + VERIFIED 2026-06-19
0061_nutrition_food_recalls.sql       (2.75 — nutrition_plans owner-RLS + food_recalls [public read, DEFINER ingest] + pet_food_recall_matches owner-RLS + match/ingest DEFINERs + notifications 'food_recall' widen) BUILT + harness-proven (PR 2.75) — ✅ APPLIED + VERIFIED 2026-06-19
--- APP STORE READINESS (2.78) ---
0062_account_deletion.sql             (2.78 — delete_my_account() SECURITY DEFINER for in-app account deletion [Apple 5.1.1(v)]; auth→profile→pets→owner-data cascade, clears no-cascade health_medical_care_logs first) BUILT + harness-proven (PR 2.78) — ✅ APPLIED + VERIFIED 2026-06-19
--- WAVE 8 (calendar integration) ---
0063_event_rsvp_calendar_event_id.sql (2.80 — ADDITIVE `event_rsvps.calendar_event_id text` for the per-attendee device calendar event id; idempotent; NO RLS policy change — rides the existing event_rsvps own-row policies [0060]) BUILT + harness-proven (PR 2.80) — ✅ APPLIED + VERIFIED 2026-06-20 (Tats ran it; live DB now at 0063)
--- WAVE 9 (business onboarding + calendar import + adoption browse) ---
0064_provider_calendar_import.sql     (2.84 — provider_calendar_feeds [owner/admin FOR ALL + active-staff SELECT] + provider_calendar_busy [active-staff SELECT only; READ-ONLY, no write policy]; 4 SECURITY DEFINER fns: app_active_calendar_feeds / app_sync_calendar_feed [the ONLY busy writer] / app_remove_calendar_feed / app_provider_busy_windows [public availability+book subtract]; both ENABLE+FORCE RLS) BUILT + harness-proven (PR 2.84) — ✅ APPLIED + VERIFIED 2026-06-20 (Tats ran it; all 12 checks PASS via outputs/verify_0064.sql; live DB now at 0064)
--- UGC MODERATION (App Store Guideline 1.2) ---
0065_ugc_moderation.sql               (T1+T2 — content_reports [reporter-own RLS] + user_blocks [blocker-own RLS, live-pair partial unique] + hidden_at on 11 peer-UGC content tables + user_profiles.banned_at + 7 SECURITY DEFINER fns: app_is_admin / app_user_is_blocked / app_moderate_hide [the ONLY hidden_at writer] / app_moderate_unhide / app_ban_user / app_admin_list_reports / app_admin_action_report [T2 admin-queue helpers] + notifications 'report_received' widen; both new tables ENABLE+FORCE RLS) BUILT + harness-proven (PR T1 #228 + T2) — ✅ APPLIED + VERIFIED on Supabase 2026-06-21 (all checks PASS via supabase/verify_0065.sql)
0066_provider_post_moderation.sql     (1.2 follow-up — provider storefront posts [provider_posts, 2.22] join the moderation surface: 'provider_post' added to the content_reports target_type CHECK + hidden_at on provider_posts + the provider_post→provider_posts case in app_moderate_hide / app_moderate_unhide / app_admin_action_report [hideable list + ban-author author_user_id]; additive, no policy change — provider_posts is already ENABLE+FORCE RLS from 0042) BUILT + harness-proven — ✅ APPLIED + VERIFIED on Supabase 2026-06-21 (all 5 checks PASS via supabase/verify_0066.sql). Idempotent (CHECK drop+recreate; ADD COLUMN IF NOT EXISTS; CREATE OR REPLACE). Live DB now at 0066.
--- LEGAL CONSENT AT SIGNUP (App Store readiness / Guideline 1.2 follow-up) ---
0067_legal_consents.sql               (legal_consents — append-only Terms/Privacy consent ledger keyed to auth_users.id [user_profiles is lazy → no profile id at signup]; ENABLE+FORCE RLS, admin-only SELECT [reuses 0065 app_is_admin], NO owner write policy; the ONLY writer is the app_record_consent SECURITY DEFINER helper [server-authoritative versions, GRANT EXECUTE to pawpi_app]) BUILT + harness-proven (legal-consent.integration.test.ts, 7 tests) — ⏳ PENDING hand-apply to Supabase (run supabase/verify_0067.sql in the SQL editor; every row should read PASS)
--- SELF-SERVICE PASSWORD RESET (App Store readiness — closes the forgot-password stub) ---
0069_password_reset_tokens.sql        (password_reset_tokens — single-use 30-minute reset tokens keyed to auth_users.id [the requester is logged OUT, so there is no user_profiles.id and no app.current_user_id for the whole flow]; stores sha256(token), NEVER the token; ENABLE+FORCE RLS, admin-only SELECT [reuses 0065 app_is_admin], NO owner read/write policy at all; the ONLY writers are 2 SECURITY DEFINER helpers: app_create_password_reset_token [+ 5-per-hour throttle] and app_consume_password_reset_token [validates unused+unexpired, burns this token AND the account's other outstanding ones, writes the argon2 hash to auth_accounts, clears that account's auth_sessions]) BUILT + harness-proven (password-reset.integration.test.ts, 22 tests) — ⏳ PENDING hand-apply to Supabase (run supabase/verify_0069.sql in the SQL editor; every row should read PASS)
0086_adoption_application_questions.sql (Adoption applications v2 — TWO additive, idempotent changes, NO new table/function/policy: (1) adoptable_listings.application_questions jsonb NOT NULL DEFAULT '[]' — the shelter's ordered per-listing application questions; rides the existing 0038 adoptable_listings RLS (shelter-admin write / published-available discovery read), the applicant's responses land in the existing adoption_applications.answers jsonb; (2) WIDEN the notifications_type_check (0044, last widened 0080) to add 'adoption_under_review','adoption_approved','adoption_declined' — reuses the whole 2.26 notification system (table + app_notify DEFINER helper) verbatim. BUILT + harness-proven [adoption-applications-v2.integration.test.ts, 9 tests: questions persist across the provider list / public single GET / owner browse; answers roundtrip + applicant name+email; notify on under_review/approved/declined; re-list flips listing→available + re-opens the approved application under admin gating, cross-provider 403]. ⚠️ The CODE MERGES/DEPLOYS BEFORE this is applied and DEGRADES CLEANLY without it [every application_questions read catches undefined_column 42703 → [] (no questions, apply form works as today); every write drops the column on 42703; the applicant notify is fire-and-forget safeNotify() that swallows the CHECK failure → a status change never 500s], so there is no rush, but apply it to light questions + adoption notifications up. Run supabase/verify_0086.sql in the SQL editor; every row should read PASS.) — ⏳ PENDING hand-apply to Supabase
--- BOOKING PAYMENTS (Phase 1 — per-service payment policy) ---
0070_service_payment_policy.sql       (provider_services.payment_policy none|deposit|full, DEFAULT 'none' — additive column, rides existing 0024 RLS, no policy/table change; lets a provider require deposit/full payment up front for a booking. Amounts stay in price_cents/deposit_cents; charge is still an orders/payments row linked via vet_appointments.order_id) BUILT + harness-proven — ⏳ PENDING hand-apply to Supabase (run supabase/verify_0070.sql in the SQL editor; every row should read PASS)
0071_daycare_nightly_rate.sql         (provider_services.nightly_rate_cents integer, CHECK null-or->=0 — additive, rides existing 0024 RLS, no policy/table change; the daycare per-night rate. Stay price = rate x nights when payment_policy='full', deposit_cents when 'deposit', free when 'none'; charge links via order source_ref='daycare:<stayId>') BUILT + harness-proven — ⏳ PENDING hand-apply to Supabase (run supabase/verify_0071.sql in the SQL editor; every row should read PASS)
0083_provider_follows.sql             (Wave 10 / ticket 2.92 — provider_follows: a pet owner FOLLOWS a business. follower_user_id → user_profiles(id), provider_id → providers(id), unique(follower_user_id, provider_id). ENABLE+FORCE RLS, mirroring pet_follows (0012): provider_follows_authed_read [SELECT for any authed — follower counts / is-following / who-I-follow; edge table only, no provider-private data] + provider_follows_owner_write [FOR ALL, follower_user_id = current_app_user_id() — a user writes/deletes ONLY their own rows]. Passes the R2g completeness guard. BUILT + harness-proven [provider-follows.integration.test.ts, 8 tests]. ⚠️ The 2.92 CODE MERGES/DEPLOYS BEFORE this is applied and DEGRADES CLEANLY without it [the follow API catches undefined_table 42P01 → "not following / 0 followers / empty list"; the mobile button no-ops], so there is no rush, but apply it to light the feature up) — ⏳ PENDING hand-apply to Supabase
0084_provider_post_comments_pet_id.sql (ticket 2.93a — pet attribution on provider-post comments. ONE additive nullable column: provider_post_comments.pet_id integer references pets(id) on delete set null, + idx_provider_post_comments_pet. Mirrors post_barks.pet_id (0013): the comment POST accepts petId, verifies the caller OWNS that pet [same check the bark POST uses], and stores it; the GET LEFT JOINs pets → pet name/@handle/avatar. No table, no RLS POLICY change — it rides provider_post_comments' existing 0082 ENABLE+FORCE RLS [insert still gates author_user_id = current_app_user_id(); pet ownership is enforced in the route]; passes the completeness guard. BUILT + harness-proven [provider-post-comments.integration.test.ts, pet-attribution + owner-only + guest-degrade cases]. ⚠️ The CODE MERGES/DEPLOYS BEFORE this is applied and DEGRADES CLEANLY without it [POST/GET catch undefined_column 42703 → store/read without pet_id, display falls back to the account handle], so no rush, but apply it to light pet attribution up. NOTE: took the next free number 0084 at build time — if ticket 2.94's provider_post_paws lands first it will also want 0084; whichever merges second renumbers.) — ⏳ PENDING hand-apply to Supabase
0085_provider_post_paws.sql            (Wave 11 / ticket 2.94 — "Paws" (likes) on business STOREFRONT posts. provider_post_paws: post_id → provider_posts(id) ON DELETE CASCADE, user_id → user_profiles(id), unique(post_id, user_id). ENABLE+FORCE RLS, mirroring post_paws (0004/0021) + provider_follows (0083): provider_post_paws_authed_read [SELECT for any authed — paw counts / is-pawed; edge table only] + provider_post_paws_owner_write [FOR ALL, user_id = current_app_user_id() — a user writes/deletes ONLY their own paw rows]. Passes the R2g completeness guard. The column name post_id is load-bearing: the public-profile stats query (providers/public/[slug]) already JOINs provider_post_paws pp ON p.id = pp.post_id to compute pawsCount. BUILT + harness-proven [provider-post-paws.integration.test.ts, 9 tests: paw/unpaw/count/guest/RLS/stats]. ⚠️ The 2.94 CODE MERGES/DEPLOYS BEFORE this is applied and DEGRADES CLEANLY without it [every paw query catches undefined_table 42P01 → 0 paws / not-pawed; the paw action no-ops; never a 500], so there is no rush, but apply it to light Paws up.) — ⏳ PENDING hand-apply to Supabase
0087_provider_post_video_support.sql   (Business "daily moments" + VIDEO — mirrors 0068 [pet posts video] on the business-side provider_posts [0042]. THREE additive, idempotent columns, NO new table/function, NO RLS POLICY change [they ride provider_posts' existing 0042 ENABLE+FORCE staff-write / published-read + 0066 hidden_at]: provider_posts.media_type text NOT NULL DEFAULT 'image', video_url text, video_thumbnail_url text, + CHECK (media_type in ('image','video')). Lights up: [1] the storefront composer attaching a VIDEO moment [reuses VideoUploader] alongside the image path; [2] the CORE new piece — posts from providers the CURRENT USER FOLLOWS [provider_follows 0083] surface in that user's main feed [GET /api/posts], interleaved by recency with pet posts [mergeFollowingByRecency], item_type='provider_post', public business fields + media + paw/comment counts only, only followed providers [a non-follower sees none]; [3] the mobile business-post feed card [image OR FeedVideo] + video on the provider-post detail. BUILT + harness-proven [business-daily-moments.integration.test.ts, 3 tests: create→feed read of a video post carries media_type='video'+video_url; a follower sees the business posts, a non-follower + anonymous do not]. ⚠️ The CODE MERGES/DEPLOYS BEFORE this is applied and DEGRADES CLEANLY without it [feed read catches undefined_column 42703 → serves the same posts as image; the storefront create/PATCH attempt the media insert inside a withSavepoint and on 42703 either fall back to the base image insert or, for a video, return a clean 409 — never a blank post, never a 500; the compose video path only lands once the columns exist], so there is no rush, but apply it to light business video moments up. Run supabase/verify_0087.sql in the SQL editor; every row should read PASS.) — ⏳ PENDING hand-apply to Supabase
0088_provider_live_availability.sql    (Wave B / ticket B1 — walker "Accepting walks now" LIVE presence. NEW table provider_live_availability (provider_id PK → providers(id) ON DELETE CASCADE, accepting bool default false, lat/lng numeric(9,6) nullable [walker's current GPS at toggle-on], expires_at timestamptz, updated_at). One row per provider (the write path UPSERTs). ENABLE+FORCE RLS, mirroring provider_capabilities' two-tier read (0027): provider_live_availability_read [SELECT: app_is_active_staff_of(provider_id) OR provider is published — public presence for published providers, own-staff read for still-draft] + provider_live_availability_staff_write [FOR ALL: app_is_active_staff_of(provider_id) — any ACTIVE walker staff flips presence, not admin-only]. A row is AVAILABLE iff accepting=true AND expires_at>now(), ALWAYS evaluated at READ time (no cron). Passes the completeness guard. BUILT + harness-proven [live-availability-rls.integration.test.ts, 10 tests: staff upsert / outsider INSERT reject + UPDATE 0-rows / removed-staff loses write / published readable by any authed + draft not public + own-staff reads draft / expiry-at-read past→unavailable future→available / ENABLE+FORCE+policies]. ⚠️ The CODE MERGES/DEPLOYS BEFORE this is applied and DEGRADES CLEANLY without it [GET catches undefined_table 42P01 → {accepting:false}; the mobile switch reads OFF; PUT no-ops to accepting:false — never a 500], so there is no rush, but apply it to light the live toggle up.) — ⏳ PENDING hand-apply to Supabase
0089_walk_packages_and_credits.sql     (Wave B / ticket B2 — prepaid WALK PACKAGES + a per-owner↔provider CREDIT balance. THREE additive changes: (1) NEW walk_packages (the walker's offerings: provider_id→providers, walks_count>0, price_cents>=0, currency, active, created_at; idx(provider_id)); RLS ENABLE+FORCE mirroring provider_services (0024): walk_packages_admin_all [FOR ALL app_is_provider_admin] + walk_packages_read [SELECT active staff OR active-package-of-published-provider]. (2) NEW walk_credit_packs (the owner's balance: owner_user_id→user_profiles, provider_id→providers, walks_total>0, walks_used>=0 [<=total], order_id→orders ON DELETE SET NULL, purchased_at, active; idx(owner,provider) + partial UNIQUE(order_id) for idempotent grant); RLS ENABLE+FORCE with ONE SELECT policy walk_credit_packs_read [owner_user_id=current_app_user_id() OR app_is_active_staff_of(provider_id)] and NO write policy — credits are minted/spent ONLY by SECURITY DEFINER helpers, so a raw owner INSERT/UPDATE is denied. (3) WIDEN orders_kind_check to add 'walk_package' (drop+recreate, additive). Plus the DEFINER helper app_grant_walk_credits(order_id) — grants a credit pack for a PAID walk_package order EXACTLY ONCE (idempotent: guards on order_id + the unique index; reads walks_count from walk_packages via the source_ref 'walk_package:<id>'; returns the new pack id or NULL). Grant is called from applyPaymentStatus on the FIRST transition into paid (mirrors the shop stock hook). BUILT + harness-proven [walk-packages-credits.integration.test.ts, 17 tests: CRUD gating+404-before-SQL+cross-provider+soft-delete through the REAL router, public-active-only read, grant idempotency + wrong-kind/missing-package no-grant, balance read, both-table RLS incl. no-self-mint/no-self-decrement, completeness]. ⚠️ The CODE MERGES/DEPLOYS BEFORE this is applied and DEGRADES CLEANLY without it [packages read [] (42P01), purchase route 404s the package lookup, balance reads 0, the paid-webhook grant catches undefined_function/undefined_table and no-ops — never a 500], so there is no rush, but apply it to light walk packages up. Run supabase/verify_0089.sql in the SQL editor; every row should read PASS.) — ⏳ PENDING hand-apply to Supabase
0090_walk_pickup_redeem.sql            (Wave B / ticket B3 — QR pickup redeem. TWO additive changes, NO RLS POLICY change: (1) walk_sessions gains pickup_lat/pickup_lng numeric(9,6) + credit_pack_id integer→walk_credit_packs(id) [which pack a credit was spent from; NULL for non-credit walks] — additive, rides 0033's participant RLS. (2) SECURITY DEFINER app_redeem_walk_credit(provider_id, pet_id, pickup_lat, pickup_lng, booking_id?) — the ONLY credit-spend path [owner has no walk_credit_packs write policy, 0089]. Atomic: authorizes the caller is app_is_active_staff_of(provider_id) [raise 42501 if not], finds the OLDEST active pack of (owner-of-pet, provider) with walks_used<walks_total [FOR UPDATE SKIP LOCKED — no double-spend], increments walks_used, INSERTs the in_progress walk_session assigned to the caller with the pickup point + credit_pack_id, returns the new session id; returns NULL when NO credits [route → friendly 409, no session, no decrement]. The QR itself is a STATELESS HMAC-signed token [utils/walkPickupToken.js — {owner_user_id,pet_id,provider_id,exp}, ~5-min TTL, verified at redeem, bound to the provider] — NO token table. BUILT + harness-proven [walk-pickup-redeem.integration.test.ts, 10 tests: owner token endpoint scoping+404-before-SQL; redeem deducts EXACTLY ONE credit + creates the session atomically with pickup GPS; no-credit→409+no writes; non-staff→403; token-for-A rejected at B; non-integer→404]. ⚠️ The CODE MERGES/DEPLOYS BEFORE this is applied and DEGRADES CLEANLY without it [the redeem route catches undefined_function/undefined_column → a clear 503 "not available yet"; the existing non-credit check-in is untouched], so there is no rush. Replay protection is TTL-only in v1 [a one-time-use token store is a later hardening]. Run supabase/verify_0090.sql in the SQL editor; every row should read PASS.) — ⏳ PENDING hand-apply to Supabase
0091_booking_pay_with_credit.sql       (Wave B / ticket B4 — schedule a walk against a pack. ONE additive, idempotent column, NO new table/function, NO RLS POLICY change: vet_appointments.pay_with_credit boolean NOT NULL DEFAULT false. A scheduled credit walk IS a normal walker booking (capability='walker', 2.4) marked pay_with_credit — it creates NO money order; the credit is consumed at PICKUP (B3), not at booking, so a no-show never burns a credit. The book route (a) 409s a zero-balance owner [SUM(walks_total-walks_used) over active walk_credit_packs], (b) forces order_id=null for a credit walk, (c) stamps the flag via a withSavepoint'd UPDATE. Owner still can't self-confirm (staff-only, existing booking policy). BUILT + harness-proven [schedule-credit-walk.integration.test.ts, 6 tests: pay_with_credit booking created w/o a money order + credit NOT consumed at booking; zero-balance→409+no booking; owner-can't-confirm/staff-can; non-integer→404; flag surfaced on the walker agenda + owner list; normal booking unaffected]. ⚠️ The CODE MERGES/DEPLOYS BEFORE this is applied and DEGRADES CLEANLY without it [the flag UPDATE swallows undefined_column 42703 → a normal booking; the lists probe for the column and omit the badge], so there is no rush. Run supabase/verify_0091.sql in the SQL editor; every row should read PASS.) — ⏳ PENDING hand-apply to Supabase
0092_walk_requests.sql                 (Wave C / ticket C1 — direct "request a walk". THREE changes: (1) NEW walk_requests (owner_user_id→user_profiles, pet_id→pets, target_provider_id→providers [SET = direct/C1, NULL = broadcast/C2], pickup_lat/lng, note, when_type now|scheduled, scheduled_at, status open|accepted|cancelled|expired, accepted_provider_id, accepted_at, expires_at DEFAULT now()+2h, created_at; idx owner / (target,status) / (status,expires)). ENABLE+FORCE RLS, FOUR policies: owner select/insert[pinned status='open']/update[open→open|cancelled only, never self-accept] on their own rows + provider read [active staff of the TARGETED provider] — the broadcast read policy comes in C2. A request is LIVE iff status='open' AND expires_at>now(), evaluated at READ time. (2) WIDEN notifications_type_check (0044, last widened 0086) to add walk_request_targeted/broadcast/accepted/taken — all four now, so C2 needs no notify migration. (3) SECURITY DEFINER app_accept_walk_request(request_id, provider_id) — the ONLY accept path [no staff UPDATE policy]. Atomic: authorizes app_is_active_staff_of(provider_id), row-locks the request FOR UPDATE [two concurrent accepts serialize → first wins, second re-reads accepted status and bails], verifies open+not-expired+eligible[targeted-at-me OR broadcast], flips to accepted, and CREATES the confirmed walker booking [vet_appointments has NO provider-INSERT policy, so the owner-owned booking can only be created inside the DEFINER body — like app_approve_adoption's cross-user writes; credit-funded via walk_credit_packs when the owner holds a balance, spent at pickup B3]; returns jsonb {request, booking_id} or NULL [route → 409 "already taken"]. The route also opens the owner↔walker chat thread [staff CAN insert a message_thread under 0031 RLS] + safeNotify the owner. BUILT + harness-proven [walk-requests.integration.test.ts, 10 tests: create+owner-scope RLS [owner sees own / another owner 0 / targeted-staff read / non-target-staff 0 / null 0]; targeted-provider incoming list; race-safe accept [two accepts → one 200 one 409]; accept creates booking+thread+notify; expiry-at-read hides + blocks accept; owner cancel then can't-accept; credit-funded booking is pay_with_credit; non-integer id → 404 before SQL]. ⚠️ The CODE MERGES/DEPLOYS BEFORE this is applied and DEGRADES CLEANLY without it [create/list catch undefined_table 42P01 → 503/[]; accept catches undefined_function/undefined_table → friendly 503; never a 500], so there is no rush, but apply it to light "request a walk" up. Run supabase/verify_0092.sql in the SQL editor; every row should read PASS.) — ✅ APPLIED to Supabase 2026-08-13 (verify_0092 all PASS)
0093_walk_requests_broadcast_read.sql  (Wave C / ticket C2 — broadcast "find a walker now". FOUR additive changes, NO new table, NO change to existing policies: (1) app_staffs_a_walker() SECURITY DEFINER boolean — does the caller actively staff ANY provider holding 'walker'? DEFINER so it reads provider_staff+provider_capabilities without tripping their RLS; gates the broadcast read policy to walkers only. (2) app_provider_active_staff_ids(int[]) SECURITY DEFINER setof — the active-staff user_profile_ids for the given providers; the request-CREATE notify runs as the OWNER who canNOT read another provider's provider_staff under RLS, so resolving "who to notify" [direct AND broadcast fan-out] needs a DEFINER reader. (3) walk_requests_broadcast_read policy — active WALKER staff may SELECT OPEN, non-expired BROADCAST rows [target_provider_id IS NULL]; radius is enforced at the API/candidate layer [JS haversine over provider_live_availability], not RLS; the accept path stays the 0092 app_accept_walk_request DEFINER helper [already treats target-NULL as eligible]. Notification types [walk_request_broadcast/_taken] were already in the 0092 CHECK — no notify migration. (4) idx_provider_live_availability_accepting for the fan-out candidate scan. The POST /api/walk-requests broadcast branch [target null → require pickup + radius_km default 5] fans out walk_request_broadcast ONLY to walkers that are live-available now [B1] AND within radius; GET /api/providers/[id]/walk-requests?scope=broadcast lists nearby open broadcasts while the walker is accepting-now. BUILT + harness-proven [walk-requests-broadcast.integration.test.ts, 7 tests: fan-out to near+accepting only [far / not-accepting / non-walker excluded]; broadcast-read RLS admits walker staff + rejects vet staff / stranger / anon; nearby list in-radius vs far vs not-accepting; first-accept-wins/409; tiny-radius excludes; 404-before-SQL]. ⚠️ The CODE MERGES/DEPLOYS BEFORE this is applied and DEGRADES CLEANLY without it [broadcast create still inserts the row; the fan-out catches undefined_function/undefined_table → notifies nobody; the ?scope=broadcast list reads empty; never a 500], so there is no rush, but apply it [AFTER 0092] to light "find a walker now" up. Run supabase/verify_0093.sql in the SQL editor; every row should read PASS.) — ✅ APPLIED to Supabase 2026-08-13 (verify_0093 all PASS)
```

**✅ UGC moderation — migrations 0065 + 0066 APPLIED + VERIFIED on Supabase 2026-06-21.** Both ran in the
SQL editor and every verification row reads PASS (`supabase/verify_0065.sql`, and `supabase/verify_0066.sql`
— all 5 checks PASS). 0065 is the T1+T2 base (content_reports + user_blocks FORCE-RLS, hidden_at on 11
content tables, banned_at, 7 DEFINER fns incl. the two T2 admin-queue helpers `app_admin_list_reports` /
`app_admin_action_report`); 0066 is the provider_post follow-up (storefront posts now reportable/hideable).
Both additive + idempotent (`CREATE OR REPLACE`; CHECK drop+recreate; ADD COLUMN IF NOT EXISTS). The live
DB moves 0064 → 0065 → 0066; no UGC-moderation migrations remain pending.

**✅ Legal consent — migration 0067 APPLIED on Supabase** (confirmed 2026-07-28 by querying production
directly: `legal_consents` exists and `app_record_consent` is present). **✅ 0068 (post video support)
is APPLIED too** — `posts.media_type` / `video_url` / `video_thumbnail_url` all exist. **The live DB is
at 0068 and NOTHING is pending.** The paragraph below is kept for its design rationale; treat its
"PENDING" wording as historical.

Records Terms/Privacy acceptance
at account creation (POST `/api/legal/consent` → `app_record_consent` DEFINER → `legal_consents`). The
web sign-up form now uses `redirect:false`, awaits the result, fires the consent POST (best-effort: one
retry, then log + proceed — never blocks an already-created account), then redirects manually. Run
`0067_legal_consents.sql` then `supabase/verify_0067.sql` in the SQL editor; additive (one table + one
DEFINER fn), pre-launch → safe. 0066 is the UGC provider_post follow-up (above); consent took the next
free integer 0067.

**🔑 Self-service password reset — migration 0069 + ONE NEW GO-LIVE ENV KEY (`EMAIL_API_KEY`).**
`/account/forgot-password` is no longer a stub: it posts to `POST /api/account/forgot-password`, which
mints a single-use 30-minute token (0069) and emails a link to `/account/reset-password?token=…`; that
screen posts to `POST /api/account/reset-password`, which re-runs the shared 2.32 strength rule, argon2-
hashes the new password, and consumes the token through the DEFINER helper. Existing login, existing
sessions belonging to anyone else, and the 2.32 rules are all untouched.
- ⚙️ **MIGRATION TO APPLY (in ACTION 1):** `0069_password_reset_tokens.sql`, then run
  `supabase/verify_0069.sql` — every row should read PASS. Additive: one new table + two DEFINER fns,
  **no existing table's RLS is touched**.
- ⚙️ **GO-LIVE (Tats, when ready) — `EMAIL_API_KEY`** (+ `EMAIL_FROM`, optional `EMAIL_PROVIDER` /
  `EMAIL_API_BASE_URL`; template in `anything/apps/web/.env.example`). Default vendor is **Resend**.
  **The sending domain is `pawpi.info`** — the domain PawPi actually owns (`pawpi.app` is NOT ours;
  don't let the demo-account addresses mislead you). DNS lives at **one.com**; Resend verification =
  a TXT SPF on `send.pawpi.info` (`v=spf1 include:amazonses.com ~all`), an MX on `send.pawpi.info`
  → `feedback-smtp.sa-east-1.amazonses.com`, and the `resend._domainkey` DKIM TXT. one.com shows a
  generic "you may block one.com mail — add `_custspf.one.com`" banner on any SPF record: **ignore
  it here** — this record is on a SUBDOMAIN (no effect on root `pawpi.info`, which has no SPF at
  all), and `pawpi.info` mail is Google Workspace (`MX → smtp.google.com`), not one.com.
  Set `EMAIL_FROM=PawPi <no-reply@pawpi.info>`. **Until the key is set the flow degrades cleanly**:
  no crash, no 500, the screens behave identically, and the server logs the intended send
  (`[email] EMAIL_API_KEY not set — skipping send to …`) — but **nobody actually receives an email**,
  so the reset can't complete. This is the one key that gates the feature being genuinely usable.
- ⚙️ **ALSO SET IN PRODUCTION — `APP_BASE_URL`** (e.g. `https://pawpi-production.up.railway.app`).
  Reset links are built from it. Unset, the link falls back to the request's `Host` header, which an
  attacker can forge to point a real reset token at their own server (host-header poisoning).
- 📱 **DEVICE TEST (after the key is set):** Welcome → **Forgot password?** (new entry point; the link
  on the sign-in page still works too) → enter the demo account's email → "check your email" → open the
  emailed link on the phone → set a new password → log in with it in the app. Then check: the same link
  a second time says "invalid or has expired", and a *different* account's login is unaffected.
- ⚠️ **KNOWN LIMIT (documented, not a bug):** Auth.js runs the **JWT** session strategy here, so a JWT
  already issued to a signed-in device stays valid until it expires — the reset clears the account's DB
  sessions and every outstanding reset token, but it cannot revoke an already-minted JWT. Worth a
  follow-up ticket if forced global sign-out is ever required.

**TODO — "consent backstop" follow-up ticket (OUT OF SCOPE here):** (1) social-login sign-ups
(Apple/Google) record no consent — they don't pass through the credentials sign-up form, so wire a
consent write into the OAuth `createAccount`/first-session path; (2) a startup gate that blocks any user
lacking a `legal_consents` row for the CURRENT `TERMS_VERSION`/`PRIVACY_VERSION`, which also handles
re-consent when either version is bumped (the version constants in `src/constants/legal.js` are the key).
**✅ Wave 8 (ticket 2.80) — migration 0063 APPLIED + VERIFIED on Supabase 2026-06-20** (Tats ran
`0063_event_rsvp_calendar_event_id.sql`; all 6 checks PASS via `supabase/verify_0063.sql`): one additive
nullable column, no policy change (rides the existing `event_rsvps` own-row policies).
Bookings/transport/telehealth ride the existing `vet_appointments.calendar_event_id` (0005) — no DB change there.
**2.79 added no migration.**

**🌊 Wave 9 (2.81–2.87) — env keys + device tests.**
- **2.81 (provider location map pin) — no migration.** New OPTIONAL go-live env key
  **`NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`** (web): the browser Google Maps JS API key that powers the
  web provider-location pin. Unset → the web form degrades to manual lat/lng inputs (no crash). The
  mobile pin uses Apple Maps via `PROVIDER_DEFAULT` (no key). DEVICE TEST: in mobile business onboarding,
  drop/drag the pin → the provider's primary location row saves with lat/lng; deny location permission →
  a typed address still saves.
- **2.82 (document catalog enrichment) — no migration.** Reuses **`ENRICHMENT_LLM_KEY`** (already on
  the go-live list): unset → `POST /api/providers/[id]/enrich/document` returns a clean 503 ("not set
  up yet"). CSV/XLSX price lists structure WITHOUT the key (plain header parsing); PDF text needs the
  key + a real LLM adapter (the default text structurer is dormant). Added `xlsx@0.18.5` (lazy-loaded;
  CI never imports it). DEVICE/manual TEST: on the web Services dashboard → "Import from a price list
  or menu" → upload a CSV/XLSX → proposed rows appear → edit + Apply saves real services/products.
- **2.84 (business calendar import) — migration 0064 ✅ APPLIED + VERIFIED on Supabase 2026-06-20**
  (Tats ran `0064_provider_calendar_import.sql`; all 16 checks PASS via `supabase/verify_0064.sql` —
  both tables ENABLE+FORCE RLS, feeds=2 policies, busy=1 SELECT-only, 4 SECURITY DEFINER fns prosecdef=true
  + EXECUTE-to-pawpi_app, SELECT-to-pawpi_app on both tables). Reuses **`CRON_SECRET`** +
  needs an EXTERNAL scheduler to POST `/api/providers/calendar/sync` daily (like 2.17): unset → the
  endpoint returns a clean 503; the per-feed "Refresh now" button still works without it. DEVICE/manual
  TEST: web dashboard → Calendar import → paste a Google/Outlook/Apple ICS URL → Refresh now → busy
  blocks appear and those slots become unbookable; remove the feed → blocks clear. Provider calendar
  mgmt is web-primary (no mobile screen, like services/locations/staff).

**Wave 7 (tickets 2.68–2.75) + account-deletion (2.78) — ✅ ALL BUILT + MIGRATIONS APPLIED.** Migrations
**0056–0062** are **APPLIED + VERIFIED on Supabase 2026-06-19** (all 30 checks PASS via
`supabase/verify_0056_0062.sql` — RLS on+forced, policy counts, 8 DEFINER fns + EXECUTE-to-pawpi_app, the
`food_recall` CHECK widen, food_recalls read-only). Wave 8 **0063** and Wave 9 **0064** were applied next
(2026-06-20, verified above), so **the live DB is now at 0064 — migrations 0001–0064 are all applied, none
pending.** **2.68**
(shared Apple-Maps component) + **2.69** (provider Sales/payouts/reconciliation UI) added NO migration. New
go-live env keys this wave (each degrades cleanly until set): the **food-recall feed key + an external
scheduler** (2.75, like 2.17's CRON_SECRET); **2.73** also consumes the already-flagged `GOOGLE_PLACES_API_KEY`.

**Status (2026-06-17):** ALL Wave 3/4 migrations 0039–0045 are hand-applied to live Supabase and verified.

**✅ APPLIED + VERIFIED 2026-06-18 (Wave 5):** `0046_walks_with_buddies.sql` (ticket 2.43) — harness-proven, NOT yet applied.
- Adds `lat numeric`, `lng numeric`, `location_name text` to `social_walks` (+ a `(lat,lng)` index).
- New `social_walk_invites` table (owner-issued invitations to a PRIVATE walk) — ENABLE+FORCE RLS:
  invitee/walk-owner SELECT, walk-owner INSERT/DELETE, invitee-or-owner UPDATE — via the two new
  SECURITY DEFINER helpers `app_user_owns_walk(int)` + `app_is_walk_invitee(int)` (pinned search_path,
  GRANT EXECUTE to pawpi_app).
- TIGHTENS the existing `social_walks` read policy: a PRIVATE walk is now visible only to its owner +
  invitees (PUBLIC `nearby_pets` / friends_only stay any-authed readable). Proven as pawpi_app in
  `walks-buddies-rls.integration.test.ts` + the completeness guard. Hand-apply after merge.

**✅ APPLIED + VERIFIED 2026-06-18 (Wave 5):** `0047_community_forum.sql` (ticket 2.44) — harness-proven, NOT yet applied.
- New `forum_threads`, `forum_comments` (one-level reply via `parent_comment_id`), `forum_votes`
  (unique per user+target). All ENABLE+FORCE RLS.
- threads/comments: READ any-authed, INSERT/UPDATE/DELETE author-only (soft-delete via `deleted_at`).
- votes: voter reads OWN only; NO direct write policy — votes are cast solely through the
  `forum_vote(target_type, target_id, value)` **SECURITY DEFINER** helper (value 1/-1/0-clear), which
  pins the caller, upserts one vote per target, and recomputes the target's denormalized `score`
  (bypasses the author-only thread/comment UPDATE a non-author voter can't satisfy; pinned search_path,
  GRANT EXECUTE to pawpi_app). `comment_count` is COUNTed on read, not denormalized. Proven as pawpi_app
  in `forum-rls.integration.test.ts` + the completeness guard. Hand-apply after merge.

**✅ APPLIED + VERIFIED 2026-06-18 (Wave 5):** `0048_training_progress_self.sql` (ticket 2.45) — harness-proven, NOT yet applied.
- New `training_progress_self` (owner_user_id, pet_id, program_key, session_key, completed_at,
  UNIQUE per owner+pet+program+session) — per-pet completion of the DIY self-training curriculum (the
  curriculum CONTENT ships in the app's static `trainingCurriculum` module, not the DB). ENABLE+FORCE RLS,
  OWNER-SCOPED FOR ALL (owner reads/writes own; others zero). Named distinctly so it never collides with
  2.10's provider `training_progress`. Proven as pawpi_app in `training-self-rls.integration.test.ts` +
  the completeness guard. Hand-apply after merge.

**✅ APPLIED + VERIFIED 2026-06-18 (Wave 5):** `0049_family_caregiver_sharing.sql` (ticket 2.47) — harness-proven, NOT yet applied.
- New `pet_caregivers` (person↔person grant: pet, owner, grantee, role family|caregiver, scopes[],
  status, expires_at) + append-only `pet_caregiver_audit`. Both ENABLE+FORCE RLS (owner manages /
  grantee sees grants naming them; audit owner-or-actor read, actor-insert append-only).
- Three SECURITY DEFINER helpers: `app_owns_pet(pet_id)`, `app_user_has_pet_access(pet_id)` (any active
  unexpired grantee → READ gate), `app_user_has_pet_family(pet_id)` (active FAMILY grantee → WRITE gate);
  plus `respond_pet_caregiver(grant_id, accept)` (grantee accept/decline, no role/scope escalation).
- ADDITIVE per-table RLS so a grantee gets scoped access WITHOUT changing owner/provider access: `pets`
  (grantee read + family update), `routines` + `pet_medical_profiles` (any-grantee read, family write),
  and a FOR-ALL family policy on the 12 health_* + vet-record-extras + reminder_dismissals (family
  read+write; caregivers get NONE of these — their scope is feeding+emergency). A BEFORE-UPDATE trigger
  `pets_guard_owner_transfer` blocks a non-owner from re-pointing `owner_user_id` (the OR-of-WITH-CHECK
  takeover hole). Expiry + revoke are instant (helpers gate on status+expires_at). Proven hard as pawpi_app
  in `family-caregiver-rls.integration.test.ts` (family co-manage in scope; caregiver read-only scoped;
  expired/revoked → zero; non-grantee → zero on private data; owner-only delete) + the completeness guard.
  Hand-apply after merge. NOTE: `pets` rows stay any-authed-readable (0021 social) — this gates the PRIVATE
  data (routines/health/medical), not the public pet profile row.

**✅ APPLIED + VERIFIED 2026-06-18 (Wave 5):** `0050_lost_and_found.sql` (ticket 2.48) — harness-proven, NOT yet applied.
- New `lost_reports` (pet, owner, status active|resolved, last_seen lat/lng/area, notes, reward) +
  `lost_sightings` (report, reporter, lat/lng, note, photo). Both ENABLE+FORCE RLS.
- lost_reports: owner FOR ALL (activate/edit/resolve); any authed user reads an ACTIVE report (public
  alert); a resolved report is owner-only. One active report per pet (partial unique index).
- lost_sightings: a reporter INSERTs on an ACTIVE report (reporter = caller); SELECT by the report owner
  (all) or the reporter (their own); append-only. Cross-table checks via SECURITY DEFINER helpers
  `app_owns_lost_report` / `app_lost_report_active`.
- WIDENS the 0044 `notifications_type_check` additively to admit `'lost_alert'` (drop+re-add). Alerts go
  out best-effort via `app_notify` (followers on activation; owner on a new sighting) — a notify failure
  never blocks. Proven as pawpi_app in `lost-found-rls.integration.test.ts` + the completeness guard.
  Hand-apply after merge.
- 0039 cron function present + granted; 0040 telehealth_sessions RLS on+forced (owner-ALL + staff
  read/insert/update) + both capability CHECKs include `'telehealth'`; 0041 the four provider link columns.
- 0042 provider_posts RLS (read=SELECT, staff_all=ALL) + providers.cover_image_url; 0043
  provider_services.image_urls; 0044 notifications RLS (select/update; inserts only via app_notify DEFINER)
  + app_notify present; 0045 dm_threads (participant ALL) + dm_messages (sender INSERT + participant
  read/update/delete) + app_is_dm_participant present.
Wave-5 migrations 0046–0050 (2.43, 2.44, 2.45, 2.47, 2.48) are APPLIED + VERIFIED on Supabase (2026-06-18).
**Wave-6 migrations 0051–0055 (2.51, 2.52, 2.53, 2.54, 2.57) are APPLIED + VERIFIED on Supabase (2026-06-18)
— all checks PASS via the verification SQL.** Waves 7–9 + account-deletion migrations **0056–0064** were
applied later (0056–0062 on 2026-06-19; 0063 + 0064 on 2026-06-20), all verified all-PASS. **No migrations
remain pending; the live DB is now at 0064 (0001–0064 all applied).**

**✅ APPLIED + VERIFIED 2026-06-18 (Wave 6):** `0051_emergency_medical_card.sql` (ticket 2.51) — verification SQL all-PASS (2 tables RLS on+forced, 1+1 owner policies, the 3 DEFINER public-read fns SECURITY DEFINER + EXECUTE-granted to pawpi_app, notifications_type_check widened to admit 'emergency_contact').
- New `pet_emergency_cards` (one row per pet; permanent `tag_token`, `show_medical_on_tag` default
  FALSE, `contact_mode` relay|phone|email|none, `blood_type`, `active`) + `pet_emergency_share_links`
  (revocable/expiring vet links; `scope` full|basic, `expires_at`, `revoked_at`). Both ENABLE+FORCE RLS,
  **OWNER FOR ALL only** — everyone else gets ZERO direct table access.
- The PUBLIC reads are NOT an RLS hole: three SECURITY DEFINER fns (pinned search_path, GRANT EXECUTE to
  pawpi_app) are the SOLE public path — `app_emergency_card_by_tag(text)` (BASIC fields for an ACTIVE
  card; medical ONLY when `show_medical_on_tag`), `app_emergency_card_by_link(text)` (scoped full|basic
  for a non-revoked, non-expired link on an active card; ZERO otherwise), `app_emergency_relay_contact(
  text,text)` (best-effort owner notify for relay tags). The internal `app_emergency_card_json(int,bool)`
  assembler is DEFINER and NOT granted to pawpi_app. Medical sources read live (pet_medical_profiles /
  pet_allergies / pet_conditions / lost_reports) — no medical duplicated.
- WIDENS the 0044/0050 `notifications_type_check` additively to admit `'emergency_contact'` (drop+re-add).
  Proven as pawpi_app in `emergency-card-rls.integration.test.ts` (owner manages own; non-owner ZERO +
  can't create/revoke; tag basic-vs-medical toggle; link full/basic + revoked/expired → ZERO; relay
  notify) + the completeness guard. Hand-apply after merge.

**✅ APPLIED + VERIFIED 2026-06-18 (Wave 6):** `0052_transport_trips.sql` (ticket 2.52) — verification SQL all-PASS (transport_trips RLS on+forced, 5 policies: owner select/insert/update + staff select/update).
- New `transport_trips` (pet-taxi trip detail hanging off a generalized booking) — ENABLE+FORCE RLS,
  modeled on walk_sessions: OWNER reads/creates/edits/cancels own (a new trip is always 'requested';
  the owner-UPDATE WITH CHECK pins them to requested|cancelled — they CANNOT self-advance to a
  provider-only status); active STAFF of provider_id read ALL the provider's trips + UPDATE them
  (confirm/assign-driver/advance/fare); other-provider staff + outsiders → ZERO. Reuses
  app_is_active_staff_of (no new helper). `transport` was already in ALLOWED_CAPABILITIES + the
  provider_capabilities/vet_appointments capability CHECKs (0027/0030) — no CHECK widen needed.
  Proven as pawpi_app in `transport-rls.integration.test.ts` + the completeness guard. Hand-apply after merge.

**✅ APPLIED + VERIFIED 2026-06-18 (Wave 6):** `0053_vet_prescriptions.sql` (ticket 2.53) — verification SQL all-PASS (prescriptions + rx_refill_requests RLS on+forced, 3+3 policies, the 5 DEFINER helpers app_provider_can_rx/app_owns_active_rx/app_staff_of_rx_provider/decide_rx_refill/cancel_rx SECURITY DEFINER + EXECUTE-granted to pawpi_app; owner read-only append-only intact).
- New `prescriptions` + `rx_refill_requests` — STRICTEST clinical RLS, modeled on vet_notes append-only.
  prescriptions: OWNER **read-only** (no insert/update/delete — can never write/forge); active staff of
  the issuing provider READ + INSERT (via `app_provider_can_rx(provider_id, pet_id)` = active staff +
  medical_write grant OR booking); **NO provider UPDATE/DELETE policy** — the refill decrement + cancel
  flow ONLY through SECURITY DEFINER helpers so clinical fields are never silently rewritten.
- rx_refill_requests: owner files on their OWN active Rx with refills remaining (`app_owns_active_rx`);
  the issuing provider's staff READ requests (`app_staff_of_rx_provider`); the DECISION is `decide_rx_refill(
  request_id, approve, note)` (DEFINER — staff-gated; decrements `refills_remaining` on approve). `cancel_rx(
  prescription_id)` (DEFINER) cancels (status only). All 5 helpers: pinned search_path, GRANT EXECUTE to
  pawpi_app. Proven as pawpi_app in `prescriptions-rls.integration.test.ts` (vet-with-access issues; owner
  read-only/can't forge; cross-provider zero; refill decrement via the safe path; owner can't approve own)
  + the completeness guard. Hand-apply after merge.

**✅ APPLIED + VERIFIED 2026-06-18 (Wave 6):** `0054_insurance_marketplace.sql` (ticket 2.54) — verification SQL all-PASS (insurance_plans + insurance_leads RLS on+forced, 2+4 policies; provider_capabilities_capability_check + vet_appointments_capability_check both widened to admit 'insurance').
- WIDENS the provider_capabilities + vet_appointments capability CHECKs additively to admit `'insurance'`
  (drop+re-add, like 0040 added 'telehealth'); the app-side ALLOWED_CAPABILITIES gained `'insurance'` too.
- New `insurance_plans` (catalog — admin-managed write via `app_is_provider_admin`; read = active staff
  see all, anyone authed sees a PUBLISHED plan of a PUBLISHED provider — two-tier like provider_services
  0024) + `insurance_leads` (owner-or-provider scoped, like a booking: owner reads/creates own; the
  targeted provider's active staff read + status-update; other-provider/outsider zero). Lead-gen only —
  no payment/underwriting; no medical data beyond what the owner types. Proven as pawpi_app in
  `insurance-rls.integration.test.ts` + the completeness guard. Hand-apply after merge.

**✅ APPLIED + VERIFIED 2026-06-18 (Wave 6):** `0055_adoption_foster_urgent_flags.sql` (ticket 2.57) — verification SQL all-PASS (5 additive columns on adoptable_listings [placement_type/is_urgent/is_featured/urgent_reason/featured_until] + requested_placement on adoption_applications; both new CHECK constraints present; ride existing 0038 adoption RLS).
- ADDITIVE columns only (no new table, no policy change) that RIDE the existing adoptable_listings RLS
  (0038): `placement_type` adopt|foster|both, `is_urgent`, `is_featured`, `urgent_reason`, `featured_until`
  on adoptable_listings + `requested_placement` adopt|foster on adoption_applications (+ CHECKs + a
  featured-ordering index). Confirmed in `adoption-foster-flags-rls.integration.test.ts` that the new
  columns surface on the published-available public read and DO NOT leak on a non-available row, shelter
  staff still see all, and an applicant can set requested_placement. Completeness guard green (no new
  table). Hand-apply after merge.

No further migrations remain pending. Future tickets that add tables append here.
(2.13 feed + 2.14 dashboards added NO migration — read-only. 2.15 mobile multi-select + 2.16 token
encryption add NO migration either. Wave-4 NO-migration tickets: 2.19 nav fix, 2.21 enrichment, 2.24
calendar, 2.25 search/discover, 2.28 share frame, 2.29 i18n.)

**Wave 3 extra go-live env keys (Tats, when ready, do NOT block merges):**
- `2.16` set `PAYMENTS_TOKEN_KEY` (32-byte) in the web `.env` BEFORE any provider connects a payment account.
- `2.17` set `CRON_SECRET` in the web `.env` AND wire an external scheduler (host cron / scheduled job / CI
  cron) to `POST /api/payments/subscriptions/run` with the `x-cron-secret` header daily — PawPi has no
  built-in scheduler.
- `2.18` set the video-vendor keys when ready (until then consults book + the Join button shows a clean
  "not set up yet" message; nothing crashes).
- `2.21` set `GOOGLE_PLACES_API_KEY` + `ENRICHMENT_LLM_KEY` when ready (until then "Import from the web"
  shows a clean "not set up yet"; nothing auto-fills).
- `2.46` **Social sign-in (Apple + Google)** — ADDITIVE + ENV-GATED, no migration. To turn ON:
  - **Google:** create an OAuth 2.0 Web client in Google Cloud Console, register the callback URL
    `<origin>/api/auth/callback/google`, set `AUTH_GOOGLE_ID` + `AUTH_GOOGLE_SECRET` in the web `.env`.
  - **Apple:** in your Apple Developer account, create a **Services ID** (this becomes `AUTH_APPLE_ID`)
    and a **Sign in with Apple key**, then download its **`.p8` file** — Apple only lets you download
    this once, so save it somewhere durable. Register the callback URL
    `<origin>/api/auth/callback/apple`. Then set THREE vars instead of a hand-built secret:
    `AUTH_APPLE_TEAM_ID` (your Apple Developer Team ID, top-right of the portal), `AUTH_APPLE_KEY_ID`
    (the key's ID, shown right after you create it), and `AUTH_APPLE_PRIVATE_KEY` (the full `.p8` file
    contents, `-----BEGIN PRIVATE KEY-----` through `-----END PRIVATE KEY-----`, newlines intact). **N6
    (2026-07-29) changed this from a hand-generated static JWT to a JWT the app builds and signs itself
    on every request from this raw key material** — Apple caps a client-secret JWT's lifetime at ~6
    months, so a pasted-in static JWT would have silently broken sign-in for Apple users once it expired
    with no obvious cause; generating it fresh from the key material removes that failure mode entirely.
    (The old static-JWT path via `AUTH_APPLE_SECRET` still works if you already have one, but you'd be
    back to regenerating it by hand every ~6 months — the three-var path above is recommended.)
  - A provider appears ONLY when its keys are fully set (`AUTH_GOOGLE_ID`+`SECRET` for Google;
    `AUTH_APPLE_ID` + either the three Apple vars or `AUTH_APPLE_SECRET` for Apple); until then the
    "Continue with Google/Apple" buttons stay disabled ("Coming soon") and email/password login is
    byte-for-byte unchanged. Full details in `.env.example`.

## ⚙️ ACTION 2 — Payments go-live (Tats, when ready)
Exact, ordered steps — no research needed, just follow top to bottom. Until you do this, every checkout
surface (shop, bookings, adoption fees, donations, subscriptions, insurance, Rx fulfillment) shows a
clean "payments not configured" message; nothing crashes. **N5 (2026-07-29) re-audited every paid flow
shipped since 2.3 (transport, Rx fulfillment, insurance, subscriptions, shop) and confirmed all of them
degrade clean — they all funnel through `anything/apps/web/src/app/api/utils/payments/index.js`, which
gates on config before ever reaching a rail's adapter.**

### 1. MercadoPago (fiat rail — do this one first, it's the primary rail)
1. Create a MercadoPago **marketplace app** (an OAuth client, not a personal account) at
   https://www.mercadopago.com/developers — this lets each provider connect their own account and
   MercadoPago auto-splits the platform commission at checkout (`marketplace_fee`).
2. From the app's credentials page, copy the **Client ID** and **Client Secret**.
3. Register the OAuth Redirect URL with the app (a SINGLE FIXED url — the provider id is NOT in
   it; it travels in the OAuth `state`):
   `https://pawpi-production.up.railway.app/provider/payments/mercadopago/return`
   This is the provider-facing return page that completes the per-provider connect. It must match,
   byte-for-byte, `MP_REDIRECT_URI` (step 5). **Corrected N-payments (2026-08-02):** the earlier
   version of this step pointed at the `/api/.../callback` route with a `<id>` placeholder — that
   was wrong (OAuth redirects are exact-match and can't carry a path placeholder).
4. Register the webhook URL: `https://pawpi-production.up.railway.app/api/payments/webhooks/mercadopago`
   — generate a webhook secret in the MercadoPago dashboard when you set this up.
5. Set on the **web** deploy (Railway): `MP_CLIENT_ID`, `MP_CLIENT_SECRET`, `MP_WEBHOOK_SECRET`,
   `MP_REDIRECT_URI` (the exact Redirect URL from step 3 — verbatim, no `<id>`). Exact names + a
   commented example are already in `anything/apps/web/.env.example`.
6. Each provider then connects their own MercadoPago account from the **Sales** dashboard
   (`/provider/sales` → "Payment account" card → **Connect MercadoPago**, ticket-payments-connect),
   which starts the OAuth flow at `GET /api/providers/[id]/payment-accounts/mercadopago/connect` and
   returns to the page from step 3. **Built 2026-08-02** — before that the backend endpoints existed
   but there was no button/return page, so no provider could connect. 📱 device-test entry below.

### 2. Binance Pay (crypto rail — optional, can go live after MercadoPago or skip)
1. Create a **Binance Pay merchant account** at https://merchant.binance.com.
2. Copy the **API Key** and **API Secret** from the merchant dashboard.
3. Register the webhook URL: `https://<your-production-domain>/api/payments/webhooks/binance`.
   (No OAuth redirect needed — Binance uses a single merchant API key, not per-provider connect.)
4. Set on the web deploy: `BINANCE_PAY_API_KEY`, `BINANCE_PAY_API_SECRET`.

### 3. Token-at-rest encryption key (required either way, ticket 2.16)
Set `PAYMENTS_TOKEN_KEY` — a 32-byte key, hex or base64 — before either rail can persist a provider's
access token. Without it, connecting a provider account fails clean (503) rather than storing a token
in plaintext. Generate one with `openssl rand -hex 32`.

### 4. Verify after setting keys
1. Book one real low-value service (or add one shop item to cart) and confirm the checkout screen shows
   a real MercadoPago/Binance checkout link instead of "payments not configured."
2. Complete that one real payment and confirm the webhook lands — check `payments` table for a row
   with `status = 'approved'` (MercadoPago) or watch server logs for the webhook receiver firing.
3. If using MercadoPago, confirm the provider's connect flow completes (Sales/Payouts dashboard shows
   the account as connected) before testing a booking on that provider's services.
4. Confirm the subscription auto-charge cron (`POST /api/payments/subscriptions/run`, gated on
   `CRON_SECRET` — see ACTION 3-adjacent go-live keys) picks up a due subscription once both `CRON_SECRET`
   and payment keys are set.

## ⚙️ ACTION 3 — Pre-launch security
Change the `pawpi_app` DB password (currently the placeholder `pawpi_app`) before real users — see the
go-live checklist in `PawPi_instructions.md`.

---

## ⚙️ ACTION 4 — Observability go-live (2026-10-04 night run; human steps, none are automated)

The code for metrics, dashboards, alerts, logs and deploy markers is merged; this is what only you can do. Full detail + order: `docs/observability/OPERATIONS.md` (sections 7, 8, 14).

- [x] **Railway env vars** *(done 2026-10-05: the `GRAFANA_LOKI_*` variables are set in production and event logs reach Grafana, verified by the owner in Grafana; the deploy-marker check was not separately reported)*: `GRAFANA_LOKI_URL`, `GRAFANA_LOKI_USER`, `GRAFANA_LOKI_TOKEN`, `GRAFANA_URL`, `GRAFANA_ANNOTATION_TOKEN` (a service-account token limited to annotations write). Redeploy. Check: `{job="pawpi-web"}` shows lines in Grafana Explore → Loki after a few requests, and `pawpi-overview` shows a deploy marker after the next deploy.
- **Traces (2026-10-05):** spans are now scrubbed by `SpanScrubber` (#622) before export (no client IPs, user-agents coarsened, no query strings or raw id paths). Spans still carry a connection-level `peer.ipv4` that is Grafana's own server (the OTLP endpoint), not user data.
- [x] **Notifications v2 server side** *(done: migrations `0131` + `0132` applied and verified on production; `NOTIF_V2_ENABLED=true` on Railway; see `docs/notifications-v2-design.md`)*.
- [ ] **Apply to Grafana** (`GRAFANA_URL` + `GRAFANA_SA_TOKEN`; dry run first, then `--apply`; a second dry run must read all `unchanged`):
  `node scripts/observability/apply-grafana.mjs` / `--apply` (dashboards) · `--sections alerts,policies` with `ALERT_DIGEST_EMAIL=you@…` (rules arrive PAUSED) · `--sections synthetics` with `GRAFANA_SM_URL` + `GRAFANA_SM_TOKEN`.
- [x] **Ship app build 26** (client telemetry). *Done 2026-10-14: build 26 submitted for review. App Store Connect → App Privacy published as Product Interaction, Performance Data, Other Diagnostic Data (Analytics, not linked, not tracking; **Crash Data not declared**) per `docs/privacy/telemetry.md` §6; `docs/app-store-privacy-data-map.md` (#608) matches. Privacy policy URL `https://www.pawpi.info/privacy`.*
- [ ] **Un-pause alerts after data flows** (Alerting → Alert rules → folder PawPi → Resume evaluation; run each query in Explore first): server rules first (`P1-HealthDeepFailing`, `P1-ServerMetricsSilent`, `P1-Http5xxRate`, `P1-DbErrors`), then business/route rules, then P2 **only after** `pawpi-digest` exists, client rules only after build 26 has been live a few days. Verify `grafanacloud_instance_active_series` before `P2-FreeTierUsage`.
- [ ] *(optional)* **Grafana mobile push for P1** on contact point `Augusto` (IRM integration; 2 minutes, `OPERATIONS.md` 5.3).
- [ ] *(optional)* **Scripted sign-in journey** with one clearly labelled test account in an isolated project (never sign-UP; `OPERATIONS.md` 5.6).
- [ ] *(monthly)* the 15-minute review in `OPERATIONS.md` section 15.

---

## ⚙️ ACTION 5 — Move scheduled jobs to Railway cron (runbook `docs/ops/railway-cron.md`) — services created; first-run verification pending

PR #632 merged: `scripts/cron/` added and GitHub cron removed (manual fallback kept). The 5 Railway cron services are created and deploy from `main`:
`cron-weekly-digest` · `0 * * * *` · `node cron-trigger.mjs weekly-digest`
`cron-push-receipts` · `20 * * * *` · `node cron-trigger.mjs push-receipts`
`cron-winback` · `30 13 * * *` · `node cron-trigger.mjs winback`
`cron-subscriptions` · `0 6 * * *` · `node cron-trigger.mjs subscriptions`
`cron-calendar-sync` · `15 6 * * *` · `node cron-trigger.mjs calendar-sync`

- [x] Services created on `main` (Root Directory `/scripts/cron`, Restart Policy *Never*, `CRON_SECRET` + `CRON_BASE_URL` set).
- [ ] **24 h check (remaining):** hourly services show 24 runs each with no multi-hour gaps; daily ones show 1 run at 13:30 / 06:00 / 06:15 UTC; logs read `status=200 … OK`.
- [ ] Don't run the manual `subscriptions` fallback near 06:00 UTC (concurrent runs can create an orphan pending order; guard proposed in the runbook, not built).

---

## Follow-up (not scheduled): web catch-all 404 route

The web catch-all route (`anything/apps/web/src/app/__create/not-found.tsx`) runs a filesystem glob (`fast-glob`) on **every
unknown URL**. Consider caching the glob result (it only changes on deploy) and returning a real `404` status for unknown paths
instead of the rendered fallback page. Scanner probes were already short-circuited with a plain 404 in #623; this is the
remaining general case.

---

## 🧪 Pre-launch backend quality pass (2026-06-19, deepens 2.78)

A pure-backend hardening + test-deepening sweep over the Wave 7 surfaces and the sensitive systems
(transport live-GPS, Rx fulfillment, insurance binding/activation, places proxy, events/RSVP, nutrition
+ food-recall ingest/match, account deletion, payments, money/medical RLS). **No migration.** Web-only
(no mobile screen/component touched — the six redesign PRs #204–#209 own those). Running test baselines
at the start of the pass: **web vitest 1068 · web integration 567 · mobile jest 1032 (untouched).**

- **Coverage — Wave 7 mocked route tests (test-only).** Added vitest unit tests for the nine Wave 7
  routes that previously had none: `transport-trips` (owner list), `rx-fulfillment-orders/[id]` (owner
  cancel/link), `insurance-policies/[id]` (activate-DEFINER + cancel), `places/[placeId]` (auth + key
  degrade), `events/[id]` (GET/PATCH/DELETE host-only), `saved-places/[id]` (owner delete),
  `nutrition-plans/[id]` (owner edit/delete), and `recall-matches` + `recall-matches/[id]` (owner
  list/dismiss). Each pins 401/404/400 correctness, owner-vs-non-owner ZERO-row → 404, the DEFINER
  result codes, and clean-degrade paths. **web vitest 1068 → 1130 (+62).**
- **Coverage — real-Postgres integration deepening (test-only).** Closed gaps the existing Wave 7
  RLS suites named but never asserted: `account-deletion` now proves the **ON DELETE SET NULL survival**
  (another user's `lost_sightings` row that references the deleted account survives with reporter nulled,
  their `lost_report` intact), a **no-pet profile** deletes cleanly, and a **repeat call is a harmless
  no-op** (idempotent); `nutrition-recalls` adds **ingest_food_recall idempotency** (same
  source/external_ref upserts one row, refreshes fields) + **owner-only dismiss** isolation;
  `rx-fulfillment` adds **fulfill_rx_order double-call → already_done, no double-decrement** + not_found;
  `insurance-policies` adds **activate_insurance_policy double-call → not_bindable, bound once** +
  not_found. **web integration 567 → 576 (+9).** Completeness guard still green.
- **Cleanup — backend debug logging removed (clearly-safe).** Stripped ~173 lines of `console.log/
  info/warn/debug` spam (incl. the `[POST /api/pets] ====` banners that flooded server + CI logs) from
  13 base-schema API routes — `posts`, `posts/today-daily-update`, `pets/[id]`, five `health/*-logs`,
  `routines`, and the `social-walks` join-request set. One concise `console.error` per catch is kept;
  no control-flow change (all unit + integration suites unchanged: vitest 1130, integration 576).
- **Cleanup — PATCH /api/pets repair handler (DRAFT, behavior change).** The legacy `owner_user_id`
  repair tool (ARCHITECTURE.md §3) is dead under RLS (reads are already scoped to the profile id, so its
  `WHERE owner_user_id = <auth id>` lookup matches nothing). Gated OFF behind `ENABLE_PET_OWNERSHIP_REPAIR`
  (disabled → clean 410, no DB) + its own debug spam stripped. Left as a **DRAFT PR** for Augusto since
  it changes the endpoint's prod behavior. **⚠️ FOLLOW-UP:** its mobile caller `RepairPetsButton.jsx`
  lives in open redesign PR #209 (Profile) — remove the button + this handler together once #209 lands.
  **✅ RESOLVED (PR #225):** #209 merged, unblocking both sides — the `PATCH` method, its
  `ENABLE_PET_OWNERSHIP_REPAIR` gate, `RepairPetsButton.jsx`, and the `usePetProfile` auto-repair call
  are all fully removed; no gate, no dead endpoint. `docs/app-store-readiness.md` FLAGGED item moved to FIXED.
- **Hardening:** none required — every deepened test passed as written; the DEFINER safe-paths, RLS
  isolation, idempotency, and clean-degrade paths all behave correctly. No server-side gap surfaced.
- **No migration** introduced by this pass. (Next free number stays **0063** if one is ever needed.)

---

## To test — build 26 (v1.0.2) — see `docs/release-build-26.md`

**Status (2026-10-14): build 26 is SUBMITTED for App Store review** (commit `49a834b1`, includes #617–#629). Build 25 exists in EAS but is
stale and was never distributed; build 24 (v1.0.1) was the previous TestFlight build. Server side is done: **migrations 0131 + 0132 applied
and verified** on production and **`NOTIF_V2_ENABLED=true`**; **branch cleanup done** (six branches deleted; `claude/night-3b-notif-v2-schedule`
and `claude/night-3c-notif-v2-owner-events` are kept for a later decision).

The version/build setup and the full device checklist are in `docs/release-build-26.md` (§1, §5). Run it on a **real iPhone** with the build-26
install: Settings → **Privacy Policy / Terms of Service / EULA** rows (the Privacy row must land on `https://www.pawpi.info/privacy`); the new
**notification toggles** persist after reopening Settings; **quiet hours follow the phone's time zone**; a **booking confirmation push** rings
the phone (and stays silent in quiet hours / with the category off); and the basics (email, Google and Apple sign-in, onboarding, daily moment,
Today/Upcoming reminders). Carry-over checks (telemetry opt-out, logout leak, launch behaviour, first-reminder nudge) are listed there too.

## To test — build 24 (v1.0.1) on-device checklist (2026-10-03)

**Scope.** v1.0.0 (build 21) is LIVE in the App Store (accepted 2026-09-27). v1.0.1 (**build 24**) carries
#567–#592 (see `docs/roadmap.md` → "LAUNCH + v1.0.1 RELEASE LINE"). Test on a **real iPhone with the build-24
install**, then tell Claude "build 24 passed" or "X is wrong: <what you saw>". All items passing →
**Submit for Review** in App Store Connect (manual step). There are **no new migrations**, so nothing to
hand-apply before this pass.

> The old per-ticket device-test queue (2.1 → N8, DEV-1…DEV-5) was retired on 2026-10-03 — the app shipped.
> It is preserved in git history (last present at commit `defe9acc`: `git show defe9acc:docs/test-backlog.md`).

### [ ] 1. Sign in from scratch — Google + Apple  (#567, #580, #582, #585)
Use a **fresh install** (delete the app first) so there is no stored session.
1. **Google:** Welcome → *Continue with Google* → the **system browser** (not an in-app WebView) opens → pick an
   account → it hands back to the app automatically and lands in onboarding (new account) or the app (existing).
2. **Apple:** sign out, then *Continue with Apple* → the **native** Apple sheet → approve → you're in. Try once
   with *Hide My Email* and once with a real email.
3. Cancelling either flow (close the browser / dismiss the Apple sheet) returns you to Welcome with **no error
   banner** and no stuck spinner.
4. After sign-in the app talks to `www.pawpi.info` (data loads; no "session expired" bounce right after login).
5. Email + password sign-in still works (regression check).

### [ ] 2. Onboarding flow  (#568, #573, #577, #583, #586, #587, #588)
1. Walk the whole wizard on a new account: every step's **Next** enables once required fields are filled — it
   never wedges.
2. On every step the **footer/Next stays above the keyboard** and inputs aren't clipped; the type scale looks
   compact, not oversized.
3. Name step: keyboard opens/closes without a crash; the step-0 back arrow works.
4. Pet handle: a taken handle is flagged **at step 2**, not only on the review screen.
5. Breed picker: common breeds are ranked first. Weight units default to **kg**.
6. Recovery: a failed sign-in shows **Start over** + a working back; inside onboarding, **Use a different
   account** logs out and returns to Welcome.

### [ ] 3. Keyboard on every input screen  (#589, #592, #570)
Open the keyboard on each and confirm the focused field and the Save/primary button are **not covered**:
- **Place review sheet** (open a place → write a review → tap the comment field) — the comment field clears
  the keyboard (#592).
- A sample across the ~45 screens #589 touched: Edit Pet / Medical Profile, each routine modal (Feeding, Walk,
  Medication, Wellness, Vet appointment), Settings, post composer/comment, DMs, provider chat, booking forms.
- Log out / "Reset app data" no longer crashes (#570).

### [ ] 4. Real text, not keys — Track + Reminders  (#589)
1. **Health → Track:** every tile/section shows readable words (EN and ES) — **no** strings like
   `trackers.something.title`.
2. **Reminders → Upcoming:** labels and empty states are real text in both languages.
3. Switch the app language EN ↔ ES (Settings) and recheck both screens.

### [ ] 5. Units — lbs + kg default  (#588, #589, #590)
1. New account/pet defaults to **kg**; metric is the default for a metric locale.
2. Switch to lbs, save a **Wellness check** weight → it saves as **lbs** and reads back correctly (no "lb"/
   "lbs" mismatch, no wrong conversion).
3. An **old** weight entry logged before this build (stored as legacy `lb`) still displays in lbs correctly
   — it is read-aliased, nothing was migrated.

### [ ] 6. Uniform 24-hour time, incl. midnight  (#591)
1. Reminders, routines, vet appointments, Today, notifications, walks: every time reads **HH:MM, no AM/PM**,
   regardless of the phone's 12/24h setting.
2. Create a reminder/routine at **00:00** → it displays `00:00` (not `12:00 AM`, not `24:00`) everywhere it
   appears, and fires at midnight.
3. A time at 12:30 and 23:45 shows as `12:30` / `23:45`.

### Carried over (still open, not build-24-specific)
- **MercadoPago live end-to-end** (provider connect → real checkout link) — one live run with real keys; steps in
  ACTION 2 §4 above. Binance Pay remains optional.
- **Deferred:** pinned-footer redesign for long routine forms (tracked in `docs/roadmap.md`).

---

## Passed (archive)
_Nothing yet._
