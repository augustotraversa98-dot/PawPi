# PawPi — Launch Checklist (v1 → App Store)

**One linear path to submission.** Work top to bottom. Detail for any step lives in
`docs/app-store-submission-runbook.md` + `docs/app-store-connect-content.md` +
`docs/app-store-privacy-data-map.md`. Legend: 🖥️ = you, on your Mac · 🌐 = App Store Connect (ASC) web ·
⚖️ = legal · ✅ = already done by the build work.

Your constants: Team ID `YHQ4T9T96K` · ascAppId `6785949610` · bundle `com.pawpi.app` ·
Expo projectId `e1ab38b2-5f41-4d15-bc18-64c8b0717a3d`.

---

## Phase 0 — Legal must go live first (it gates the ASC privacy URL)

- [ ] ⚖️ Have a lawyer review the EN + ES **Privacy Policy** and **Terms** drafts in `docs/legal/`
      (use `docs/legal/LEGAL-REVIEW-CHECKLIST.md`). They're stamped DRAFT — this is the one step that
      isn't optional before a public launch.
- [ ] 🖥️ Publish the reviewed EN + ES policies to the hosted **`pawpi-legal`** GitHub Pages site.
- [ ] 🖥️ Point `EXPO_PUBLIC_PRIVACY_POLICY_URL` / `EXPO_PUBLIC_TERMS_URL`
      (`anything/apps/mobile/src/constants/legal.js` / env) at the live URLs. The ASC **Privacy Policy
      URL** must equal the hosted **EN** Privacy Policy URL.

## Phase 1 — Apple one-time setup

- [x] ✅ Apple Developer Program enrolled; Team ID + ascAppId known.
- [ ] 🌐 Create the app record if it doesn't exist: **My Apps → + → New App** — iOS · Name **PawPi** ·
      Primary language **English (U.S.)** · Bundle ID **com.pawpi.app** · SKU **PAWPI-IOS-001**.
- [ ] 🌐 Enable **Push Notifications** on the `com.pawpi.app` App ID (Certificates, IDs & Profiles).
      Don't change the bundle id.
- [ ] 🖥️ `npm i -g eas-cli` → `eas login`.
- [ ] 🖥️ Fill your **`appleId`** in `anything/apps/mobile/eas.json` (`submit.production.ios`); the
      `ascAppId` + `appleTeamId` are already there.
- [ ] 🖥️ Create the **APNs key** (lights up iOS push from BN2): from `anything/apps/mobile` run
      `eas credentials` → iOS → Push Notifications → let EAS create/upload the `.p8`.
- [ ] 🖥️ *(optional)* Create an `EXPO_ACCESS_TOKEN` and set it on the Railway web service (only needed
      for push receipts; the send layer no-ops without it).
- [ ] 🖥️ Create the **reviewer demo account** by signing up *inside the app* with the
      `app-store-connect-content.md` §10 credentials, and hand-fill one dog + a few posts + a couple of
      reminders + one vet-record entry (the global demo seed is correctly hidden from real feeds, so this
      review account is a normal account you populate by hand — important so no tab looks empty for the
      reviewer).

## Phase 2 — Build

- [ ] 🖥️ Test gates: `cd anything/apps/mobile && npm test` then
      `cd anything/apps/web && npm test && npm run test:integration`. The integration run
      enforces the DB safeguards (RLS on every public table; `SECURITY DEFINER` search_path
      pinned) — see `docs/rls-hardening.md` + CLAUDE.md → "Database migration conventions".
- [ ] 🖥️ **Supabase advisors (security + performance):** run both and triage anything new
      before shipping. Via the Supabase MCP: `get_advisors` with `{ type: "security" }` then
      `{ type: "performance" }` (or Dashboard → Advisors). Expect the known baseline from
      `AUDIT_2026-09.md`; any NEW security finding is a blocker. After applying `0126`/`0127`
      (see `docs/db-migration-runbook-0126-0127.md`) re-run and confirm the anon/authenticated
      exposure and the `current_app_user_id` search_path warning are gone.
- [ ] 🖥️ Confirm `app.json` `expo.version` = `1.0.0` (EAS auto-manages the build number).
- [ ] 🖥️ Build: from `anything/apps/mobile` → `eas build --platform ios --profile production`.
- [ ] 🖥️ Install the resulting build on your iPhone via **TestFlight** (this is your on-device test rig).

## Phase 3 — On-device verification (the punch list — do it on the TestFlight build)

- [ ] 📱 **Nav fix (PP1):** open Search → tap a pet → tap a photo. Each should **push with a back
      button**, no more stacked pop-ups. Swipe/back returns one level cleanly.
- [ ] 📱 **Spanish permission prompt (PP2):** on a Spanish-language device, trigger the camera prompt —
      it should appear in Spanish. (If not, `expo prebuild --clean` before rebuilding.)
- [ ] 📱 **Fake data gone (night-run A2a):** create a **fresh** account → Discover/Search should be an
      honest new-app state with **no "Mango"** or fake fans.
- [ ] 📱 **Business Settings (BX4/BN2):** business Profile → Settings shows the grouped notification
      categories; Log out works.
- [ ] 📱 **Core flows:** onboarding → create pet → set a reminder → post → book a provider → cancel →
      delete account. Anything broken → tell me, it becomes a quick fix ticket.

## Phase 4 — Deliver the binary

- [ ] 🖥️ `eas submit --platform ios --profile production` (uploads to ASC; does **not** submit for review
      yet).

## Phase 5 — ASC listing (paste from `app-store-connect-content.md`)

- [ ] 🌐 **App Information:** Subtitle · Category **Lifestyle** · Content Rights · Age Rating (§8 → ~13+).
- [ ] 🌐 **Privacy Policy URL** = hosted EN Privacy Policy URL (from Phase 0).
- [ ] 🌐 **Pricing:** Free.
- [ ] 🌐 **Version metadata**, both locales — add **English (U.S.)** and **Spanish** (§13): Promo text,
      Description, Keywords, Support URL, Marketing URL, What's New.
- [ ] 🌐 **App Privacy** questionnaire — declare exactly what `app-store-privacy-data-map.md` lists
      (Contact Info, User Content, Location precise+coarse, Identifiers incl. push token, Purchase
      History; **no Tracking**, no third-party ads, Diagnostics None, **Data deletion = Yes**).
- [ ] 🌐 **Screenshots:** iPhone **6.9"** (1290×2796) + **6.7"** (1284×2778), 3–10 each, the 8 hero
      screens from §12. iPhone-only (no iPad). Spanish screenshots optional (ASC reuses EN if omitted).

## Phase 6 — Submit for review

- [ ] 🌐 Attach the uploaded build to the **1.0** version.
- [ ] 🌐 **App Review Information:** paste reviewer notes (§10) — demo login, external-payments rationale
      (**3.1.3(e)**), account-deletion path (**5.1.1(v)**), location usage, health positioning (**1.4.1**),
      UGC moderation (**1.2**) + contact.
- [ ] 🌐 **Export compliance:** No (exempt encryption; `ITSAppUsesNonExemptEncryption:false` is set).
- [ ] 🌐 **Add for Review → Submit.**

## Phase 7 — After submission

- [ ] 🌐 Watch for ASC review messages; answer with the reviewer notes if asked.
- [ ] 🌐 On approval: choose manual or auto release.
- [ ] 📱 Post-release device check: push arrives (APNs live), legal links open, delete-account works.

---

### The critical path (what blocks what)
Legal reviewed + published (Phase 0) → is the only hard blocker for the ASC privacy URL.
APNs key (Phase 1) → required for iOS push to actually deliver.
Everything else can proceed in parallel once the build exists. The **first thing to start today** is the
**legal review** (it has the longest lead time — it's out of your hands once it's with a lawyer), while you
run Phase 1 Apple setup in parallel.
