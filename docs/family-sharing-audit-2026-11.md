# Family & caregivers sharing — Phase 1 audit (2026-11-23)

Scope: person↔person pet sharing (`pet_caregivers`, migration 0049, extended by 0102–0105 and 0120), the
`/api/pet-caregivers*` + `/api/household` routes, and the mobile screens/hooks (`pet-sharing.jsx`, `usePetSharing`,
`useCurrentPet`, EntryPoint routing). Method: code + migration reading, the real integration harness, and ONE read-only
production query that returned booleans and counts only (no ids, no personal data). **Nothing was changed.**

Identity chain used throughout: `auth_users.id → user_profiles.auth_user_id → user_profiles.id → pets.owner_user_id`
(and `pet_caregivers.owner_user_id / grantee_user_id` = `user_profiles.id`).

## 0. Bottom line

The **database** side of sharing is solid and well tested: RLS, expiry, revoke, owner-only delete, ownership-transfer guard.
The **product** around it is not usable for the real use case (a couple living with ONE dog):

1. **A person who only has a shared dog cannot use it.** `GET /api/pets` returns owned pets only; the app has no way to
   surface a shared pet as "current", and a shared-only account is routed to **onboarding, which creates a duplicate dog**.
2. A family member can **write** health logs but can never **read** them back (every health GET filters on
   `owner_user_id = caller`; family writes are anchored to the owner) — and routines / medical profile / emergency card
   are owner-only in the routes, so the `caregiver` role has nothing to see.
3. Invites are **name-search only**, deliver **no notification**, and need the invitee to already have a profile + username.
   There is no link / code path, and revoke / expiry / leave are silent or missing.

No cross-account **data leak** was found through the API. Production check (booleans/counts): 0049, 0102–0105, 0120, 0123 and
0128 are all applied; `pet_caregivers` is FORCE-RLS; the table holds **1 grant in total, 0 active, 0 pending** — i.e. the
feature has effectively never been used live, which is why none of this has been reported.

## 1. Verdict table — the 11 questions

| # | Question | Verdict | One-line answer |
|---|---|---|---|
| 1 | Invite mechanism | ❌ | In-app username/name search only (`GET /api/search` → `POST /api/pet-caregivers`). No email, link or code. Invitee must already have a `user_profiles` row. Apple Hide-My-Email is *not* a matching problem (nothing matches on email) but also *not searchable by email*, so the partner must be found by name/@handle. |
| 2 | Accept / decline / expiry / resend / revoke / leave / wrong account | ⚠️ | Accept/decline via `respond_pet_caregiver()` (pins grantee = caller, pending only) → **cannot be accepted by the wrong account**. No resend, no leave, no invite expiry, no notification. Expired grants still show "active". |
| 3 | Roles & permissions, server vs UI | ⚠️ | RLS is correct and strict. Routes expose far less than RLS allows (see §3). Nothing is *only* hidden in the UI; the reverse is the problem. |
| 4 | Shared pet in the invitee's app | ❌ | Not in `["pets"]`, pet selector, Feed, Health, More→My Dog. Shared-only user → onboarding. |
| 5 | Reminders / routines / notifications | ❌ | Grantee phone schedules nothing; completion is *not* shared across phones; owner's OS reminder isn't cancelled when a member logs. No push to members ever. |
| 6 | Social side | ⚠️ | Profile owner is always `pets.owner_user_id`. Family can post **daily moments only** (one per author per day); caregiver cannot post. Poster's `full_name` is shown on feed/day-card. Grantee is treated as a stranger by the daily-moment lock. |
| 7 | Security (RLS, non-member, revoked, cache) | ✅/⚠️ | Non-member and revoked/expired are denied by RLS (proven). Gaps are defence-in-depth (below). Revoked member's *app cache* stays up to 5 min. |
| 8 | Anything that creates a duplicate pet | ❌ | Yes — see §4. |
| 9 | Release map | ✅ | See §2. Everything except #747 is already in build 30. |
| 10 | Lifecycle (delete pet/account, revoke, leave) | ⚠️ | See §5. Pet delete does not exist; account delete **destroys member posts**; no leave. |
| 11 | UI vs RLS/API mismatches | ❌ | See §6. |

## 2. Release map (Q9)

EAS iOS builds (queried from EAS, `gitCommitHash` per build; all `channel=production`, `runtimeVersion=1.0.0`):

| Build | Version | Built from | Notes |
|---|---|---|---|
| 30 | 1.0.4 | `280fc814` (2026-10-26) | live per `docs/release-1.0.5.md` |
| 31 | 1.0.4 | `2d456ec7` (#734 keyboard fixes; includes #733 auth refresh) | |
| 32 | 1.0.5 | `6b105099` (#735 version bump) | |

Every sharing-related commit (0049 sharing #c7d68292, E13/E14 engagement 94486b8e·3f27049b·c49b08d6·76e49a58, FF2 caregiver
logging 5ae5362c, VR-B attribution 768051bd, duplicate-row race fix e2a4bd33, the i18n/a11y passes, launch-perf 539a3bbd)
is an ancestor of `280fc814` ⇒ **already in build 30, 31 and 32**. Between build 32 and `main` only these mobile commits exist:
#736–#746 (Spanish i18n passes), #741 (daily "le encantaría verte hoy" notification no longer fires twice) and
**#747 (Family & caregivers no longer throws a new owner into onboarding) — the only sharing-related PR that is main-only.**

- No native change since build 32 (`package.json`, lockfile, `app.json`, `eas.json`, `patches/` identical) ⇒ the next build
  (number 33, version 1.0.5 unless bumped) is a plain JS rebuild carrying #736–#747. **No OTA path**: runtime 1.0.0 / channel
  `production` are shared by every build, so mobile fixes reach users only through a new EAS build + store review.
- **Server fixes are decoupled**: Railway auto-deploys `main`, and DB migrations are hand-applied. A server/DB fix is live for
  *all* installed builds the moment it ships; a mobile fix needs build 33+. Phase 3 fixes should therefore be **server-first and
  backward compatible** (additive fields, old clients keep working).
- Production DB state for this feature (read-only check): 0049 ✅, 0102–0105 ✅, 0120 ✅, 0123 ✅, 0128 ✅ applied.

## 3. Permission matrix (Q3) — what RLS allows vs what the API exposes

R = route enforcement, **RLS** = policy. "—" = nothing. *italic* = allowed by RLS but unreachable through any route (dead capacity).

| Area | Owner | Family (co-manage) | Caregiver (viewer) | Non-member |
|---|---|---|---|---|
| Pet row (profile) | R+RLS rw | *RLS read+update*; route PATCH/GET owner-only (404) | *RLS read*; route 404 | RLS `pets_authed_read` = any signed-in user reads the full row; routes only return public columns |
| Social profile / handle / follows | rw | no (route owner-only; follow needs own pet) | no | read |
| Posts / paws / barks | rw | **daily moment only**, 1/author/pet/day (route; RLS checks only `user_id = me`) | no (403) | read, paw/bark as self |
| Care ring / streak / day-card / household leaderboard | rw | rw | read; ring+streak write via RLS (0102) | 404 |
| Health logs (12 `health_*`) | rw | **write** food/general/pee/vomit/walk/weight/wellness via `resolvePetLogOwner`; **read = empty** (GETs filter `owner_user_id = caller`); poo/medical-care/photo-check owner-only though RLS allows | route 403, no RLS policy | — |
| Routines + reminder_dismissals | rw | *RLS rw*; routes owner-only | *RLS read*; route 403 | — |
| Vet record: allergies/conditions/surgeries/labs/notes/documents | rw | GET+POST+extract, attributed `editor`; DELETE owner-only | 403 | 403 |
| Vaccinations, medications, preventive, vet_appointments, prescriptions, nutrition, insurance | rw | — (no policy, no route) | — | — |
| `pet_medical_profiles` | rw | *RLS read+update*; route owner-only | *RLS read*; route owner-only | — |
| Emergency card + links | rw | — | — | public only via token DEFINER fns |
| Private media / uploads | rw | GET `/api/media` + private upload | denied | denied |
| Managing sharing | invite / revoke | cannot invite, re-share or revoke; **cannot leave** | same | — |

Existing tests: `family-caregiver-rls` (RLS, 13 tests, passing on this machine), `caregiver-health-logs` (POST gating through the
real router), `vet-record-attribution`, `household`, `day-card`, `shared-ring`. **Not covered anywhere:** any grantee *read* of
health/routine routes, grantee `/api/media`+`/api/upload`, the daily-moment lock for a grantee, leave, revoke losing media access,
the other 17 family-policy tables, vet_notes family policy at table level.

## 4. Shared pet in the grantee's app + duplicate pets (Q4, Q8)

Evidence (all verified in code):
- `GET /api/pets` → `WHERE owner_user_id = ${userId}` (`pets/route.js:114-117`). The shared pet is not in the list.
- `useCurrentPet` (`usePetProfile.js`) resolves only against that list and its effect **resets `selectedPetId`** when the stored id isn't
  in it (`:44-53`), so a shared id can never be kept as "current". `household.jsx` calls `setSelectedPetId(dogId)` on tap and the
  effect reverts it — and `household.jsx` has **no entry point at all** (no `router.push("/household")` anywhere; orphaned screen).
- 126 files read the current pet from this hook (Feed, Health, More, bookings, vet record, reminders) ⇒ all empty for a shared-only user.
- `determinePetsRoute.js`: 0 pets + not a business ⇒ `/onboarding-photo`. #747 fixed the *More → Family & caregivers* path; the cold-launch
  routing for a shared-only account is unchanged.
- The Manage tab for a user with no dog says "Add your dog first / Primero sumá a tu perro" (`petSharing.noPetTitle`) — it *tells a
  shared-only user to create a dog*.

**Every path that can create a second pet row for the same real dog:**
1. Shared-only account → EntryPoint → onboarding wizard (no "I'm a caregiver" exit).
2. The wizard's re-check (`onboardingGuard`, re-read of `/api/pets` at submit) sees owned pets only → passes for a shared-only user; also fail-open on network errors.
3. `POST /api/pets` has **no duplicate / idempotency guard** (only the handle is checked; no handle → an auto-generated free one) → a retry after a lost response creates a second dog.
4. Transient empty list on a cold launch with nothing cached → onboarding (guarded only when pets were cached earlier in the session).
5. `AddDogModal` (More) has no similar-pet check.

## 5. Invite, accept, expiry, wrong-account (Q1, Q2)

- Invite: `useSearch` → `GET /api/search` (owners branch, `username/full_name ILIKE`, excludes banned/demo/blocked, rate-limited `search_query`) →
  `POST /api/pet-caregivers {granteeUserId|granteeUsername, role, expiresAt}`. Owner must own the pet (route + `app_owns_pet`), blocked pairs refused.
- No profile ⇒ not searchable ⇒ 404 "User not found". Profiles are created lazily (onboarding/first owner call), so a partner who signed up
  but hasn't finished onboarding **cannot be invited at all**. Username is `unique` (0002) but the search is `ILIKE %q%`, so look-alike
  names are easy to mis-tap; the invitee sees only `@username` (often `pawpi_xxxxxx`) so cannot tell who is inviting them.
- Wrong account: **not possible** — the grant names a `grantee_user_id`; `respond_pet_caregiver` requires `grantee = current_app_user_id()` and `status = 'pending'`
  (tested). The only wrong-account risk is the *owner* picking the wrong person.
- Apple Hide-My-Email: the relay address lives only in `auth_users.email`; sharing never reads email, so no mismatch bug exists. The
  gap is discovery: with name search the partner must have set a recognisable name/@handle; there is no one-time link/code.
- No notification on invite, accept, decline, revoke (`safeNotify` is never called in `pet-caregivers/*`); the invitee has to open More → Family & caregivers → "Shared with me". No badge.
- `expiresAt` is unvalidated (past date or garbage string → grant that never works / 500). Expiry is *access* expiry; a pending invite itself never expires.
  Nothing flips `status` to `expired`; `GET ?mine=true` ignores `expires_at` and shows expired grants as "active" with the "Log a walk" button.
- Rate limiting: none on `POST /api/pet-caregivers` (invite spam to any non-blocked user). A bad `granteeUserId` surfaces as 500 (FK) vs 404 for an unknown username (id/username enumeration).
- Raw `status` ("pending", "active", "revoked") is interpolated into the UI in both languages (`pet-sharing.jsx:237`, `sharedFrom`) → untranslated technical word in the ES UI.

## 6. Reminders, routines, social (Q5, Q6)

- A grantee's phone **schedules no local notifications** for the shared pet: reminders are generated from `routinesStore.loadRoutines(currentPet.id)` and
  `GET /api/routines?petId` is owner-only (403).
- **Completion is not shared across phones.** A family log is stored by `pet_id` (anchored to the owner), so the owner's *Today/Overdue list* resolves
  after refetch, but the already-scheduled OS notification on the owner's phone is **not cancelled** (reconcile is keyed on routine ids only, and
  `completeReminder` runs only on the device that tapped). The owner can still be nagged. `reminder_dismissals` is unique on `(owner, pet, instance_key)` and the route is owner-only.
- Server pushes (digest, win-back, bookings, lost alerts, walk requests) target the owner/followers, never grantees ⇒ **no duplicates and a revoked member receives nothing.**
- Social: profile owner always `pets.owner_user_id`; posts carry `user_id` (poster) + `pet_id`; feed/day-card show the poster's `full_name`/avatar. A family
  member can post only a daily moment (route-enforced; RLS checks only `user_id = me`), a caregiver cannot post. `dailyMomentsGate` counts only the viewer's *own* pets, so a grantee stays
  locked on the shared dog's profile. A member's moment is author-only: the owner cannot edit/delete it, and it stays after revoke.
  Handle/bio/avatar/delete-pet: not reachable by a grantee through the API (PATCH owner-only; no DELETE route exists), but `pets_family_update` RLS would allow any column except `owner_user_id`.

## 7. Lifecycle (Q10)

| Scenario | Server | Member's phone | Verdict |
|---|---|---|---|
| Owner deletes the pet | **No delete-pet route or UI exists** (only account deletion). A future hard delete would CASCADE away grants **and the member's posts** (and be blocked by `health_medical_care_logs`, which has no ON DELETE action) | n/a | ✅ unreachable today; ⚠️ rule "preserve member posts" would be violated by default |
| Owner deletes account (`delete_my_account`, 0062) | auth→profile→pets→`pet_caregivers` CASCADE; **member posts on that pet, their paws/barks and owner-anchored logs/vet records are deleted; no notice** | no crash; `["shared-with-me"]` stale ≤5 min; "Log a walk" 403 → generic alert; shared-only member sent to onboarding | ❌ preserve rule |
| Owner revokes | soft-revoke (`status='revoked'`, audit row); access gone on next request (RLS, media, day-card, ring). Logs/vet records/posts kept; vet "Added by" still names the member | **never told**; stale "Active" + "Log a walk" up to 5 min (`staleTime`, `refetchOnWindowFocus` off); write → generic error; no local notifications to cancel (none were scheduled); `selectedPetId` can't point at a shared pet | ⚠️ server ✅, UX silent |
| Member leaves | **no endpoint/UI**; RLS gives grantees no UPDATE/DELETE | — | ❌ |
| Member deletes own account | grants cascade (owner's history of that grant is lost, owner list silently shrinks); **member's posts cascade-deleted**; owner-anchored logs survive; vet records survive with `created_by_user_id` NULL → UI shows "Editor · Editor" | push tokens + their notifications deleted | ⚠️ |
| Expiry | access correctly denied (helpers check `expires_at`); status never becomes `expired`; `?mine` lists it as active; a pending grant past expiry can still be accepted | stale "active" + button | ⚠️ |

Push tokens: `device_push_tokens.user_id` CASCADE; no pet event is pushed to grantees, so nothing leaks after revoke. Private media: `/api/media` returns a 60-second signed URL gated by owner-or-family,
so a URL opened just before revoke lives ≤60 s. **Public-bucket legacy files** (avatars/posts by design; possibly older medical files) are permanent bearer URLs — *needs a prod spot-check of `vet_documents` URLs, not a code change.*

## 8. UI vs RLS/API mismatches (Q11)

| # | UI says / does | API / RLS reality | Kind |
|---|---|---|---|
| M1 | Intro: "Family **co-manage everything**" | Family can't read health logs back; routines, medical profile, vaccines, meds, appointments, emergency card, pet PATCH are owner-only (RLS for some is open but unreachable) | UI over-promises |
| M2 | "Caregiver · scoped view" (feeding/med/emergency per 0049) | Caregiver route access = none: routines 403, medical profile/emergency owner-only, no UI surface at all | Feature missing |
| M3 | Shared pet appears only as a row in "Shared with me" | RLS/household API treat the user as a co-carer of that pet | UI under-delivers |
| M4 | "Log a walk" shown for `active` family grant | works; but also shown for **expired** grants (`?mine` ignores expiry) and for **revoked-but-cached** rows → generic error | UI shows what API denies |
| M5 | Owner list shows revoked rows with a trash icon | second DELETE → 404 → error alert | UI/API mismatch |
| M6 | Owner trash = "delete" label (`common.delete`) | actually soft-revoke; no confirmation | wording |
| M7 | Role chosen at invite, no way to change | no update route (revoke + re-invite) | missing |
| M8 | Grantee can accept/decline only | no leave | missing |
| M9 | Manage tab for a no-dog user: "Add your dog first" | invites a duplicate dog | harmful copy |
| M10 | `household.jsx` "switch to co-cared dog" | selection reverted by `usePetProfile` effect; screen has no entry | broken |
| M11 | Moment posting (shared dog) not offered | route allows family daily moment; gate locks the grantee as a stranger | UI/API mismatch |
| M12 | Raw `status` word shown | not localized | UX |
| M13 | Family `routines_family_write`, `pet_medical_profiles_family_update`, `pets_family_update` exist | no route ever uses them | dead capacity / latent risk |

## 9. Gaps, ranked (data leak > broken flow > UX)

### A. Data leak / data loss
| ID | Gap | Severity | Evidence / recommendation |
|---|---|---|---|
| A1 | No cross-account **read** leak found through the API; non-member / revoked / expired denied by RLS (tests pass) | — | confirmed by tests + code |
| A2 | `app_pet_ring_segments` (0102) is `SECURITY DEFINER` with **no caller check** (its sibling `app_household_leaderboard` in 0104 does check). Any authenticated identity that can pass a pet id learns whether a walk/moment/care entry happened that day | Low-Med | add `app_owns_pet(p) OR app_user_has_pet_access(p)` guard (return no rows otherwise) — migration; routes already pass only owned/co-cared ids |
| A3 | Owner account deletion (and a future pet delete) **destroys the member's posts**, owner-anchored logs and vet records; member's own account deletion destroys their posts and the grant history | High (product rule: preserve) | decide policy: anonymize/keep posts, or at least notify + export; needs product call (see questions) |
| A4 | Legacy medical files may sit in the **public** bucket; a revoked member keeps URLs they saw | Medium (prod spot-check, A-04 follow-up) | prod read-only check of `vet_documents`/photo URLs |
| A5 | RLS wider than the API: `pets_family_update` (any column except owner), family `*_family_all`/`routines_family_write` check pet access only (not owner stamping), `posts_author_all` checks only `user_id`, `pets_authed_read` exposes full pet row to any signed-in user (weight, notes, birthday) | Low (latent) | tighten: column-level/with-check hardening; not exploitable via routes today |
| A6 | `pet_caregiver_audit` 'read'/'write' actions never written; owner cannot see the audit | Low | header claims "audited" |
| A7 | `POST /api/pet-caregivers`: no rate limit; 404 vs 500 enumerates usernames/ids | Low | rate-limit + uniform error |

### B. Broken flow
| ID | Gap | Impact |
|---|---|---|
| B1 | Shared pet cannot be selected/seen; shared-only user → onboarding → **duplicate dog** (§4) | blocker for the real use case |
| B2 | Health GETs, routines GET, medical profile, emergency card owner-filtered ⇒ family writes but cannot read; caregiver role delivers nothing | blocker |
| B3 | Invite is name-search only; invitee without profile can't be invited; no link/code; no notification at invite/accept/decline/revoke | blocker for onboarding a partner |
| B4 | No leave; no resend; no role change; expired grants shown active; pending grant past expiry still acceptable; `expiresAt` unvalidated | broken |
| B5 | Owner's OS reminders keep firing after a member logs; grantee phone schedules none; dismissals per owner | broken (nag) |
| B6 | `household.jsx` unreachable + switch reverted | broken |
| B7 | Daily-moment lock treats grantee as stranger | broken |
| B8 | No duplicate-pet / idempotency guard on `POST /api/pets` | root cause of duplicates |

### C. UX
C1 raw `status` word, untranslated · C2 invitee sees `@pawpi_xxxxxx`, not who invited them · C3 stale ≤5 min after revoke, generic error on 403 · C4 "Editor · Editor" after member deletion · C5 owner can't moderate a member's moment · C6 revoked rows listed with a 404 trash · C7 caregiver's name (`full_name`) shown on the dog's public day-card.

## 10. Proposed Phase 2/3 split (for your review — nothing started)

**Phase 2 tests** (real Postgres as `pawpi_app`, 3 accounts: owner / partner (family) / outsider, plus a caregiver and a shared-only user): invite→accept; per-role read/write per area *through the real router*; revoke immediate; non-member denied; shared-only user listing; "no duplicate pet rows" (idempotency); expiry; leave (once built). Mobile (jest, EN+ES): pet-sharing states owner / family / caregiver / shared-only / no-dog / loading / error. Several of these will **fail first** on current `main` by design (B1/B2/B4) — I'd land them as `it.fails`/documented-red until the matching fix PR flips them.

**Phase 3 PRs, in this order, stop after each:**
1. **Server: let a grantee see the shared pet + read what RLS already allows** — `GET /api/pets` adds shared pets (`is_shared`, `access_role`, owner display, only active+unexpired grants; additive, old clients ignore), plus pet-access gate on routines / health GETs / medical profile for the right roles. Backward compatible with builds 30–32, **no migration**. (Fixes B2, part of B1.)
2. **Server: duplicate-pet guard** — idempotency key / same-owner+name+breed within a window on `POST /api/pets`; no migration if done in route, or a partial unique index if you want a DB backstop (migration + verify file).
3. **Mobile (needs build 33+)**: current-pet resolution over merged list; EntryPoint routing counts active grants as "home"; picker shows shared dogs with a badge; remove "Add your dog first" nudge for shared-only; hide writes for `caregiver`; refetch on 403; EN+ES. (Rest of B1, B6, M3, M9–M10.)
4. **Invite v2 (migration)** — one-time invite link/code (`pet_caregiver_invites`, hashed token, expiry, single-use, ENABLE+FORCE RLS, DEFINER `app_accept_pet_invite` + `REVOKE/GRANT` pair, `verify_NNNN.sql`), so the partner can join with any account including Apple Hide-My-Email, even before they finished onboarding; plus invite/accept/revoke notifications (also a `notifications_type_check` widen) and `leave_pet_caregiver()`.
5. **Friendly EN+ES messages** (status labels, no raw errors, expiry copy) + `?mine` honouring expiry + expiry sweeper.
6. Hardening migration: `app_pet_ring_segments` guard, family-policy tightening, audit.

## 11. Decisions I need from you before Phase 3

1. **Member contributions on owner-account/pet deletion** (A3): keep & anonymize the member's posts, or accept cascade + notify first?
2. **Caregiver role**: should it really read routines/feeding instructions + emergency info (the 0049 promise)? I'd deliver exactly that and nothing else.
3. **Family and health history**: show the member's logs to the owner with attribution ("logged by …")? Health tables have no `created_by` column today.
4. **Invite link**: OK to add a migration (new table + DEFINER fn) — hand-applied by you with `verify_NNNN.sql`?
