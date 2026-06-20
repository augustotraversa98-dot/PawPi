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
0063_event_rsvp_calendar_event_id.sql (2.80 — ADDITIVE `event_rsvps.calendar_event_id text` for the per-attendee device calendar event id; idempotent; NO RLS policy change — rides the existing event_rsvps own-row policies [0060]) BUILT + harness-proven (PR 2.80) — ⏳ PENDING HAND-APPLY (last applied = 0062)
```
**⏳ Wave 8 (ticket 2.80) — migration 0063 PENDING HAND-APPLY.** Apply `0063_event_rsvp_calendar_event_id.sql`
on Supabase: one additive nullable column, no policy change (rides the existing `event_rsvps` own-row policies).
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

**Wave 7 (tickets 2.68–2.75) + account-deletion (2.78) — ✅ ALL BUILT + MIGRATIONS APPLIED.** Migrations
**0056–0062** are **APPLIED + VERIFIED on Supabase 2026-06-19** (all 30 checks PASS via
`supabase/verify_0056_0062.sql` — RLS on+forced, policy counts, 8 DEFINER fns + EXECUTE-to-pawpi_app, the
`food_recall` CHECK widen, food_recalls read-only). **The live DB is now at 0062; none pending.** **2.68**
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
— all checks PASS via the verification SQL. No migrations remain pending; the live DB is at 0055.**

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
- `2.46` **Social sign-in (Apple + Google)** — ADDITIVE + ENV-GATED, no migration. To turn ON: create a
  Google OAuth 2.0 Web client + an Apple Services ID / Sign in with Apple key, register the callback URLs
  `<origin>/api/auth/callback/google` and `<origin>/api/auth/callback/apple`, then set in the web `.env`:
  `AUTH_GOOGLE_ID` + `AUTH_GOOGLE_SECRET`, and `AUTH_APPLE_ID` + `AUTH_APPLE_SECRET` (the Apple secret is a
  GENERATED client-secret JWT, not a static string). A provider appears ONLY when BOTH its keys are set;
  until then the "Continue with Google/Apple" buttons stay disabled ("Coming soon") and email/password
  login is byte-for-byte unchanged. Placeholders + the callback URL pattern are documented in `.env.example`.

## ⚙️ ACTION 2 — Payments go-live (Tats, when ready)
Set up a MercadoPago marketplace app (OAuth client) + a Binance Pay merchant account, set the env keys
(see the commented block added in 2.3), register webhook/redirect URLs, and connect each provider's
account. Until then, every checkout shows a clean "payments not configured" message (nothing crashes).

## ⚙️ ACTION 3 — Pre-launch security
Change the `pawpi_app` DB password (currently the placeholder `pawpi_app`) before real users — see the
go-live checklist in `PawPi_instructions.md`.

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
- **Hardening:** none required — every deepened test passed as written; the DEFINER safe-paths, RLS
  isolation, idempotency, and clean-degrade paths all behave correctly. No server-side gap surfaced.
- **No migration** introduced by this pass. (Next free number stays **0063** if one is ever needed.)

---

## To test

### ▸ WAVE 8 device-test queue (2026-06-20) — calendar integration

### [ ] 2.80 — Calendar everywhere (bookings / transport / telehealth / events)  ·  ticket/calendar-everywhere (2026-06-20)
- **What shipped:** add-to-calendar on every remaining scheduled surface, reusing the 2.79 layer. Booking
  (grooming/walking/daycare/sitting **and telehealth**) gets an "Add to phone calendar" toggle in
  `BookingFormModal` → the device event id is saved on `vet_appointments.calendar_event_id`. Transport trips
  get an "Add to calendar" button (persists to the linked booking; cleared on cancel). Events get an
  "Add to calendar" action **gated on a "going" RSVP** → the id is saved per-attendee on
  `event_rsvps.calendar_event_id` (migration **0063**, pending hand-apply). New `GET /api/calendar/event/[id].ics`.
- **⚠️ Needs migration 0063 applied** before the events calendar id persists on the live DB (ACTION 1).
- **NEEDS A DEVICE PASS** — jest can't run native expo-calendar:
  - Book a grooming/walking/daycare/sitting service with "Add to phone calendar" on → the event appears in the
    "Social Pet - Bookings" calendar; book a telehealth consult the same way → "Social Pet - Telehealth"
    (noted as a video consult, no location).
  - Book a transport trip, then tap **Add to calendar** on the trip → "Social Pet - Transport" with pickup/
    dropoff in the notes; **cancel** the trip → the calendar event is removed.
  - RSVP "going" to an event → **Add to calendar** appears (hidden until going) → adds to "Social Pet - Events";
    un-RSVP → it's removed.
  - **Deny** calendar permission on any of the above → the booking/RSVP still saves with a clean message
    (calendar is optional, never blocks).
  - Download an event `.ics` from `GET /api/calendar/event/<id>.ics` while signed in → opens cleanly; confirm a
    non-visible (cancelled/other-host) event 404s.

### [ ] 2.79 — Calendar foundation (unified layer + ICS export)  ·  ticket/calendar-foundation (2026-06-20)
- **What shipped:** internal de-dup of `calendarIntegration.js` (one `getOrCreatePawPiCalendar` + generic
  `upsertCalendarEvent`/`deleteCalendarEvent`) + an expo-free, jest-covered `calendarFormat` module; the
  walk/vet wrappers + every call-site are unchanged. New owner-scoped `GET /api/calendar/booking/[id].ics`.
  **No migration.**
- **NEEDS A DEVICE PASS** — jest can't run native expo-calendar:
  - On a walk (WalkItem / WalkCountdownCard / RoutineCard) tap **Add to calendar** → the event lands in the
    "Social Pet - Walks" calendar exactly as before (recurring when the walk repeats).
  - On a **vet appointment**: add → it appears in "Social Pet - Vet Appointments"; **edit** → the event moves;
    **delete** → choose "delete appointment and calendar event" → it's removed. (Round-trip via
    `calendar_event_id`, unchanged behavior.)
  - From web, hit `GET /api/calendar/booking/<your-booking-id>.ics` while signed in → the downloaded `.ics`
    opens cleanly in Apple Calendar / Google Calendar (correct title, time, clinic as location). Confirm you
    **cannot** download another owner's booking (returns 404).

### ▸ WAVE 6 device-test queue (2026-06-18) — all merged + migrations 0051–0055 applied; owes a real-device pass

Run these on a real device. For the share/QR ones use a **dev build** (native modules don't work in Expo Go),
and start with `npx expo start --clear` (new route files need a fresh Metro route tree). Tell Cowork/Code
"X passed" to clear an entry, or "X is wrong: <what you saw>" to turn it into a fix ticket.

- [ ] **2.67 — Followers/Following route.** From your pet's profile (both via the bottom Profile tab AND by tapping a pet name on a post), tap **Followers** and **Following** → the searchable list opens for the right pet (no "+not-found", no dead taps); search filters; the paw **Follow/Following** toggle persists across reopen; tapping a row opens that pet's profile. Confirm it works after a clean `--clear` start.
- [ ] **2.55 — Avatar fallback + no "Phoebe".** No "Phoebe" anywhere; a pet/user with no photo shows a clean initials/paws avatar (never a broken image); a pet with a photo shows it.
- [ ] **2.62 — Share attaches the real photo (dev build).** From a daily post → **Share** → the framed image shows the REAL pet photo (not a blank center) → share sheet opens. Repeat from feed card, post detail, profile grid, and a Memory.
- [ ] **2.63 — Keyboard tap-to-focus.** Open barks/comments → the sheet animates in with NO keyboard; tap the field → keyboard opens and the field stays visible. Same calm behavior on other forms/modals; the dedicated search screen may still auto-focus (intended).
- [ ] **2.64 — Double-tap to Paw (dev build for animation).** Double-tap a feed image → a coral paw pops and the post is pawed (count +1); double-tap again → it animates but stays pawed (no double-count, no unpaw); the paw button stays in sync; single-tap still opens the post.
- [ ] **2.65 — Edit own caption.** Open your own post → **Edit** → fix the text → save → the corrected caption shows in the detail + feed and persists on reopen; you can't edit another pet's post (no edit affordance); the photo/daily-lock are unaffected.
- [ ] **2.66 — Today's Progress on real data.** With nothing logged → an empty/encouraging state (no fake numbers); log a meal → "meals" increments (e.g. 1/3); complete a walk → walks count rises; the chips match the Today list; another pet/day isn't counted.
- [ ] **2.59 — Floating tab bar.** The nav floats as a rounded pill above the home indicator with a shadow; the active tab is clear; scrolling content isn't hidden behind it; all five tabs navigate as before on notch + non-notch phones.
- [ ] **2.60 — Profile tab.** The bottom-right tab shows your pet's photo and opens your pet's social profile in one tap; switching the active pet updates the icon + profile; the ☰ burger still reveals Community/Hub/Dog Profile/Reminders/Settings + the My Dogs switcher; a no-pet account shows the paws fallback + add-a-pet state.
- [ ] **2.61 — Followers/Following lists.** (Covered with 2.67 above — verify follow/unfollow persists, search works, rows open profiles, empty/no-match states show, you can't follow yourself.)
- [ ] **2.51 — Emergency card + tag QR + public pages (dev build).** In-app card assembles from the medical profile ("Not recorded" for empties); **Share** exports the card image. Print/scan the **tag QR** → it opens the public `/p/tag` page in a phone browser with **no login** and **no app-install wall** → with "show medical" OFF only basic info shows; toggle ON → medical appears. Create a **vet link** → open `/p/card` in a browser → full card; **revoke** it → the same URL says expired/revoked. Mark the pet lost (2.48) → the card + tag show the LOST banner. **Eyeball the public pages on a real phone to confirm only what you intend is visible.**
- [ ] **2.52 — Transport / pet-taxi.** Book a pet-taxi (pickup + dropoff on the map) → it appears in the provider inbox/calendar → confirm + assign a driver → advance status → owner sees status + can chat; paying degrades cleanly if keys aren't set; another provider never sees the trip.
- [ ] **2.53 — Vet prescriptions / Rx.** As a vet with access, issue an Rx to a pet → it appears in that owner's Vet Record labeled by clinic; owner requests a refill → the vet approves → refills remaining drops; owner cannot edit/forge an Rx (no edit affordance); a different clinic never sees it; empty Vet Record shows the empty state.
- [ ] **2.54 — Insurance marketplace.** As an insurer, publish 2 plans → they appear in the owner marketplace; compare them; submit a quote for a pet → the insurer sees the lead + updates its status; unpublished plans stay hidden; another insurer never sees the lead; empty marketplace shows the empty state.
- [ ] **2.57 — Adoption foster/urgent flags.** Flag a dog urgent → an URGENT badge shows in browse + feed; feature one → it sorts first (never hides non-featured); a foster/both listing lets the applicant choose foster; normal listings show no badge.
- [ ] **2.58 — Feed "Suggested" divider.** The feed shows followed content, then a "Suggested for you" divider before suggested posts; with no suggested content there's no divider.

### [ ] 2.42 — Vet Record: append-only dated history log  ·  ticket/vet-record-history-log (2026-06-18)
What shipped: the Vet Record "Vet Notes" section is now a proper **History** log — every entry is shown newest-first with its **date** and an **author label** (the clinic/vet name, or **"You"** for owner-authored entries), with a real derived **General summary** block at the top (entry count · last-updated date · last author — not the AI summary, which is 2.50). The **owner can add** a dated entry (`AddVetNoteModal`) and **delete** their entries. Append-only integrity is enforced by RLS: a vet with `medical_write` can INSERT but **cannot edit or delete** any entry — only the owner can.
- **No migration.** The append-only RLS is already proven in `provider-records-rls.integration.test.ts` (provider INSERT ok; provider UPDATE/DELETE → 0 rows; owner edits/deletes; non-grantee sees nothing), so no new integration test. Exercised by web vitest (+7: notes GET/POST/DELETE owner-scoped + validation) and mobile jest (+2: owner add posts the right body, append-only framing).
- **NEEDS A DEVICE PASS:** add a history entry → it appears dated as "You"; the summary updates; delete works; (when a vet adds a note via their dashboard it shows with their clinic name and you can't edit it).

### [ ] 2.41 — Vet Record: owner upload + complete info  ·  ticket/vet-record-owner-upload (2026-06-18)
What shipped: the owner can now **add documents** to the Vet Record. The Documents section has an **"Add document"** button → a modal (name + type chips + a **photo of the paperwork** via the image picker + a date) → Supabase Storage upload → `POST /api/vet-record/documents` (owner-scoped). Each document row is **tappable to open** the file and has a **delete** (owner, confirm). Empty state stays when there are none. The medical-profile **edit** path (EditMedicalProfileModal → `onSave` refetch) already persists, so "complete info" works.
- **No migration** — `vet_documents` already exists and is owner-scoped (RLS R2c). Its owner-only access is already proven in `owner-private-rls.integration.test.ts`, so no new integration test. Exercised by web vitest (+7: GET/POST/DELETE owner-scoped, validation, 401/400) and mobile jest (+2: the add flow uploads → POSTs the right body → refetch + close).
- **NEEDS A DEVICE PASS:** add a document (pick a photo) → it appears newest-first and **opens** when tapped; **delete** removes it; edit medical info → persists across reopen; empty sections show empty states. (Native image upload uses the shared `fetch.ts` path — confirm on a real device.)

### [ ] 2.40 — Unified Messages (people + businesses + owner search)  ·  ticket/unified-messages (2026-06-18)
What shipped: the Messages screen is now ONE hub that lists **owner↔owner DMs (People)** and **owner↔business chats (Businesses)** together, newest-first, each with name/avatar + last message + unread badge. A segmented **All / People / Businesses** filter scopes the list. A **search** field finds pet owners (reusing the 2.25 search) → tap one → starts/reuses the DM (idempotent 2.27 route) and opens the chat. People route to `/chat`, businesses to `/provider-chat` — the two backends (`dm_threads` vs `message_threads`) stay separate, just presented together.
- **No migration / no new web code** (reuses `/api/dm-threads`, `/api/threads`, `/api/search`). Exercised by mobile jest (+: both kinds listed, filter scopes, correct routing per kind, search→start-DM).
- **NEEDS A DEVICE PASS:** Messages shows people + businesses with the filter; searching a pet parent and tapping starts a DM; a business "Message" conversation appears under Businesses afterward.

### [ ] 2.39 — Instagram nav: bottom Profile + More burger  ·  ticket/nav-profile-and-more-burger (2026-06-18)
What shipped: the bottom-right tab is now **Profile** (avatar icon) instead of "More" — same `more/index` route slot, so the 2.19 nav-corruption fix stays intact. That screen is the owner's profile (the orange profile card + the My Dogs switcher); the former **More menu** (Community, My Hub, Dog Profile, Reminders & Routines, Settings, Reset App Data) now opens from a **top-right ☰ burger** as a bottom sheet. Tapping a menu item closes the sheet first, then navigates, so no stale modal layers over a tab.
- **No migration.** Added a `tabs.profile` i18n key (EN "Profile" / ES "Perfil"). Exercised by mobile jest (+1 layout: 5th tab is Profile not More; +2 more: burger reveals every former destination, routes correctly).
- **NEEDS A DEVICE PASS:** bottom-right opens your profile in one tap; the ☰ reveals the full menu; every old More item is reachable and returns cleanly; no tab corruption (open a menu item, go back, open another tab — all clean).

### [ ] 2.38 — Profile fixes: share button + real timestamps  ·  ticket/profile-fixes (2026-06-18)
What shipped: (1) the **share button** in the post detail modal (opened from the feed AND from your own profile grid) was a no-op — it now reuses the **2.28 branded share** flow (`DailyShareButton`: off-screen capture → system share sheet). (2) Posts showed a fake **"Just now"** because the code read a non-existent `post.timestamp`; a pure `formatRelativeTime(created_at)` now renders the **true relative time** (just now / 5m / 1h / yesterday / 3d / date) in both the detail modal and the feed card.
- **No migration.** Exercised by mobile jest (+5 relative-time buckets incl. skew/invalid; +2 detail-modal: share affordance wired, real timestamp not "Just now").
- **NEEDS A DEVICE PASS:** on your profile, open a post → Share opens the share sheet with the branded card; post timestamps read realistically (an hour-old post says "1h", not "Just now").

### [ ] 2.37 — Feed streak 🔥 + birthday 🎂 frame  ·  ticket/feed-streak-birthday (2026-06-18)
What shipped: (1) a **posting streak** — a 🔥 + consecutive-day count next to the pet name on the **active pet's** cards. Count = consecutive days ending today with a daily post; **0 (no badge) if you haven't posted today** (a missed day breaks the chain). Computed from the pet's recent daily-post days (`GET /api/posts/streak`) against the **phone's local day**, in a pure tested helper. (2) **birthday/adoption highlight** — on a pet's birthday OR adoption anniversary (month+day, any year), a 🎂 appears by the name and the post card gets a thicker **signature-orange frame**.
- **No migration** — `pets.birthday` / `pets.adoption_date` already exist; added to the feed SELECT. Scope note: the 🔥 badge is fetched for the active pet only (one query, bounded) so it shows on your own cards; 🎂 shows for any pet whose date is today.
- Exercised by web vitest (+3 streak endpoint) and mobile jest (+10 streak/birthday helper, +5 PostCard render).
- **NEEDS A DEVICE PASS:** post daily on consecutive days → 🔥 count climbs; skip a day → it resets (no badge until you post). On a pet's birthday/adoption day the 🎂 + orange frame appear; no false positive on other days.

### [ ] 2.36 — Feed daily-post fixes (delete/reupload, view-today, own posts)  ·  ticket/feed-daily-post-fixes (2026-06-18)
What shipped: three daily-post bugs fixed. (1) **Delete + reupload** — new owner-only `DELETE /api/posts/[id]` (hard delete; `post_paws`/`post_barks` cascade; deleting today's daily frees the unique slot so `owner-posted-today` flips false and the BeReal composer reopens). A trash button with a confirm appears in the post detail modal **only for your own active pet's post**. (2) **View today** — the handler searched only the feed list (which excluded own posts) so it opened nothing; own posts are now in the feed AND it falls back to the today's-daily object from the API. (3) **Own posts in feed** — the Following group now includes your active pet's posts (newest-first), so your post appears right after posting.
- **No migration** (posts RLS already owner-write — `posts_author_all` FOR ALL covers DELETE). Exercised by web vitest (+6: DELETE owner-only/401/400/404; feed includes own pet) and mobile jest (+2: delete affordance shown only when own, fires onDelete).
- **NEEDS A DEVICE PASS:** delete today's daily → the composer reopens and you can repost; "view today's post" opens the real post; your own posts appear in your feed in chronological order; you cannot delete someone else's post (no trash button on others' posts).

### [ ] 2.35 — Onboarding required fields + keyboard  ·  ticket/onboarding-required-fields (2026-06-18)
What shipped: pet-owner onboarding now REQUIRES a pet name (already) and a valid, available **@handle** before you can continue. The @handle rule lives in a pure, tested util (`validateHandle.js`): lowercase alphanumerics + `_`/`.`, 3–20 chars, must start alphanumeric, not in the taken list. "Continue" is blocked with inline errors until it's valid; the auto-generate-on-skip shortcut is gone. Species stays the app's dog default. The step content is now wrapped in the proven `KeyboardAwareScrollView` so focused inputs scroll above the keyboard (numeric fields keep number/decimal pads).
- **No migration / no backend change** (the create shape already accepts these values).
- Exercised by mobile jest (handle format accept/reject; uniqueness; empty-skip blocked).
- **NEEDS A DEVICE PASS:** can't pass the handle step without a valid @handle; no onboarding input is hidden behind the keyboard; the Continue button stays reachable. (KeyboardAwareScrollView + the existing KeyboardAvoidingAnimatedView are both present — confirm there's no double-offset jump on focus.)

### [ ] 2.34 — Current-pet header sync (More shows active pet)  ·  ticket/current-pet-header-sync (2026-06-18)
What shipped: the More-landing orange header showed the PREVIOUS pet after switching or creating a pet because it read a one-time `AsyncStorage` "pet_profile" snapshot. It now sources name, avatar, breed and age from the reactive `useCurrentPet` (the single source of truth), so it updates instantly on switch/create — no app restart.
- **No migration / no backend.** Exercised by mobile jest (initial render shows the active pet; a hook change re-renders the header with the new pet; no-pet fallback shows "My Dog").
- **NEEDS A DEVICE PASS:** switch the active pet (or create a new one) → open More → the header reflects the new pet immediately (name + avatar + breed/age).

### [ ] 2.33 — Notifications filter chips layout fix  ·  ticket/notif-chips-fix (2026-06-18)
What shipped: the notifications filter chips (All / Walks / Feeding / Paws / Barks / Training) rendered as tall stretched rectangles because the horizontal `ScrollView` let its children stretch on the cross-axis. Added `alignItems:center` to the content container (chips size to their content) and `flexGrow:0` to the row (it no longer expands vertically). Pure style fix — filtering logic and data untouched.
- **No migration / no backend.** Exercised by mobile jest (all six chips render in a center-aligned horizontal row).
- **NEEDS A DEVICE PASS:** open the bell → the filter row reads as a neat row of compact pills (not tall rectangles); each still filters.

### [ ] 2.32 — Password security rules  ·  ticket/password-security (2026-06-18)
What shipped: new accounts must choose a stronger password. One shared rule (`src/app/api/utils/passwordStrength.js`): **≥ 8 chars AND ≥ 3 of {lowercase, uppercase, number, symbol} AND not in a common-password blocklist**. Enforced **server-side** in the sign-up/credentials path (`src/auth.js` throws a `WeakPassword` error when the rule fails) — the source of truth. The web sign-up form mirrors it with a **live strength meter + a requirements checklist** and keeps the **Create account** button disabled until the password is valid (and matches confirm).
- **No migration / no backend table.** **Login is deliberately untouched** — existing users with weaker passwords still sign in with whatever they have; the rule applies on sign-up (and any future password-change) only.
- Exercised by web vitest (validator: accepts strong, rejects short / low-variety / common / empty; meter: empty→0, common capped, per-class booleans, strong long → score 4).
- **NEEDS A QUICK BROWSER PASS** (mobile sign-up flows through this same web page in the AuthWebView):
1. Open `/account/signup` → type a weak password ("123456") → meter shows red/"Very weak", checklist unticked, button stays disabled. The server also rejects it if forced.
2. Type a strong one ("Sn!ffSpot1") → meter goes green, checklist ticks, button enables → account creates.
3. **Sign IN** with an existing account that has an old/short password → still works (not blocked).

### [ ] 2.29 — i18n English/Spanish  ·  ticket/i18n-spanish (2026-06-17)
What shipped: the app now has an **internationalization framework** (i18next + react-i18next + expo-localization). It defaults to the **phone's language** (Spanish on a Spanish phone, English otherwise) with a **Settings → Language** toggle (System default / English / Español) that switches **live** and **persists** (`pawpi:locale`). The **bottom-tab labels** and the **Settings** screen are translated; everything else falls back cleanly to English (a raw key is never shown), and new screens adopt `t("namespace.key")` from here. EN + ES catalogs ship with core keys (tabs, common buttons/empty/errors, settings, feed/health/services/search/messages/notifications headings) in neutral LATAM-friendly Spanish.
- **No migration / no backend.** New deps: `i18next` + `react-i18next` (pure JS) + `expo-localization@~17.0.8` (SDK-54). Works in Expo Go (no custom native needed beyond expo-localization, which is in the SDK).
- **Follow-up (not in this PR):** translate the deeper screens incrementally — Feed/daily composer, Health Today/Track/Insights/Vet Record bodies, the Services grid + each service screen, More menu, onboarding/auth, provider dashboard-facing strings. The catalog + `t()` pattern are in place; until then those screens render English (no raw keys).
- Exercised by mobile jest (t() resolves EN + ES for sample keys; device-locale `es` → Spanish, unknown → English; the Settings override switches + persists + applies on startup; a missing key falls back to English).
- **NEEDS A DEVICE PASS:**
1. On a **Spanish** phone the app opens in Spanish (tab labels: Inicio/Salud/Entrenamiento/Servicios/Más); on an English phone, English.
2. **More → Settings → Language**: switch to English / Español → the UI updates immediately; reopen the app → the choice persists. "System default" follows the phone.
3. An untranslated screen shows English (never a raw `key.name`).

### [ ] 2.30 — Adoption per-listing deep-link  ·  ticket/adoption-deeplink (2026-06-17)
What shipped: tapping an **"Adopt me"** card in the feed now opens **that exact dog's listing** (story, vitals, fee, apply/favorite/chat) instead of the generic Adoption hub. The card passes `{ listingId, providerId }`; the Adoption screen opens the listing's detail on mount. If the dog is gone/adopted it shows a graceful "no longer available" notice. Routes through the root-level `service/` stack (the 2.19 nav fix), so the **More tab is never corrupted** and back returns to the feed.
- **No migration / no backend.** Deviation from the ticket: the single-listing route (`adoptable-listings/[listingId]`) is **admin-only (no public GET)**, so the deep-open instead loads the place's **public** listings (available-of-published) and finds the dog there — works even before the browse list is open.
- Exercised by mobile jest (the card forwards its press; a deep `{listingId, providerId}` opens the detail modal on mount; no param → the hub with no modal; a missing listing → a graceful notice, no modal).
- **NEEDS A DEVICE PASS** — jest can't exercise real expo-router cross-tab nav:
1. From the **Feed**, tap an **Adopt me** card → that exact dog's detail opens (not the hub).
2. **Back** returns to the Feed; open **More** → it's the More landing (no corruption).
3. A removed/adopted dog's card → a clean "no longer available" notice (no crash, no fake dog).

### [ ] 2.28 — Daily photo shareable frame (IG/X)  ·  ticket/daily-share-frame (2026-06-17)
What shipped: a **Share** button on a daily post card produces a story-sized (9:16) **branded frame** — the dog's photo in a warm PawPi frame reading "[Dog name] is part of PawPi 🐾" — and opens the system **share sheet** (Instagram Stories, X, etc.) with an enhanced default caption for X. Optional + graceful (no crash if capture/sharing is unavailable). The BeReal daily-lock + posting flow + feed are **untouched**.
- **No migration / no backend.** New deps: `react-native-view-shot@4.0.3` + `expo-sharing@~14.0.8` (SDK-54 aligned). **NEEDS A DEV BUILD** — these are native modules, so the frame won't capture in Expo Go; test on a dev build / standalone. The share button degrades gracefully (no-op) where unavailable.
- Exercised by mobile jest (Share captures the off-screen card via view-shot and calls `Sharing.shareAsync` with the image + the enhanced text; the frame renders the real pet name; a locked post never captures/shares).
- **NEEDS A DEVICE PASS (dev build)** — jest can't render the real frame or open the share sheet:
1. Post the daily (or open your own daily post) → tap **Share** → the framed image looks cute and on-brand → the IG-Stories / X share sheet opens → it posts.
2. Eyeball the frame design (photo is the hero; warm palette; the "[name] is part of PawPi" tagline). Tats can tweak the art.
3. Posting / the daily lock / the feed behave exactly as before.

### [ ] 2.27 — Real owner↔owner messaging  ·  ticket/owner-messaging-real (2026-06-17)
What shipped: the phone's **social Messages/Chat** is now a **real** 1:1 owner↔owner DM backend (SEPARATE from the provider chat, which is untouched). A **Message** button on another pet's profile starts (or reuses) a private thread; the **Messages** inbox shows real threads (other person, last message, unread badge, newest first) and the **conversation** view sends text + photos, short-polls, and marks read on open. Mock conversations are gone (file deleted; no startup seeding). A pair always shares ONE thread (normalized), and only the two participants can read/post.
- ⚙️ **MIGRATION TO APPLY (in ACTION 1):** `0045_owner_messaging.sql` — `dm_threads` (normalized `user_a < user_b` + unique pair index) + `dm_messages`, both participant-scoped ENABLE+FORCE RLS, with the `app_is_dm_participant()` SECURITY DEFINER helper (mirrors 0031). Hand-apply after merge.
- Exercised by web vitest (thread create idempotent per pair + normalized; list scoped to me; send requires participation/sender=caller → 403 on RLS reject; mark-read), the real-Postgres harness (both participants see the thread / outsider zero; can't post as another or into a foreign thread; recipient marks read; helper resolves), and mobile jest (inbox list + empty state + tap-through; conversation render by sender, send, mark-read on open).
- **NEEDS A DEVICE PASS** — jest can't exercise the live chat or image upload:
1. Open another owner's pet profile → **Message** → a thread opens; send text and a photo → they appear.
2. The other account sees the thread in **Messages** with an unread badge; opening it clears the badge and shows only their side.
3. Messaging the same person again reuses the SAME thread (no duplicates).
4. A fresh account shows "No conversations yet"; the **provider chat** still works independently.

### [ ] 2.26 — Notifications on real data  ·  ticket/notifications-real (2026-06-17)
What shipped: the phone **Notifications** bell now shows **real** activity on your content — someone **pawed** your post, **barked** (commented), or **followed** your pet — merged with the existing local **reminder** notifications, filterable (All/Walks/Feeding/Paws/Barks/Training). Tapping a follow opens that pet's profile; a paw/bark returns to the feed; reminders behave as before. Unread styling + **Mark all read** (marks both sources). Mock notifications are gone (file deleted; no startup seeding). A notify never blocks the underlying action, and you're never notified about your own action.
- ⚙️ **MIGRATION TO APPLY (in ACTION 1):** `0044_notifications.sql` — `notifications` table (recipient/owner-scoped ENABLE+FORCE RLS) + the `app_notify(recipient, actor, type, subject_ref, body)` **SECURITY DEFINER** insert helper (lets the actor create a row for a different recipient; pinned search_path; GRANT EXECUTE to pawpi_app). Hand-apply after merge.
- Exercised by web vitest (paw/bark/follow each notify the content owner — not the actor; idempotent repeats don't double-notify; GET recipient-scoped; mark-read), the real-Postgres harness (recipient reads own / others read zero; recipient marks own read; a direct insert is denied; app_notify inserts cross-user + no-ops on self), and mobile jest (merged real + reminder render, filters, tap-through, mark-all, empty state).
- **NEEDS A DEVICE PASS** — jest can't exercise the live notify pipeline or real navigation:
1. Have a second account **paw / bark / follow** your content → a real notification appears in your bell, tappable (follow → your pet's profile; paw/bark → the feed).
2. Reminder notifications still appear and merge in; the filter chips work across both.
3. **Mark all read** clears the unread styling; a fresh account shows the empty state.
4. You never get a notification for your **own** paw/bark/follow.

### [ ] 2.25 — Search & Discover on real data  ·  ticket/feed-search-discover-real (2026-06-17)
What shipped: the phone **Search & Discover** screen is now backed by **real data** — the mock discovery data is gone (file deleted; startup no longer seeds it). Typing (debounced) searches real **pets** (name/breed/handle/species), **businesses** (published providers by name), and **pet parents** (username/full name) via a new `GET /api/search?q=`; with no query the screen shows **Discover** — real **Popular Profiles** (pets ranked by followers then paws received) and **Popular Pet Moments** (recent posts) via `GET /api/discover`. Tap-through: a pet/profile → the real pet profile (`/pet-profile?petId`), a business → its storefront (`/service/provider?slug`), a moment → its pet's profile. Public/RLS-scoped fields only (no medical/owner data). No migration. Empty → clean empty states ("No results" / "Nothing here yet"), no mock fallback.
- **No DB change** (reads existing pets/posts/pet_follows/post_paws/providers/user_profiles). Both routes select **public fields only**; vitest asserts no medical/private leakage and providers are published-only.
- Exercised by web vitest (search returns pets/owners/providers, public fields, short query → empty, no leakage; discover ranks by real signals) and mobile jest (Discover renders on first load, typing shows real results, tap-through routes, empty states; debounce).
- **NEEDS A DEVICE PASS** — jest can't exercise the live API or real navigation:
1. Open **Search** (Feed → search) → with no query, **Popular Profiles** + **Popular Pet Moments** show real pets/posts (or a clean "Nothing here yet" on a fresh DB).
2. Search a real dog name / breed / business → real results grouped into **Pets / Businesses / Pet parents**; a nonsense query → **"No results"**.
3. Tap a pet → its profile; tap a business → its storefront; tap a moment → that pet's profile.
4. Confirm there's no leftover mock content anywhere on the screen.

### [ ] 2.24 — Web bookings calendar view  ·  ticket/provider-calendar-view (2026-06-17)
What shipped: a **week/day calendar** in the provider dashboard (new **Calendar** sidebar entry, before Bookings) — dates are columns, times are rows, each booking sits in its start-hour cell showing the pet + what they booked, with a paid/unpaid dot and an in-store/house-visit marker. Navigate weeks/days + **Today**; switch **Week/Day**. Clicking a booking opens a detail popover with the full booking context (owner, service, pet species/breed, location + address, status, **value + paid/unpaid**, notes) and the existing **confirm / decline / cancel / assign** actions (reused from the inbox — not rebuilt). The list inbox stays available; the two cross-link ("Calendar view" ⇄ "List view"). Scoped to the active provider; switching providers recomputes. No migration. **Booking-context only — no medical data on this path.**
- **No DB change.** The calendar reads `GET /api/providers/[id]/bookings?view=calendar&from=&to=` — the same endpoint as the inbox, extended with a date-window branch that also joins `provider_locations` (location) and `orders` (value + paid). Cross-provider isolation + the no-medical-tables rule are asserted in vitest.
- **Web-only — verify in a browser** (provider-facing UI; on the deferred provider-device-pass posture):
1. Provider dashboard → **Calendar**: bookings land in the right day/time cells; paid/unpaid dot + location marker show.
2. Click a booking → the popover shows owner/service/pet/location/value/paid/notes; **Confirm/Decline/Cancel/Assign** work (same effect as the inbox).
3. **Today**, prev/next, and **Week/Day** navigate correctly; an empty week shows a clean empty grid (no fake events).
4. **Calendar view ⇄ List view** links switch between the two; switching the active provider recomputes (never another business's bookings).

### [ ] 2.22 — Provider storefront profile + posts  ·  ticket/provider-storefront-profile (2026-06-17)
What shipped: the public provider profile is now a **storefront** ("entering the store"). The provider sets a **cover image** and composes **posts** (text + photos) from a new **Storefront** section in the web dashboard (sidebar, after Profile); posts list with delete. An owner opening the provider on the phone sees the rich storefront — cover banner + logo, name/bio/links, rating + reviews, the **Services** menu (with 2.23 photos), an **Items** grid (the shop catalog summary; tap → the existing Shop), and a **Posts** feed (newest first). All real data; every section has an empty state and the storefront degrades to text when there's no media. Booking/chat/shop/reviews are **reused**, not rebuilt. No private data (staff/owner/payment/medical) is exposed; post author identity is never returned.
- ⚙️ **MIGRATION TO APPLY (in ACTION 1):** `0042_provider_posts.sql` — new `provider_posts` table (ENABLE+FORCE RLS: active-staff write/read-all + published-non-deleted public read) + an additive `providers.cover_image_url` column (rides providers' existing policy). Hand-apply after merge.
- Exercised by web vitest (public storefront route returns posts/items/cover, only public fields, paginated, no author identity; posts create/list/soft-delete; cover via the profile whitelist), the real-Postgres harness (provider_posts RLS: staff write + read-all incl. soft-deleted, published public read, pet-owner/outsider/other-provider-staff can't write, deny-by-default), and mobile jest (storefront renders cover/items/posts + degrades cleanly when empty).
- **NEEDS A DEVICE/BROWSER PASS** — jest/vitest can't exercise the real Storage upload, the live storefront render, or the Shop CTA navigation:
1. Web dashboard → **Storefront**: set a cover image; compose a post with text + photos → it appears in the Posts list; delete one → it disappears.
2. On the phone, open that provider's public profile: the cover banner, info/links, rating/reviews, Services (with photos), Items grid, and Posts feed all render with real data.
3. Tap an **Item** → the existing Shop opens. Tap **Book** / **Message** → the existing booking / chat flows open (not rebuilt).
4. A provider with no cover/posts/items shows clean empty sections (no fakes).

### [ ] 2.23 — Service & product image uploads  ·  ticket/service-product-images (2026-06-17)
What shipped: providers can attach **photos to their services and products** from the web dashboard — their "store". On the **Services** editor and the **Shop** product editor there's a multi-image uploader (add via the shared Storage path, **remove**, **reorder**) with thumbnails; the **Services** table and **Shop** list show a thumbnail of the first photo. Those images flow to the **public storefront / service menu** and the **shop catalog** (products already rendered images; services now do too). Real uploads only — no images shows a neutral placeholder (Package icon / text-only service). Max 8 images each; a non-array `image_urls` is rejected.
- ⚙️ **MIGRATION TO APPLY (in ACTION 1):** `0043_provider_service_images.sql` — one additive `provider_services.image_urls text[] not null default '{}'` column (shop_products already had it, 0037). No new table, no RLS change — it rides the existing provider_services admin-write / published-active public-read policies (0024). Hand-apply after merge.
- Exercised by web vitest (service/product save persists image_urls; bad shape → 400), the real-Postgres harness (image_urls rides provider_services RLS — admin writes, published public read returns them, plain staff can't), and mobile jest (service images render where present, none when empty).
- **NEEDS A DEVICE/BROWSER PASS** — jest/vitest can't exercise the real Storage upload or the live storefront render:
1. Provider dashboard → **Services** → add/edit a service → **Photos**: upload 2–3 images, reorder, remove one → Save → thumbnails persist and show in the list.
2. Provider dashboard → **Shop** → add a product with photos, and on an existing product tap **Photos** → upload/reorder/remove → Save photos → the first photo shows as the row thumbnail.
3. On the phone, open that provider's **public profile** (Services → its category → the provider): the service photos render; products show photos in the shop catalog/cart/checkout.
4. A service/product with no photos shows a clean placeholder (no fake images).

### [ ] 2.21 — AI-assisted enrichment from links (confirm-first)  ·  ticket/provider-link-enrichment (2026-06-17)
Web dashboard only — **verify in a browser, no on-device check.** On the provider Profile there's an **"Import from the web"** button: it reads the business's saved links (2.20) and PROPOSES a draft (a description from the website, and address/phone/hours/photos from Google Places). **Nothing is saved until the provider reviews and clicks Save** — confirm-first; unverified data never goes live. IG/FB are link-only (never scraped). No migration. **Dormant behind keys.**
- ⚙️ **GO-LIVE (Tats, already in ACTION 1):** set `GOOGLE_PLACES_API_KEY` + `ENRICHMENT_LLM_KEY` when ready. Until then **Import** shows a clean "not set up yet" (503) — nothing auto-fills, nothing crashes.
1. Provider dashboard → Profile → **Import from the web** (with keys set): the Bio pre-fills from the website; a toast notes any address/phone/hours/photos found (added via Locations/Services). Review, edit, then **Save** — only then does it persist.
2. With keys NOT set: Import shows the clean "not set up yet" message; nothing changes.
3. A bad/unreachable link doesn't break the import — the other source still fills what it can.

### [ ] 2.20 — Provider onboarding: business links  ·  ticket/provider-onboarding-links (2026-06-17)
What shipped: a business can add its **website, Instagram, Facebook, and Google Maps** links at onboarding (and edit them later on the profile). They're **optional** (onboarding stays fast) and show up read-only as tappable chips on the public provider profile. These links are also the INPUT that ticket 2.21 (AI enrichment) will read.
- ⚙️ **MIGRATION TO APPLY (in ACTION 1):** `0041_provider_links.sql` — four additive nullable columns on `providers` (website_url, instagram_url, facebook_url, google_maps_url). No new table, no RLS change (they ride the existing any-authed-read / owner|admin-write policy). Hand-apply after merge.
1. Mobile: More → list your business → create one → the form has optional **Links** (Website / Instagram / Facebook / Google Maps); fill some, leave others blank → it saves.
2. Open the business's public profile (Services → its category → the provider) → the links you entered show as tappable chips and open correctly; blank ones are simply absent (no fake/empty links).
3. Web dashboard → Profile → edit/add the same links → save → they persist and show on the profile.
4. Links are never required — creating with none works fine.

### [ ] 2.19 — More-tab navigation corruption fix  ·  ticket/nav-more-tab-fix (2026-06-17)
What shipped: the long-standing bug where opening a service (e.g. Services → Veterinary) and tapping back corrupted the **More** tab — More would reopen *inside* the service screen and only an app restart recovered it. **Root fix:** the shared service screens (Vet, Telehealth, Grooming, Walking, Daycare, Sitting, Training, Shop, Adoption, and the provider profile) moved OUT of the More tab's stack into a **root-level `service/` stack** that presents over the tabs — so opening a service from ANY tab (Services grid, Training tab, Feed cards, owner Hub) never buries the More root, and **back returns to the tab you came from**. Belt-and-suspenders: each tab now pops its stack to root when you leave it (`popToTopOnBlur`), so any in-progress pushed screen / routine-creation modal is torn down on a tab switch. No migration. **NEEDS A DEVICE PASS** — jest can't exercise real expo-router navigation.
1. **Services → Veterinary** (or any service) → **back** → you're back on **Services** (not the wrong section).
2. After visiting a service, tap **More** → it opens the **More landing page** every time (no stale service screen, no app restart needed).
3. Repeat from the **Training** tab (→ "Hire a trainer"), the **Feed** suggestion cards (→ a provider / Adoption), and the **Hub** (→ Shop / Adoption) — none corrupts More.
4. Open the routine-creation flow (More → reminders), switch bottom tabs, come back → it's reset, not stuck mid-modal.
5. Confirm deep entry into each service screen still works and back behaves.

### [ ] 2.18 — Telehealth (vet video consult)  ·  ticket/telehealth (2026-06-17)
What shipped: a vet can offer **Telehealth** (a new service/capability) and an owner can book a **video consult** — all on the existing spine (booking + payment + chat + consent). New phone surface: **Services → Telehealth** lists telehealth vets (real data; empty → "No telehealth vets yet"). Booking a consult reuses the normal provider booking + payment flow (capability `telehealth`). "My consults" shows your video sessions with a **Join video consult** button. The vet writes the consult note via the existing clinical record, so it lands in your pet's **Vet Record**. Video vendor is **dormant behind keys** — until Tats sets them, Join shows a clean "Video consults aren't set up yet" (nothing crashes).
- ⚙️ **MIGRATION TO APPLY (in ACTION 1):** `0040_telehealth.sql` — `telehealth_sessions` (participant-scoped ENABLE+FORCE RLS) + widens the `provider_capabilities` and `vet_appointments` capability CHECKs to accept `telehealth`. Hand-apply after merge.
- ⚙️ **GO-LIVE (Tats, in ACTION 1):** set the video-vendor env keys (`VIDEO_API_KEY`/`VIDEO_API_SECRET`/`VIDEO_BASE_URL`, `VIDEO_PROVIDER`) when ready. Until then consults still book + show the Join button, which returns the clean "not set up yet" message.
1. Onboard a business and tick **Telehealth (video vet)** (multi-select) → it appears under **Services → Telehealth** in discovery.
2. As an owner, open **Services → Telehealth** → pick a vet → book a consult (pay, or see the clean "payments not configured" message).
3. At the slot, open Telehealth → **My consults** → **Join video consult** → opens the room (or the "video not set up yet" message until keys exist).
4. After the vet writes the consult note, it appears in the pet's **Vet Record**.
5. Privacy: only you (owner) and the assigned vet can join/see a consult — no third party.

### [ ] 2.17 — Shop auto-reorder charger (subscription cron)  ·  ticket/subscription-autocharge (2026-06-17)
Backend-only, web app. **No on-device check** — nothing in the phone UI changes (until payment keys exist every charge cleanly skips). Subscribing to auto-reorder now sets the first charge date (one cadence out); a new machine-to-machine endpoint `POST /api/payments/subscriptions/run` re-buys each DUE plan (product × quantity) through the same payment layer as a normal shop order, then advances the next charge date. Rx products never auto-reorder; period-stable idempotency key prevents double-charging; one bad sub never breaks the run.
- ⚙️ **MIGRATION TO APPLY (already in ACTION 1):** `0039_subscription_due_fn.sql` — a SECURITY DEFINER enumerator function only (no table; completeness guard unaffected). Hand-apply after merge.
- ⚙️ **GO-LIVE (Tats, already in ACTION 1):** (a) apply 0039; (b) set `CRON_SECRET` in the web `.env`; (c) wire an EXTERNAL scheduler (host cron / CI cron) to `POST /api/payments/subscriptions/run` with the `x-cron-secret` header daily — PawPi has no built-in scheduler. Until then the endpoint returns a clean 503.
- Exercised entirely by the test harness (web vitest + real-Postgres RLS + DEFINER proofs).

### [ ] 2.16 — Encrypt provider payment tokens at rest  ·  ticket/encrypt-payment-tokens (2026-06-17)
Backend-only, web app. **No on-device check** — nothing in the phone UI changes. Provider MercadoPago OAuth tokens are now AES-256-GCM encrypted before they're written to the DB and decrypted only in-process for a charge/refund; a DB dump never shows a usable token. No migration (ciphertext fits the existing text columns); RLS unchanged. **Go-live action already listed in ACTION 1:** Tats sets `PAYMENTS_TOKEN_KEY` (32-byte) in the web `.env` BEFORE the first real provider connects a payment account (until then the connect flow returns a clean 503; pre-existing plaintext rows still decrypt via passthrough). Exercised entirely by the test harness (web vitest + integration).

### [ ] 2.15 — Mobile business onboarding: multi-service select  ·  ticket/provider-capabilities-mobile (2026-06-17)
What shipped: when you create a business on the phone, the "business type" step is now a **multi-select** — you tick **one OR MORE** services (Vet, Groomer, Dog walker, Daycare/boarding, Pet sitter, Trainer, Pet shop, Adoption/shelter). The business is saved with ALL the services you picked, so it shows up under **every** one of those in discovery (a real "vet shop" can finally be created on a phone). **No migration, web backend unchanged** (the web POST already accepted the `capabilities[]` array — this just feeds it).
1. More → list your business (or the Services entry) → **Create your business** while logged in.
2. The services step lets you tap **several** options and they all stay highlighted (not radio — multiple stick). A "Selected: …" line lists your picks.
3. Pick e.g. **Vet + Pet shop**, enter a name, **Create business** → succeeds.
4. Open **Services → Veterinary** AND **Services → Shop**: the business appears under **both**.
5. Try to create with **no** service selected → blocked with "Please choose at least one service."

### [ ] DEV-NATIVE-UPLOAD — Native photo/video upload re-test (shared `fetch.ts` path)
Not tied to one ticket — a standing device check flagged in the roadmap follow-ups. The visit/session media
uploads (walk-session photos, sitting-visit photos/video, daycare report-card media, grooming before/after,
provider posts, etc.) all go through the shared native upload path (`fetch.ts`). It is **jest/CI-green but
unverified on a real device** since the native iOS upload work. Re-test on a physical phone: pick + upload a
photo AND a video from at least two of those flows; confirm the file lands in Supabase Storage and renders
back in-app. If it fails → it becomes a fix ticket (Cowork will write it); if it passes → delete this entry.

### [ ] 2.14 — Dashboards & analytics (provider overview + owner hub)  ·  ticket/dashboards-analytics (2026-06-17)
What shipped: two "at a glance" overview screens that tie the super-app together — and they ONLY ever show data you already have access to (a business sees only its own numbers; you see only your own stuff). **Provider web dashboard HOME** (the `/provider` landing page, also a new "Dashboard" item in the sidebar): your business at a glance — **total revenue** (from paid orders), a **revenue-by-month** line chart, a **bookings-by-month** bar chart, **occupancy** (dogs currently on-site + booked ahead for daycare), your **average star rating** + review count, your **top services**, and your **upcoming bookings** list (which links into the full Bookings inbox). All charts use the existing recharts library. Every number is scoped to the **active business only** — switching businesses (if you staff more than one) recomputes for that one; you can never see another business's revenue/bookings. **Owner mobile hub** ("My Hub", new item under the More tab): one place showing **My bookings** (upcoming + past across ALL services — vet, groomer, walker, daycare, etc.), **My orders** (your shop history), **Auto-reorder** (your active shop subscriptions), **Who has access** (which providers can see your pets), and **Saved dogs** (your favorited adoption listings). It does NOT duplicate those screens — each section **links into** the real feature screen. Empty everywhere → clean empty states, never fake numbers. **No migration** — these are read-only summaries over existing tables; the deferred anonymized-predictions analytics layer stays OUT of scope.
1. **Provider dashboard (web):** sign in as a business owner/staff and open the provider dashboard — it now lands on a **Dashboard** home (not straight into Bookings). Confirm you see revenue, the two charts (revenue by month + bookings by month), occupancy, average rating, top services, and an upcoming-bookings list.
2. Confirm the numbers match **only that business** — e.g. revenue equals your paid orders, the rating is your reviews' average, upcoming bookings are yours. If you staff **two** businesses, switch with the provider switcher and confirm every figure recomputes for the selected one (never a blend, never the other's data).
3. With a brand-new business that has no orders/bookings/reviews yet, confirm each card shows an **empty state** ("No paid orders yet", "No bookings yet", etc.) — no fake metrics.
4. Tap **Inbox** (or the upcoming list) → it opens the full Bookings screen (the dashboard links into it, doesn't replace it).
5. **Owner hub (phone):** open **More → My Hub**. Confirm **My bookings** shows your upcoming + recent past appointments across every service (with the provider + pet + service names), **My orders** shows your shop order history, **Auto-reorder** shows your active subscriptions, **Who has access** shows the providers you've granted access to, and **Saved dogs** shows your favorited adoption listings.
6. Confirm each hub section **links into** the real screen (My orders / Auto-reorder → Shop; Who has access → Data Access; Saved dogs → Adoption) rather than duplicating it.
7. With a fresh account (no bookings/orders/grants/favorites), confirm every hub section shows its empty state — no fakes.
8. Sanity on isolation: a second owner's bookings/orders/favorites never appear in your hub, and a second business's revenue never appears in your dashboard.

### [ ] 2.13 — Feed integration (businesses/adoptable dogs in the social feed)  ·  ticket/feed-providers (2026-06-17)
What shipped: the social feed now occasionally shows **"Discover a business"** and **"Adopt me"** suggestion cards mixed in between your friends' pet posts — for organic discovery. These are a **separate, clearly-different card type** (dashed border, a sage/peach tint, a "DISCOVER A BUSINESS" / "ADOPT ME" label) — they are **never** disguised as a pet's daily moment. They appear at a **capped cadence** (at most one after every few posts, max 3 per feed, never two in a row, never on a very short feed) so the feed never feels spammy. The business cards come from **published providers** (with their star rating from reviews) and the adoption cards from **available adoptable dogs of published places** — public info only, no private/owner/medical data. Tapping a business card opens that provider's profile; tapping an adoption card opens the Adoption browse page. The daily BeReal post-lock and the existing feed order are **completely untouched** (the suggestion cards only appear in the already-unlocked feed and only between posts). **No migration** — it reuses existing published-provider and adoptable-listing data.
1. **Post your daily photo** to unlock the feed (the BeReal lock must still work exactly as before — you can't see the feed until you post, and it unlocks right after you post).
2. Scroll the unlocked feed. After a few pet posts you should occasionally see a **"Discover a business"** card (a published business with its name + star rating) and/or an **"Adopt me"** card (an adoptable dog photo + name). They look clearly different from pet posts (dashed border, colored tint, a label).
3. Confirm they are **capped** — NOT after every single post, never two in a row, and a very short feed shows none.
4. **Tap a "Discover a business" card** → it opens that business's profile page.
5. **Tap an "Adopt me" card** → it opens the Adoption page.
6. Check the cards show **no private data** — only business name/type/rating and the dog's public profile (name/breed/age/photo/fee). No owner names, no medical info, no application data.
7. If you have no published businesses or adoptable dogs yet, the feed simply shows your pet posts with no suggestion cards (no fakes).

### [ ] 2.12 — Adoption module  ·  ticket/adoption (2026-06-17)
What shipped: a full **Adoption** experience. A shelter/rescue (an "adoption place" = a provider with the `adoption` capability — same onboarding/profile/staff as any provider) lists its adoptable dogs **in the same rich dog-profile format** the app already uses for pets (photo, breed, age, gender, size, story, good-with-kids/cats/dogs, energy, vaccination status, adoption fee). Owners discover places, browse the dogs, **favorite**, **apply**, **chat with the shelter** (reuses the existing messaging), and **pay the adoption fee / donate** (reuses the existing payment layer). When the shelter **approves** an application, the dog is **created as the adopter's own pet** so it flows into their normal Health/Social/Services experience, and the listing is marked **adopted**. The old mock "Coming soon" Adoption card is **replaced** — Adoption is now live. Shelter management (list dogs, review applications, approve/decline) is in the **provider web dashboard → Adoption**.
- ⚙️ **MIGRATION TO APPLY TO SUPABASE:** `supabase/migrations/0038_adoption.sql` — creates `adoptable_listings` (the adoptable dog, dog-profile fields, provider-owned), `adoption_applications` (listing_id, applicant, answers, status submitted/under_review/approved/declined), and `adoption_favorites`, each with ENABLE+FORCE RLS: a published place's **available** listings are readable by any signed-in user (discovery), shelter staff write; applications — the applicant sees only their own, shelter staff see only their place's; favorites are owner-private. Also adds the `app_approve_adoption()` function that performs the approval → new-pet transfer atomically. Hand-apply AFTER merge; until then it runs only in the test harness, not on live data.
1. **Services → Adoption** is now **live** (no longer "Coming soon") and opens the Adoption screen (it replaces the old mock).
2. **Browse:** you see adoption places, each with their dogs shown as **dog-profile cards** (photo, breed, age, the good-with chips, fee). Empty? You get a clean "No adoption places yet" message — no fake dogs.
3. Tap a dog → the full dog-profile detail opens (story, vitals, vaccination summary, fee).
4. **Favorite** a dog (heart) → it shows under the **Favorites** tab; unfavorite removes it.
5. **Apply to adopt** → confirmation appears; the application shows under the **Applications** tab as "Submitted". Applying to the same dog twice is blocked.
6. **Chat with shelter** → opens a conversation thread with the place (same chat as the rest of the app).
7. **Pay adoption fee / Donate** → opens the payment flow, OR shows **"payments not available / not configured"** if keys aren't set up yet (nothing crashes, nothing charges).
8. **Shelter side (web dashboard → Adoption):** add a dog, see it listed; an incoming application can be marked under-review, **declined**, or **approved**.
9. **Approval → your pet:** after the shelter approves your application, the dog appears as **your pet** under My Pets (you can open its health/profile like any pet), and the listing flips to **Adopted**.

### [ ] 2.11 — Shop / e-commerce  ·  ticket/shop-ecommerce (2026-06-17)
What shipped: **Shop is now LIVE** in Pet Services. An owner browses **pet shops** (real published providers, no fake data), opens a shop's **catalog**, adds products (food, toys, supplies) to a **cart**, and **checks out** — payment runs through the existing payment layer (split → the shop gets paid), exactly like every other paid service. When a product is paid for, the shop's **stock automatically goes down**; if an order is refunded, the stock **goes back up** — a sold-out product can never be bought. Owners can set a product on **auto-reorder** (a subscription: e.g. monthly dog food) and **cancel** it anytime, and they can see their **order history** with each order's payment + delivery status. **Prescription products are gated**: a med flagged "Rx" can only be bought for a pet that has a real **vet relationship** (an active vet connection or a recorded vet note) — otherwise checkout is blocked with a clear message. On the **shop's side** (provider dashboard), the shop manages its **products/inventory** and its **incoming orders' fulfillment** (placed → shipped → delivered). Privacy is enforced at the database: an owner sees only their own orders, a shop sees only its own orders, prices are taken from the catalog server-side (never trusted from the app), and only providers that actually offer a shop can use any of it. Discovery is the shared provider search (`?type=shop`). No fake products — empty states only.
- ⚙️ **MIGRATION TO APPLY TO SUPABASE:** `supabase/migrations/0037_shop_ecommerce.sql` — creates `shop_products` (provider_id, name, description, `image_urls[]`, price_cents, currency, stock_qty, category, `is_rx` flag, active) with ENABLE+FORCE RLS (a **published shop's ACTIVE products are readable by any authed user** for discovery; **writes are provider-admin only**); REUSES the 2.3 `orders`/`order_items`/`payments`/`subscriptions` tables (does NOT duplicate them), adding only: `order_items.product_id` (FK to the SKU), `orders.fulfillment_status` (placed/paid/shipped/delivered/cancelled), and `subscriptions.product_id` + `quantity` (the auto-reorder target). Adds three SECURITY-DEFINER helpers: `app_adjust_order_stock(order, ±1)` (the payment layer decrements on paid / restocks on refund without granting buyers catalog write), `app_set_order_fulfillment(order, status)` (the shop advances shipping WITHOUT touching the owner-only payment-status machine), and `app_pet_has_vet_relationship(pet)` (the **Rx gate** — an active grant to a vet-capable provider OR a recorded vet note, mirroring the consent model). Hand-apply AFTER merge; until then the shop runs only in the test harness, not on live data.
1. Open **Services → Shop** — it is now a **live, tappable** card (no longer "Coming soon").
2. The Shop screen lists published shops (real data) or shows a friendly **"No shops available yet"** empty state — no fake shops. Tap a shop to open its **catalog**.
3. Add one or more products to the **cart** (use +/−; a **sold-out** product can't be added). The cart bar shows the total; tap **Checkout**.
4. Checkout **pays via the payment layer**: if payment keys are configured you're sent to the checkout window; **if no keys are set you get a clear "payments not configured" message** (never a crash). The order then appears under the **Orders** tab.
5. **Stock decrements:** as the **shop** (provider dashboard → products/inventory), confirm the purchased product's **stock went down** after the order is paid (and back up if you refund it via the payment tools).
6. **Auto-reorder:** subscribe to a staple product, then open the **Auto-reorder** tab — the plan is listed; **Cancel auto-reorder** stops it. (Prescription products cannot be set to auto-reorder.)
7. **Rx gate:** try to buy a product flagged **Rx** for a pet with **no vet connection** — checkout is **blocked** with a "requires a prescription" message. Connect the pet's vet (or have a vet note on file) and the same purchase is allowed.
8. **Privacy/fulfillment (shop side):** the shop sees its **incoming orders** and can advance **fulfillment** (shipped/delivered); a different account cannot see another owner's orders or another shop's catalog/orders — confirmed by the harness RLS proofs.

### [ ] 2.10 — Training module  ·  ticket/service-training (2026-06-17)
What shipped: **Training is now LIVE** in Pet Services — the **PROVIDER training service (hiring a real trainer)**, which is **DISTINCT from the existing self-Training tab** (the static, do-it-yourself how-to lessons). The two never collide: the self-Training tab keeps its content and now also shows a single **"Want a pro? Hire a trainer"** banner that links into this new service. A trainer offers three things (all reusing the same booking + payments + chat as the other services): a **1:1 session**, a **group class** (capacity-limited, many attendees), and a **program** (a package of N sessions). An owner books, and for a program **progresses through the sessions** while the **trainer logs progress notes** (owner-visible) and can attach **video lessons** the owner watches in-app. **Group-class capacity is enforced** at the database level — a join that would push a class past its seat count is refused. Privacy is enforced at the database: an owner sees **only their own pet's progress** (never another owner's), and a trainer can only write to a pet they've been **granted access to** (the same consent rule as vet notes). Only providers that actually offer training can use any of it. Discovery is the shared provider search (`?type=trainer`). No fake data — empty states only.
- ⚙️ **MIGRATION TO APPLY TO SUPABASE:** `supabase/migrations/0036_training_module.sql` — creates `training_programs` (a per-pet/owner/provider program **enrollment**: title, total_sessions, status, program-level `video_lesson_urls[]`), `training_sessions` (the scheduled **occurrences**: kind one_on_one|group_class|program, a `capacity` for group classes, status), and `training_progress` (the per-(session, pet) **attendance + trainer progress note** + per-session `video_lesson_urls[]`; this is ALSO the group-class **roster** row that capacity counts). All three ship ENABLE+FORCE RLS: `training_programs` + `training_progress` are **owner FOR ALL + provider-via-grant** (`app_provider_has_grant(pet_id,'health_logs_write')`) so the owner sees only their own pet's progress and the trainer only with an active grant; `training_sessions` is **active-staff-manage + published-provider-public** (owners browse classes to join). Group-class capacity reuses the daycare **count-based** overbook guard (count live attendees, refuse at capacity). Hand-apply AFTER merge; until then training runs only in the test harness, not on live data.
1. Open **Services → Training** — it is now a **live, tappable** card (no longer "Coming soon"), and the header makes clear it is **"Hire a trainer"** (distinct from the self-Training tab).
2. Open the **self-Training tab** (bottom nav) — it still shows the **how-to lessons**, plus a new **"Want a pro? Hire a trainer"** banner that opens the Services → Training screen. The two are clearly separate, not duplicated.
3. On the Training service screen, you see published trainers (real data) or a friendly **"No trainers available yet"** empty state — no fake trainers.
4. Tap **Book training** → pick a service: **1:1 session**, **Group class**, or **Program**. For a **program**, set the number of sessions; for a **group class**, pick a class from the list (each shows **X / N seats**); confirm.
5. As the **trainer** (provider dashboard → **Training**): create a **1:1 / group class / program** session (set a class capacity), then expand a class and **log a progress note** (mark attended).
6. Back as the **owner**, open **Services → Training** → under **Your training** the program shows **X of N sessions completed**, the trainer's **progress notes**, and any **video lessons** to watch.
7. **Group-class capacity:** with a class at capacity for overlapping attendees, joining another pet shows **"This class is full"** (HTTP 409) — no overbooking. A cancelled join frees the seat.
8. **Privacy:** a different account (not the owner, without a grant) can NOT see the pet's progress or notes — confirmed by the harness owner-own-only + provider-grant RLS proofs.

### [ ] 2.9 — Pet sitting module  ·  ticket/service-sitting (2026-06-17)
What shipped: **Pet Sitting is now LIVE** in Pet Services. An owner books an in-home **drop-in visit**, an **overnight**, or a **house-sit** (reusing the same booking flow as the other services, tagged for sitting), and a drop-in can be booked as a **recurring weekly pack** instead of a single visit. Before committing, the owner can request a **meet-and-greet** — a lightweight intro step so owner and sitter align first; the meet-and-greet conversation happens over the existing provider **chat** (nothing new was built for messaging). The **sitter logs each visit** with a note (and photos/video, plus an optional location check-in), and the **owner reads those visit updates** on the Pet Sitting screen. Privacy is enforced at the database: a visit's **notes, photos, video and location are visible only to the owner and the assigned sitter** — not to other owners, outsiders, or even other sitters of the same company. Only providers that actually offer sitting can use any of it, and a sitter can only write to a pet they've been granted access to (the same consent rule as vet notes). Discovery is the shared provider search (`?type=sitter`). No fake data — empty states only.
- ⚙️ **MIGRATION TO APPLY TO SUPABASE:** `supabase/migrations/0035_sitting_visits.sql` — adds `vet_appointments.meet_and_greet` (a boolean flag, default false, that tags a booking as the pre-engagement intro step; the booking lifecycle is otherwise unchanged, and the `provider_bookings` view is re-created to expose it) and creates `sitting_visits` (booking link, pet/owner/provider/assigned-sitter, visit time, status scheduled/completed/cancelled, notes, photo URLs[], video URLs[], optional check-in lat/lng) with ENABLE+FORCE **participant-scoped RLS** (the owner reads/writes their pet's visits; the **assigned** active sitter-staff reads/writes only the visit they're assigned to — the visit-media guard, mirroring walk sessions). Hand-apply AFTER merge; until then sitting visits run only in the test harness, not on live data.
1. Open **Services → Pet Sitting** — it is now a **live, tappable** card (no longer "Coming soon").
2. The Pet Sitting screen lists published sitters (real data) or shows a friendly **"No sitters available yet"** empty state — no fake sitters.
3. Tap **Book a sitter** → choose a service: **Drop-in visit**, **Overnight**, or **House-sit**; pick a date; add notes.
4. Flip **"Meet & greet first"** → the button becomes **"Request meet & greet"**; after booking, use **Messages** to coordinate the intro with the sitter (the existing chat — no new messaging).
5. For a **Drop-in visit**, flip **"Recurring drop-ins"** to book a **weekly pack** (Mon/Wed/Fri) instead of a single visit.
6. As the sitter (sitter workspace), the booked sitting job appears → tap **Log visit** → write an update → **Post update**.
7. Back as the **owner**, open **Services → Pet Sitting** → the update appears under **Visit updates** (note + any photos/video + a check-in location if the sitter shared one).
8. **Privacy:** a different account (not the owner, not the assigned sitter) can NOT see the visit or its media — confirmed by the harness participant-RLS proofs (incl. another sitter of the same company seeing zero).

### [ ] 2.8 — Daycare & boarding module  ·  ticket/service-daycare (2026-06-17)
What shipped: **Daycare & Boarding is now LIVE** in Pet Services. A facility sets its **capacity** (how many pets it can hold) and the **vaccines it requires**; an owner **books a stay** for a date range and leaves **feeding + medication instructions**; the facility **checks the pet in and out** and posts **daily report cards** (mood, meals, activities, notes, photos/video) that the owner sees. Before a stay, the pet's **vaccination status** is checked against the facility's requirements and shown as **pass / fail with the missing vaccines listed**. The facility reading the pet's vaccinations is **consent-gated** — it requires the owner's medical-read grant (the same consent rule as vet records); it never reads vaccines without permission. **Overbooking is prevented** at the database level: a stay that would push a location past its capacity (counting other stays whose dates overlap) is refused. Stays and report cards are private: the **owner** sees their own; the **facility** sees only pets it has been granted access to. Discovery is the shared provider search (`?type=daycare`). No fake data — empty states only.
- ⚙️ **MIGRATION TO APPLY TO SUPABASE:** `supabase/migrations/0034_daycare_boarding.sql` — adds `provider_locations.capacity` (occupancy ceiling, nullable = unlimited) and creates `daycare_requirements` (the facility's required vaccines, per provider/location — staff/published-provider read, owner|admin write), `daycare_stays` (booking link, pet/owner/provider/location, start/end dates, status booked/checked_in/checked_out/cancelled, feeding + med instructions, check-in/out stamps — owner FOR ALL + facility via an active health_logs_write grant), and `report_cards` (per-stay daily card with mood/meals/activities/notes/photo URLs — scoped through the parent stay). All three new tables ship ENABLE+FORCE RLS with policies; the vaccine check reuses `pet_vaccinations` (the source of truth) through the consent path — nothing is duplicated. Hand-apply AFTER merge; until then daycare runs only in the test harness, not on live data.
1. Open **Services → Daycare & Boarding** — it is now a **live, tappable** card (no longer "Coming soon").
2. The Daycare screen lists published facilities (real data) or shows a friendly **"No facilities available yet"** empty state — no fake facilities.
3. Tap **Book a stay** on a facility → pick a **start and end date** (a multi-day stay), add **feeding** and **medication** instructions, confirm → the stay appears under **Your stays** as **Booked**.
4. The stay shows a **vaccine status**: ✅ "Vaccinations up to date" or ⚠️ "Missing required vaccines" with the missing ones listed — based on the facility's required vaccines vs. your pet's records.
5. On the **provider dashboard** (web) → **Daycare**: the facility sees the stay in **Occupancy**, your **feeding/med instructions**, and can **Check in**, then **Check out**, or **Cancel**.
6. On the dashboard, tap **Check vaccines** on a stay — if the owner has **shared medical access** it shows pass/fail; if not, it says **"Owner consent needed"** (it never reads vaccines without permission).
7. The facility posts a **report card** (date, mood, meals, activities, notes) → it appears on the owner's stay under **Report cards** (photos show if attached).
8. **Overbooking is refused:** with a facility location at capacity for overlapping dates, booking another overlapping stay shows **"The facility is fully booked for those dates"** (HTTP 409) — no overbooking.

### [ ] 2.7 — Dog walking module (live GPS)  ·  ticket/service-walking (2026-06-17)
What shipped: **Dog Walking is now LIVE** in Pet Services. An owner books a walk — **on-demand** (a one-off slot) or a **recurring weekly pack walk** — reusing the same booking flow as vet/grooming, just for walking. The assigned walker **checks in** to start the walk, the phone tracks the route by **GPS**, and the **owner watches the route grow live on a map** in the app. When the walker **finishes**, a **walk report** (distance, duration, route, potty pee/poo, notes) is saved and the same walk is added to the pet's **Health timeline** (the existing walk-log path — not a new one). Live tracking uses **short polling** (the same lightweight approach as chat) — no heavy realtime infra. Privacy is enforced at the database: a walk's **live location is visible only to the owner and the assigned walker** — not to other owners, outsiders, or even other walkers of the same company. Only providers that actually offer walking can use any of it, and a walker can only write to a pet they've been granted access to (same consent rule as vet notes).
- ⚙️ **MIGRATION TO APPLY TO SUPABASE:** `supabase/migrations/0033_walk_sessions.sql` — creates `walk_sessions` (booking link, the live GPS route as a JSON point array, status scheduled/in_progress/finished/cancelled, distance/duration, potty pee/poo, notes, photo URLs) with ENABLE+FORCE **participant-scoped RLS** (the owner reads/writes their pet's sessions; the **assigned** active walker-staff reads/writes only the session they're assigned to — the live-location guard). Hand-apply AFTER merge; until then walk sessions run only in the test harness, not on live data.
1. Open **Services → Dog Walking** — it is now a **live, tappable** card (no longer "Coming soon").
2. The Walking screen lists published walkers (real data) or shows a friendly **"No walkers available yet"** empty state — no fake walkers.
3. Tap a walker → its profile → **Book**: pick a date/time for an **on-demand** walk, or flip **"Repeat weekly (pack walk)"** for a **recurring** booking → the request is sent.
4. As the walker (walker workspace), the booked walk appears → tap **Start** to check in (grant location permission). The existing walk timer opens.
5. While the walk runs, move around — GPS points are posted on a short throttle.
6. Back as the **owner**, open **Services → Dog Walking** → a **"Walk in progress"** banner appears → tap it → the **live map** shows the route growing (refreshing every few seconds).
7. As the walker, **Finish** the walk (note any potty + a note).
8. As the owner, the live screen flips to the **walk report** (distance / time / route / potty / notes); the **Recent walks** list shows it too.
9. Open the pet's **Health** → the finished walk appears in the **timeline** (as a walk, via the existing health-log path).
10. **Privacy:** a different account (not the owner, not the assigned walker) can NOT see the live location or the session — confirmed by the harness participant-RLS proofs (incl. another walker of the same company seeing zero).

### [ ] 2.6 — Grooming module  ·  ticket/service-grooming (2026-06-17)
What shipped: **Grooming is now LIVE** in Pet Services. A groomer publishes a service menu (bath / full groom / nail trim / spa), an owner books a groom (reusing the same booking flow as vet, just for grooming), and after the appointment the groomer can log the session — **before/after photos** and a **coat/skin note**. The before/after photos show up on the **pet's profile**, and the coat/skin note flows into the pet's **Health timeline** (the existing health-log path — not a new one). Owners can opt a groom into a **recurring "every 6 weeks" cycle**, which uses the existing reminder engine to nudge a re-book. A groomer can only write to a pet they've been granted access to (same consent rule as vet notes), and only providers that actually offer grooming can use any of it.
- ⚙️ **MIGRATION TO APPLY TO SUPABASE:** `supabase/migrations/0032_grooming_sessions.sql` — creates `groom_sessions` (before/after photo URLs + coat/skin notes + products + next-due) with ENABLE+FORCE RLS (owner reads/writes their pet's sessions; a groomer reads/writes only with an active `health_logs_write` consent grant). Hand-apply AFTER merge; until then grooming sessions run only in the test harness, not on live data.
1. Open **Services → Grooming** — it is now a **live, tappable** card (no longer "Coming soon").
2. The Grooming screen lists published groomers (real data) or shows a friendly **"No groomers available yet"** empty state — no fake clinics.
3. Tap a groomer → its profile → **Book**: pick a date/time and (optionally) flip **"Repeat every 6 weeks"** → the booking request is sent.
4. As the groomer (provider side), log the session for that pet: add **before/after photos** + a **coat/skin note**.
5. Back as the owner, open the **pet profile** → a **Grooming** section shows the before/after photos + the note. Before any session exists it shows an empty state.
6. Open the pet's **Health** → the groomer's **coat/skin note** appears in the timeline (as a general check).
7. The recurring groom (step 3 with "Repeat" on) creates a reminder via the existing engine — confirm the re-book nudge appears.
8. A provider that does **not** offer grooming cannot log a groom session (the request is refused) — and you can't book a groom with a non-groomer.

### [ ] 2.5 — Owner ↔ provider chat / messaging  ·  ticket/chat-messaging (2026-06-17)
What shipped: pet owners and service providers (vets, and later walkers/sitters/etc.) can now **message each other** in private 1:1 conversations. On the phone there is a **Messages** screen (your list of conversations) and a **conversation view** (send text + attach a photo); you start a chat from a provider's profile or it can be tied to a booking. The provider's web dashboard gets a **Chats** section (was a "coming soon" stub) with the same list + conversation. Each conversation shows an **unread badge**. The conversation refreshes itself on a short timer (lightweight polling — no heavy realtime infra was built). Privacy is enforced at the database: **only the two parties (the owner and that provider's active staff) can ever see or post in a thread** — nobody else, and you can't post as someone else; removed staff lose access immediately.
- ⚙️ **MIGRATION TO APPLY TO SUPABASE:** `supabase/migrations/0031_chat_messaging.sql` — creates `message_threads` (owner ↔ provider, optional booking link) + `messages` (text + optional image attachment + read stamp), both with ENABLE+FORCE **participant-scoped RLS** (visible/writable only to the owner OR active staff of the provider; the sender must be the caller). Hand-apply AFTER merge; until then chat runs only in the test harness, not on live data.
1. Open **Services → Veterinary** → tap the **Messages** icon (top-right): with no chats yet you see a friendly empty state ("No conversations yet").
2. Open a **vet clinic profile** → tap **Message** → a conversation opens. Type a message and send it → it appears in the thread.
3. From the conversation, tap the **photo button**, pick an image → it uploads and shows as an attachment in the thread.
4. Go back to **Messages** → your conversation is listed with the clinic name + the last message; the most recent chat is on top.
5. **Unread count:** have the clinic side reply (via the provider web dashboard **Chats** section), then re-open the app → the Messages list shows an **unread badge**; opening the conversation clears it.
6. **You only ever see your own threads:** a different account never sees your conversation — each side sees only the chats they're a participant of (this is enforced by the database, proven in the test harness).
7. (Provider web) Sign in to the **provider dashboard → Chats**: the owner's messages appear; reply from there → it shows back on the phone.

### [ ] 2.4 — Generalized booking + calendar (all capabilities)  ·  ticket/generalized-booking (2026-06-17)
What shipped: booking now works for **any** kind of service — grooming, walking, daycare, sitting, training — not just vet, all on one booking model. The existing booking screen was generalized: it shows the right wording/icon for whatever service you're booking and tells the provider which capability it's for. Providers can now mark a booking **completed** (which is what unlocks leaving a review), and the system can hold a weekly availability schedule, generate open time-slots, and **block double-bookings** of the same staff member at the same time. A recurring-booking rule (for repeating walks/daycare) and an optional deposit link (to the payments layer) are carried on the booking. A 2-way external-calendar-sync hook is **stubbed** behind an interface (no real Google/Apple sync yet). **The vet booking flow and its reminders are untouched** — a plain vet booking behaves exactly as before.
- ⚙️ **MIGRATION TO APPLY TO SUPABASE:** `supabase/migrations/0030_generalized_booking.sql` — extends `vet_appointments` (PATH a: it is already the booking table with RLS + reminders, so this is the lowest-risk path) with the generalized columns (capability, slot start/end, recurrence_rule, deposit order_id), widens booking_status to allow `completed`, adds a partial-unique index that prevents double-booking, adds the new `provider_availability` table (ENABLE+FORCE RLS: published provider's windows public-read, writes owner|admin), and adds a `provider_bookings` VIEW that inherits the booking RLS. Hand-apply AFTER merge; until then it runs only in the test harness, not on live data.
1. **Vet still works end-to-end:** Open **Services → Veterinary → pick a clinic → Book appointment**, choose a date/time, Confirm → the request sends and shows in your appointments (your existing vet loop, unchanged). The icon/wording still says "appointment".
2. **A non-vet capability can be requested (once those service modules light up):** when a provider offers e.g. grooming, opening its booking form shows grooming wording/icon and the booking is tagged as that capability. (Until the grooming/walking/etc. screens ship in later tickets, this is exercised in the test harness.)
3. **Double-book is prevented:** two bookings for the **same staff member at the same time slot** cannot both be requested — the second is refused with a "time slot no longer available" message.
4. **Complete unlocks reviews:** a provider marking a confirmed booking **completed** is what lets the owner leave a review (ties into 2.2) — confirm a vet booking, mark it completed, and the Write-a-review button appears.

### [ ] 2.3 — Payments foundation (backend scaffold, key-stubbed)  ·  ticket/payments-foundation (2026-06-17)
What shipped: the money layer for the marketplace — database tables + strict access rules + a provider-agnostic payment engine with two payment rails wired in but DORMANT until accounts/keys exist. Owners pay, the platform keeps a commission, the provider gets paid out (split payments). **There is NO phone UI in this ticket and NO live money flow yet** — it's a scaffold, so there is nothing to tap-test on a device. It is exercised entirely by the test harness (web vitest + real-Postgres RLS).
- **No on-device check applies.** The routes return a clean "payments not configured" message until Tats sets up the accounts/keys below, so nothing crashes and nothing charges.
- ⚙️ **MIGRATION TO APPLY TO SUPABASE:** `supabase/migrations/0029_payments_foundation.sql` — creates the money tables (provider_payment_accounts, orders, order_items, payments, payouts, subscriptions) each with ENABLE+FORCE RLS (money = strictest: owner sees only their own orders/payments; provider staff see their provider's; provider tokens are admin-only and NEVER visible to owners; payouts are provider-only). Hand-apply AFTER merge; until then the money tables run only in the test harness, not on live data.
- ⚙️ **ACTION FOR TATS — accounts + keys (sandbox first, do NOT block the merge):**
  1. **MercadoPago:** create a MercadoPago **marketplace application** (OAuth client) in the developer dashboard. Copy the **Client ID** and **Client Secret**. Generate a **webhook secret**. Register the **redirect URI** `https://<domain>/api/providers/<id>/payment-accounts/mercadopago/callback` and the **webhook URL** `https://<domain>/api/payments/webhooks/mercadopago`.
  2. **Binance Pay:** create a **Binance Pay merchant account**, generate an **API key + secret**, and register the webhook URL `https://<domain>/api/payments/webhooks/binance`.
  3. **Set env keys** in the web app's `.env` (template in `anything/apps/web/.env.example`): `MP_CLIENT_ID`, `MP_CLIENT_SECRET`, `MP_WEBHOOK_SECRET`, `MP_REDIRECT_URI`, `BINANCE_PAY_API_KEY`, `BINANCE_PAY_API_SECRET`, and `PLATFORM_COMMISSION_BPS` (e.g. `500` = 5%). NEVER commit real values — `.env` is gitignored.
  4. **Per-provider connect:** each provider completes the MercadoPago OAuth connect (start link from `GET /api/providers/<id>/payment-accounts/mercadopago/connect`, finished via the callback) and/or records their Binance handle (`POST /api/providers/<id>/payment-accounts/binance`). The token is stored server-side and never shown to owners.
  5. Use **sandbox/test mode** end to end before going live.

### [ ] 2.0 — Pet Services in the main nav  ·  PR #111 (merged 2026-06-17)
What shipped: the bottom bar is now **Feed · Health · Training · Services · More** (Community moved into More).
1. Bottom bar shows Feed, Health, Training, **Services**, More — Community is gone from the bar.
2. Tap **Services** → Pet Services opens; **Veterinary** is the only live/tappable one.
3. Tap **Veterinary** → vet list → pick a clinic → booking flow works (your existing vet loop).
4. Tap **More** → find **Community** → opens and works (search, filters, back button).
5. Nothing else broke — Feed, Health, Training, rest of More all open normally.
6. (2.0 follow-up, PR #113) The Services screen is a full grid: Veterinary live (tappable → vet), and Grooming/Walking/Daycare/Sitting/Training/Shop/Adoption show as dimmed **"Coming soon"** cards that do **nothing** when tapped. More no longer has leftover Adoption/Pet Shop entries.

### [ ] 2.2 — Reviews & ratings surfacing  ·  ticket/reviews-surfacing (2026-06-17)
What shipped: pet parents can leave a star rating + written review **only after a completed appointment** with a provider, and those ratings now show up where you browse vets. Each completed appointment can be reviewed once; providers can never write, edit, or delete a review.
- ⚙️ **ACTION FOR YOU/COWORK — apply migration to Supabase:** `supabase/migrations/0028_rls_provider_reviews_surfacing.sql` (opens the public-read window on a published provider's reviews, keeps writes owner-only, and adds the one-review-per-completed-booking guard column + index). Hand-apply it after merge; until then reviews run only in the test harness, not on live data.
1. Open **Services → Veterinary**: each vet card shows a star rating + count, or a muted **"New"** when a clinic has no reviews yet (no fake numbers).
2. Tap a clinic → its profile shows the same rating up top and a **Reviews** section (real reviews, or a "No reviews yet" empty state).
3. Book a vet, then open that appointment and **Mark as completed**. Re-open the completed appointment → a **Write a review** button now appears.
4. Tap **Write a review**, pick 1–5 stars, optionally add a note, **Submit** → it posts; the new rating shows on the clinic profile + the vet card.
5. Try to review the **same completed appointment twice** → it won't let you (one review per visit).
6. An appointment that is **not** completed (or one you typed in manually with no provider) shows **no** Write-a-review button — you can't review without a real completed booking.

### [ ] 2.1 — Provider capabilities (backend only)  ·  PR #114 (merged 2026-06-17)
No phone UI — backend foundation so one business can offer many services. Nothing to tap-test.
- ⚙️ **ACTION FOR YOU/COWORK — apply migration to Supabase:** `supabase/migrations/0027_provider_capabilities.sql` (creates the `provider_capabilities` table + backfills from each provider's current type). Hand-apply it after merge; until then the new capability features run only in the test harness, not on live data.
- ⚠️ **Heads-up:** the backfill maps each existing provider's `provider_type` to a capability. If any live provider has a non-standard/free-text `provider_type`, it gets **no** capability and won't show in discovery until an admin adds one. Tell me if you have such providers.

---

## Passed (archive)
_Nothing yet._
