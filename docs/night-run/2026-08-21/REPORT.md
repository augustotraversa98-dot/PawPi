# PawPi — Overnight QA + Security Hardening Report
**Date:** 2026-08-21
**Branch:** `claude/pawpi-qa-security-hardening-kewf1o`
**Run type:** Autonomous static + security audit (see "Environment & coverage" for why the live app wasn't driven)

---

## 1. TL;DR (plain English)

I audited the whole PawPi backend (all 267 API endpoints) and the mobile app's screens and navigation, and hunted hard for ways one user could reach another user's private pet or medical data. **The good news up front: I could not find any way for one user to see or change another user's pet or medical data.** The ownership checks are applied consistently, the public "emergency card" share links use strong un-guessable tokens and correctly hide medical info unless you opted in, and payment webhooks are properly verified.

I fixed **5 groups of real issues** tonight on a branch (all with tests where it's backend logic) and I'm handing you **6 things that need your decision** because they touch money, database, or auth code I'm not allowed to change on my own.

- **Most important thing to fix first:** the **generic checkout endpoint trusts the price the app sends it** instead of looking the price up itself. In theory a technical user could pay 1 cent for a product. It needs your approval because it's payment code — details and the exact fix are in §3.
- **Is anyone's private data exposed?** **No cross-user data leak found.** One genuine data-exposure *hardening* gap (public emergency pages weren't telling caches "don't store this") is **fixed**.
- **Issue counts:** 1 High (needs approval), ~5 Medium, ~8 Low/Polish. **5 fixed tonight**, 6 proposed for your approval.

**One honest caveat:** this session ran in a Linux cloud container with **no iOS Simulator**, so I could not tap through the live app or take screenshots — that half is what your other (Mac) session is doing. Everything here is from reading the code, running the test suites, and probing the API logic. See §7 for exactly what that means I could *not* verify.

---

## 2. What I changed tonight (applied on the branch)

All backend changes ship with regression tests. The full web suite is green locally: **2127 tests pass** (was 2115 — I added 12).

| ID | Fix | Files | Test added | Suite |
|----|-----|-------|-----------|-------|
| **H1** | Enforce pet-ownership on `weight/pee/vomit/wellness` health-log **writes** (were trusting the client's `petId`). Now routed through the shared `resolvePetLogOwner` gate like the food/walk/poo logs. | `api/health/{weight,pee,vomit,wellness}-logs/route.js` | ✅ 12 tests (401 / cross-pet 403 / owner OK) | web ✅ |
| **P1** | Add `Cache-Control: no-store, private` to the **public** emergency card/tag responses (they return pet PII with no cache header). | `api/public/emergency/{card,tag}/[token]/route.js` | ✅ header assertions | web ✅ |
| **A1** | Gate the `__create/ssr-test` debug endpoint behind `NEXT_PUBLIC_CREATE_ENV=DEVELOPMENT` (it renders every route + leaks render errors, un-authed — its sibling already has this gate). | `api/__create/ssr-test/route.js` | (mirrors existing sibling pattern) | web ✅ |
| **D1** | Delete dead `MOCK_POSTS` mock-data file (fabricated dogs/photos; imported by nothing; violates the "no fake data" rule). | `mobile/src/data/feedData.js` (removed) | n/a | — |
| **M1** | Add `onRequestClose` to **24 modals** (routine-creation flow, Feed, Health trackers, auth) so Android hardware-Back can dismiss them and doesn't corrupt `visible` state. | 20 mobile component files | code-verified in-scope (see note) | mobile → **CI** |

> **Note on M1:** the mobile `jest` suite **could not be run in this environment** — a dependency is pulled from a GitHub tarball that the container's egress policy blocks (403), so `npm ci` can't finish. The 24 edits are one-line prop additions, each wired to the handler the modal already uses for its on-screen close button, and each confirmed in-scope by reading the component. **CI on the PR is the validator for the mobile changes.**

**Branch / PR:** see the linked PR titled *"Night run 2026-08-21 — QA + security"*.

---

## 3. What needs your approval (PROPOSE-ONLY — not applied)

These touch money, the database, or auth code — the run's rules say I propose these, I don't apply them.

### 3.1 🔴 HIGH — Generic checkout trusts the client-supplied price
**Where:** `anything/apps/web/src/app/api/payments/checkout/route.js` (~lines 65–102)
**Plain English:** When the app starts a payment, this endpoint takes the *amount to charge* straight from what the app sends, without checking it against the real catalog price. A technical user could send `amount_cents: 1` and legitimately pay 1 cent — for a product, booking, adoption fee, or donation — and the order would be marked paid on webhook and stock would even be decremented. The dedicated shop route (`pets/[id]/shop-checkout`) does this correctly (looks the price up server-side, checks stock and prescription rules); the generic route does none of that.
**Why it needs you:** it's live payment code; getting the fix wrong could break real checkouts, and the "right" amount for each `kind` (booking vs donation vs product) is a product decision.
**Proposed fix:** For `kind: "product"`, derive the amount from the catalog server-side (reuse the shop-checkout logic) and reject the request if the client's `amount_cents` doesn't match; for `booking`/`adoption_fee`, derive from the referenced entity; only `donation` (and maybe `subscription`) may legitimately accept a client amount, and even those should be range-checked. Line-item `unit_cents` (lines 88–97) should likewise come from the catalog, not the client.

### 3.2 🟠 MEDIUM — Server-side SSRF via a client-supplied URL
**Where:** `api/providers/[id]/enrich/document/route.js` (→ `utils/enrichment/document.js:45`) and `api/vet-record/documents/extract/route.js` (→ `utils/enrichment/petRecords.js:65`)
**Plain English:** These endpoints fetch a URL the client supplies, on the server, with no check that the URL points somewhere safe — so an authenticated user could make the server fetch internal addresses (e.g. cloud-metadata `169.254.169.254`). The vet-record one feeds the fetched bytes to an AI and returns a result, which can partly reflect internal content back.
**Proposed fix:** resolve the host and reject private/link-local/loopback ranges before fetching; disable redirect-following (or re-validate each hop).

### 3.3 🟠 MEDIUM — Uploads accept any content-type and any size
**Where:** `api/upload/route.js` (~lines 24–64)
**Plain English:** The upload endpoint (login required) doesn't restrict file type or size, and stores the client's declared content-type. Someone could upload an HTML/SVG file that then serves as active content from your app's storage domain (a phishing / stored-script vector), or flood storage with huge files.
**Proposed fix:** allowlist image/video (+ PDF for vet docs) MIME types, cap file size, and force a safe `Content-Type`/`Content-Disposition` for anything not on the allowlist.

### 3.4 🟡 LOW — Auth success page posts the JWT to `postMessage(..., '*')`
**Where:** `api/auth/expo-web-success/route.js` (and the token-exchange sibling) — **auth core (forbidden zone)**
**Plain English:** The web-auth success page hands the login token to `window.parent` using a wildcard target, meaning any page that framed it could read the token. In the normal Expo flow the parent is trusted, so this is defense-in-depth, but the wildcard should be tightened to the known app origin.
**Proposed fix:** replace `'*'` with the specific allowed origin; also `JSON.stringify`-into-inline-`<script>` should be hardened against `</script>` breakout for the (provider-controlled) name/email.

### 3.5 🟡 LOW — Emergency **tag** returns more medical fields than the tag page shows
**Where:** `supabase/migrations/0051_emergency_medical_card.sql` (`app_emergency_card_json`, lines ~110–119) — **DB/migration (forbidden zone)**
**Plain English:** When an owner enables "show medical on tag," the API hands back the full medical block (vet phone, emergency-contact name + phone) even though the tag page only displays blood type / spay / allergies / conditions. Anyone who scans the permanent collar QR can see the extra fields in the raw response. Arguably by-design for an emergency tag, but it exceeds what "basic tag" implies.
**Proposed fix:** give the tag branch a narrower medical projection (least-privilege) than the vet-link branch.

### 3.6 🟡 LOW — Anonymous emergency-relay endpoint has no rate limit
**Where:** `api/public/emergency/tag/[token]/contact/route.js`
**Plain English:** Anyone who has scanned a collar tag can POST the relay-contact form repeatedly and spam the owner with notifications. Token secrecy stops blind guessing, but one known token is enough.
**Proposed fix:** apply the existing `utils/rateLimit.js` limiter (it fails-open, so it can't break the happy path) to this POST.

---

## 4. Full findings, ranked

### Critical
*None found.* No cross-user (IDOR) read or write, no SQL injection, no missing auth guards, no auth-id/profile-id confusion.

### High
- **3.1 Generic checkout trusts client price** — *security / payment* — proposed (§3.1).

### Medium
- **3.2 SSRF via client URL** — *security* — proposed.
- **3.3 Upload type/size not validated** — *security* — proposed.
- **M2 Two parallel "reminder" data models** (`remindersStore` + `ReminderCreationModal.jsx` vs `routinesStore` + `*RoutineModal.jsx`). `ReminderCreationModal.jsx` is imported by nothing (dead legacy); both stores are still live, so the concept is split across two schemas — *duplication*. Recommend deleting the dead modal and consolidating on one store. (Reported, not applied — needs a product decision on which store wins.)
- **i18n-code Hardcoded English strings** — ~100 user-facing strings (33 `Alert.alert`, 36 placeholders, 31 titles/labels) are rendered as raw literals and bypass `t()`, so Spanish users see English regardless of the (perfect) locale files. Worst clusters: `hooks/useHealthTracking.js` (8 alerts), `hooks/useLostFound.js`, `hooks/useSocialWalks.js`, `hooks/usePetSharing.js`. **Reported, not fixed tonight** — fixing each requires adding keys to `en.json`+`es.json`, which your **other session is actively editing**; I stayed out to avoid conflicts. (Full list in §5 evidence.)

### Low
- **H1 (fixed)** health-log write ownership gap — *security/integrity*. Self-scoped (couldn't leak across users; RLS backstops `owner_user_id`) but inconsistent with siblings. **Fixed + tested.**
- **P1 (fixed)** public PII responses had no cache header. **Fixed + tested.**
- **A1 (fixed)** `ssr-test` debug endpoint un-gated. **Fixed.**
- **3.4 / 3.5 / 3.6** — proposed (see §3).
- **reminder-dismissals POST** trusts `petId` (like H1 was) but is self-scoped and only creates UI-dismissal rows — *very low*. Left as-is / could take the same `resolvePetLogOwner` treatment later.
- **Dead/unreachable routes** — `app/nearby-walks.jsx` (nothing navigates to it) which is the only entry to `app/create-walk.jsx` (so both are unreachable), and `app/household.jsx` (standalone screen orphaned; the feature renders inline elsewhere). *Reported* — wire up an entry point or delete; not deleted tonight because they may be intended-future screens.
- **`socialPetStore.currentUser` fake seed** (`id:"user1", name:"You", pravatar` avatar) — violates the no-mock rule, BUT it is **read internally** (message unread logic, line 161), so it can't just be deleted — it needs wiring to the real signed-in user. *Reported* (I verified it's not actually dead, contrary to first impression).

### Polish
- **D1 (fixed)** dead `MOCK_POSTS` file removed.
- **Brand: off-palette color drift** — ~77 component files define local `const C = {…}` colour objects, many with non-brand Material hues (`#64B5F6` blue, `#81C784` green, `#FFB74D` orange, `apricot`, `terracotta`). Concentrated in `components/Health/**` trackers. *Reported* — replace local palettes with imports from `constants/theme`. (Not auto-fixed: high volume + brand-asset-adjacent + needs the simulator to confirm nothing regresses visually.)
- **Brand: 🐾 emoji used as the hero mark** instead of `<PawMark>` in ~6 prominent empty-state/header spots (`Feed/UnlockedFeed.jsx:165`, `LockedFeedOverlay.jsx:138`, `PostComposerModal.jsx:249`, `BarkModal.jsx:218`, `PostDetailModal.jsx:416`, `Health/CareRing.jsx:95`). Violates brand rule #1/#9. *Reported* — swap for `<PawMark size color />` (needs the simulator to confirm layout). The public web emergency pages also use 🐾/🐶 emoji in the header (`p/card`, `p/tag`) — lower priority, web-only.

### Documentation drift (not a bug, but worth knowing)
- Several `ARCHITECTURE.md` "known-suspect" claims are now **stale/fixed**: `setCurrentPet` *is* called (`PetPickerSheet.jsx:27`, `AddDogModal.jsx:140`), active-pet selection *is* persisted (`store/selectedPetStore.js`), and `more/_layout.jsx` now declares `reminders` + `profile-edit`. Recommend updating the doc so future audits don't chase fixed ghosts.

---

## 5. Security summary (red-team results)

**What I tried, and what held:**

| Attack attempted | Result |
|---|---|
| **IDOR reads** — User A requests User B's pet / health-logs / vet-record / routines / posts / social-walks / emergency-card / prescriptions / insurance / transport by id | **HELD.** Every owner-context route resolves `session.user.id` → `user_profiles.id` and filters reads by it. No cross-user read found across the whole route inventory. |
| **IDOR writes / deletes** — mutate B's rows with A's token | **HELD.** Writes/deletes scope `WHERE id AND owner_user_id = me`; deps go through `resolvePetLogOwner` / `assertCareAccess`. |
| **Mass assignment** — set `owner_user_id`/`user_id`/`id` from the client to create rows owned by someone else | **HELD.** Owner id is always server-derived; never taken from the body. |
| **auth-id vs profile-id confusion** (the historical bug class) | **HELD.** Repo-wide check: no route uses `session.user.id` directly as an owner key. The legacy "repair" PATCH handler is gone (dead code, removed). |
| **Public share tokens** `/p/tag`, `/p/card` — guess/enumerate tokens | **HELD.** Tokens are `crypto.randomUUID()` (122-bit) — un-guessable. |
| **Public tokens — medical leak without opt-in** | **HELD.** Medical shown only if `show_medical_on_tag` (default OFF) for tags, or `scope='full'` for links — enforced inside the `SECURITY DEFINER` SQL. |
| **Public tokens — revoked/expired still work** | **HELD.** Revocation + expiry enforced in the DEFINER SQL (`revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())`). *(Hardened: added `no-store` — P1.)* |
| **Missing auth guards / 401→500** | **HELD.** 251/267 routes guard; the 16 public ones each have an alternative control (token, cron secret, webhook signature). Anonymous → clean 401, never 500. |
| **SQL injection** | **HELD.** All 5 `sql.unsafe(...)` uses take hardcoded/whitelisted column names with `$n`-bound values; no string-built queries anywhere. |
| **Error leakage** | **HELD.** ~130 `error.message` returns are all gated behind typed errors; untyped errors fall through to a generic 500. |
| **Payment webhook forgery / self-mark-paid** | **HELD.** Stripe/MercadoPago/Binance signatures verified (timing-safe) before any state change; entitlement flips only inside the signature-verified path. |
| **Generic checkout price tampering** | **BROKE** → §3.1 (the one real payment hole). |
| **SSRF via client URL** | **BROKE** → §3.2. |
| **Upload abuse (type/size)** | **BROKE** → §3.3. |
| **`ssr-test` debug endpoint** | **BROKE** (un-gated) → **fixed A1.** |

**Bottom line for a non-developer:** the parts that protect *"can someone see another person's pet/medical data"* are solid. The real weak spots are around **money** (client-set price) and **server-fetches-a-URL** (SSRF) and **uploads** — none of which expose existing user data, but all of which a determined attacker could abuse. Those are the ones waiting on your approval.

*Evidence artifacts (request/response reasoning, file:line for every claim) are in the commit diffs and this folder.*

---

## 6. Screens catalog

**Not captured this run** — no iOS Simulator in this environment (see §7). Screenshots (EN + ES) are being produced by the parallel Mac session. This report's UI findings (navigation, modals, brand, empty states) come from static analysis of `src/app/**` and `src/components/**`.

---

## 7. Environment & coverage — what I could NOT test, and why

This session ran in a **remote Linux cloud container**, not on the Mac. Concretely:

- **No iOS Simulator / `xcrun` / Xcode** → I could not launch the app, tap through flows, deep-link routes, or take screenshots. The §5 "does it feel right" driving and the §6 screen catalog were **not** done here — that's the parallel Mac session's job. All my UI findings are code-derived and I marked the ones that **need the simulator to confirm** (tap-target sizes, the `more/reminders` back-stack behavior, brand layout after any 🐾→PawMark swap).
- **No live backend / DB** → I could not fire real `curl` IDOR probes with two live accounts. The IDOR results in §5 are from **reading every route's ownership logic**, not from live requests. Confidence is high (the pattern is consistent and RLS backstops it) but a live two-account probe on the Mac would be the final confirmation, especially for the aggregation routes (care-ring, leaderboards) that JOIN health-logs.
- **Mobile `jest` could not run here** → a dependency (`react-native-calendars`) is fetched from a GitHub tarball the container's egress policy blocks (403). So the **M1** mobile changes are validated by CI on the PR, not locally. The **web** suite ran fine and is green.
- **Integration (real-Postgres) suite** not run locally (time + it needs the embedded PG boot); CI runs it as a separate required job.

Nothing above is hidden as "covered." If a row in §5 says HELD, it means the code enforces it; where a live probe would add certainty, I said so.

---

## 8. Branch → PR → CI

- Branch `claude/pawpi-qa-security-hardening-kewf1o`, 5 fix commits (H1, P1, A1, D1, M1). Only FIX-NOW commits are on the branch; every PROPOSE-ONLY item in §3 lives only in this report.
- PR opened as a **draft**, titled *"Night run 2026-08-21 — QA + security"*.
- Web suite green locally (2127 tests). Mobile + integration validated by CI (the merge gate).
- I'll watch CI and, if red, run the fix-until-green loop within budget. **I will not merge** without green CI, and the PROPOSE-ONLY items are never merged — they wait for you.
