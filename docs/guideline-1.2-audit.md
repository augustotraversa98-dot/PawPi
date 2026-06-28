# App Store Guideline 1.2 (User-Generated Content) — Readiness Audit

**Date:** 2026-06-20 · **Scope:** AUDIT ONLY — no source files changed, no migrations added.
**Schema baseline:** migrations through `0064` (applied + verified on Supabase).

Apple Guideline 1.2 requires that **any** app with user-generated content ship all four
safeguards, or it is rejected:

- **(A) EULA / terms agreement** the user must accept, with explicit **zero-tolerance** language
  on objectionable content and abusive users.
- **(B) Filter** objectionable content (proactive moderation).
- **(C) Report/flag** mechanism, with the developer acting (remove content + eject user) **within 24h**.
- **(D) Block** abusive users.
- **Plus:** published developer contact info reachable from the app.

## Verdict (read this first)

**Coverage today: 0 of 4 safeguards met.** Of the five requirements (A–D + contact), **none is
fully present**; contact info is a non-functional placeholder. This will be rejected under 1.2 as-is.

The good news: the gaps collapse into **one focused, mostly-shared build** — not per-surface work.
Report (C) and Block (D) can each be a single polymorphic table + one shared action reused across
every surface. **Required build size: one shared moderation slice + one migration** (details and
sizing at the end). It is bigger than "one small piece" but far smaller than "per-surface."

---

## 1. UGC surface inventory

Every place a user submits text, an image, or a display name/handle. (`memories` is a derived view
over `posts` history — `usePetHistory` → `GET /api/posts/history` — so it carries no separate table
and inherits `posts`' moderation state. Daycare "report cards" are provider→owner service docs, not
peer UGC. `lost_reports`/`recall*` are lost-pet and food-recall features, not content-moderation.)

| # | Surface | Table(s) (migration) | Screen / Route |
|---|---|---|---|
| 1 | Social feed posts | `posts` (0004) | Feed `(tabs)/index.jsx`, `PostDetailModal.jsx` · `posts/route.js`, `posts/[id]/route.js` |
| 2 | Barks (comments on posts) | `post_barks` (0004) | post detail · `posts/[id]/barks/route.js` |
| 3 | Dog/pet social profiles (name, bio, handle, photos) | `pets` (0003) | `pet-profile.jsx` · `pets/[id]/profile/route.js` |
| 4 | User profiles (username, bio, avatar) | `user_profiles` (0002) | `more/profile.jsx`, `profile-edit.jsx` · `user-profile/route.js` |
| 5 | Community forum threads + comments | `forum_threads`, `forum_comments` (0047) | `forum-thread.jsx`, `forum-compose.jsx` · `forum/threads/*`, `forum/comments/[id]/route.js` |
| 6 | Messaging — owner↔provider | `messages` (0031) | `chat.jsx`, `provider-chat.jsx` · `threads/[id]/messages/route.js` |
| 7 | Messaging — owner↔owner DMs | `dm_messages` (0045) | `messages.jsx` · `dm-threads/[id]/messages/route.js` |
| 8 | Provider reviews | `provider_reviews` (0014/0028) | `service/provider.jsx` · `providers/[id]/reviews/route.js` |
| 9 | Walks-with-buddies / social walks | `social_walks`, `social_walk_join_requests` (0007/0046) | `create-walk.jsx`, `nearby-walks.jsx` · `social-walks/*` |
| 10 | Memories (derived from posts) | *(no table — view over `posts`)* | `memories.jsx`, `wrapped.jsx` |
| 11 | Adoption listings + applications | `adoptable_listings`, `adoption_applications` (0038) | `service/adoption.jsx` · `adoption/*` |
| 12 | Events / meetups | `events` (0060) | `events.jsx`, `event-create.jsx` · `events/*` |
| 13 | Provider posts | `provider_posts` (0042) | `service/provider.jsx` · `providers/[id]/posts/*` |
| 14 | Lost & found reports + sightings | `lost_reports`, `lost_sightings` (0050) | `lost-found.jsx` · `lost-reports/*` |

---

## 2. Coverage matrix (surface × safeguard)

**(A) is global** (one signup-time EULA gate covers all surfaces) and is reported in §3, not per-row.
Columns below: **(B) filter**, **(C) report**, **(D) block**, plus **Removable?** = can the *developer*
hide/remove offending content (the back half of (C)'s "act within 24h"). Legend: ✗ missing ·
◐ partial · ✓ present.

| Surface | (B) Filter | (C) Report | (D) Block | Removable by dev? |
|---|---|---|---|---|
| Feed posts | ✗ | ✗ | ✗ | ◐ author-only delete (`posts/[id]` DELETE, `AND user_id=…`); no admin/hide |
| Barks | ✗ | ✗ | ✗ | ✗ no DELETE handler on `posts/[id]/barks` |
| Pet profiles | ✗ | ✗ | ✗ | ✗ owner-edit only; no moderation |
| User profiles | ✗ | ✗ | ✗ | ✗ owner-edit only; no moderation |
| Forum threads | ✗ | ✗ | ✗ | ◐ author soft-delete `deleted_at` (`AND author_user_id=…`); no admin |
| Forum comments | ✗ | ✗ | ✗ | ◐ author soft-delete `deleted_at`; no admin |
| Messages (provider) | ✗ | ✗ | ✗ | ✗ no DELETE; no moderation |
| DMs (owner↔owner) | ✗ | ✗ | ✗ | ✗ no DELETE; no moderation |
| Provider reviews | ✗ | ✗ | ✗ | ✗ owner-context write only; no delete/hide |
| Social walks | ✗ | ✗ | ✗ | ✗ `visibility` is privacy, not moderation |
| Memories (posts view) | ✗ | ✗ | ✗ | ◐ inherits posts' author-delete |
| Adoption listings/apps | ✗ | ✗ | ✗ | ✗ no soft-delete / hide |
| Events / meetups | ✗ | ✗ | ✗ | ◐ host soft-delete `deleted_at`; no admin |
| Provider posts | ✗ | ✗ | ✗ | ◐ author soft-delete `deleted_at`; no admin |
| Lost & found | ✗ | ✗ | ✗ | ◐ resolve (not delete); no moderation |

**Every surface is ✗ on (B), (C), and (D).** The only existing partial is *author-controlled* delete on
a few tables — that does **not** satisfy 1.2, which requires the *developer* to remove others' content
and eject the user within 24h.

### DB-layer findings (the primitives a fix would build on)

- **No moderation tables.** No `reports` / `content_reports` / `flags` / `abuse_reports` /
  `moderation*` table anywhere in `0001–0064`.
- **No block table.** No `user_blocks` / `blocked_users`. `pet_friendships.status` allows
  `'blocked'` (`0004_social.sql:62`, CHECK `('pending','accepted','blocked')`) but it is a
  friend-request state on a pet↔pet edge with no enforcing route — **not** a user-to-user block, and
  it doesn't gate feeds, forum, DMs, or comments.
- **No moderation columns.** No `moderation_status` / `is_hidden` / `hidden_at` / `removed_at` /
  `is_flagged` on any UGC table. Soft-delete `deleted_at` exists only on `forum_threads`,
  `forum_comments`, `provider_posts`, `events` — and is author-scoped, not a moderator hook.
- **No admin/ban path.** `0062_account_deletion.sql` provides `delete_my_account()` —
  **self-service only** (`security definer`, no params, operates on `current_app_user_id()`). There is
  no `ban_user()` / suspend / remove-for-violation function to eject an abusive user.
- **No content filtering.** No profanity/bad-words list, no text sanitization, no image moderation
  (no Rekognition/vision/NSFW). `upload/route.js` does file-type validation only. The provider
  "enrich" LLM (`api/utils/enrichment/`) is data-enrichment, not moderation.

---

## 3. Global safeguards (A + contact info)

| Requirement | Status | Evidence |
|---|---|---|
| **(A) EULA acceptance gate at signup** | ✗ **Missing** | Web signup `account/signup/page.jsx` has no terms checkbox. Mobile `welcome.jsx:159–181` shows a *passive* "By continuing, you agree to our Terms & Privacy Policy" line — no checkbox, no blocking acceptance. `onboarding.jsx` has no acceptance step. |
| **Zero-tolerance language in EULA** | ✓ **Present** | `docs/legal/terms-of-service.md` §5 now carries a dedicated "Zero-tolerance for objectionable content and abusive users" clause (report/block, 24h action, eject abusive users, submission filter). Both legal docs are finalized — all `[BRACKETED]` placeholders filled (effective June 22, 2026). |
| **Terms/Privacy hosted + reachable** | ✓ **Done** | Both docs finalized (no placeholders) and **hosted live** (HTTP 200): Privacy → https://augustotraversa98-dot.github.io/pawpi-legal/privacy · Terms → https://augustotraversa98-dot.github.io/pawpi-legal/terms (public repo `augustotraversa98-dot/pawpi-legal`, GitHub Pages). In-app links wired: `EXPO_PUBLIC_PRIVACY_POLICY_URL`/`EXPO_PUBLIC_TERMS_URL` (mobile) + `NEXT_PUBLIC_*` (web) set in the gitignored `.env` files. |
| **In-app developer contact info** | ◐ **Placeholder** | `settings.jsx:314–328` renders "Help Center" / "Contact Us" rows, but `SettingRow` is display-only (no `onPress`) — the "→" is decorative. No `mailto:`/support URL is wired. |

The project already knows this is a blocker: `docs/app-store-connect-content.md:107–112` explicitly
flags Guideline 1.2 (filter + report + block + contact) as a required pre-submission build.

---

## 4. Prioritized gaps

### MUST-FIX (required to pass 1.2) — cheapest correct fix + migration need

1. **(C) Report/flag + developer removal + eject — the biggest item.**
   *Cheapest fix:* **one shared polymorphic `content_reports` table** (`target_type`, `target_id`,
   `reporter_user_id`, `reason`, `status`, `created_at`, `deleted_at`) + **one** `POST /api/reports`
   route + **one** reusable Report action component dropped onto each surface's overflow menu. Pair it
   with a removal/hide capability — add `hidden_at`/`removed_at` (or reuse `deleted_at`) on the UGC
   tables that lack it, plus an admin removal path and a ban flag (e.g. `user_profiles.banned_at` +
   a `ban_user()` definer fn) to satisfy "eject the user within 24h." A lightweight admin review queue
   (can be a Supabase/SQL view + manual action initially) closes the 24h-action requirement.
   **Migration: YES** (new `content_reports` table + `hidden_at`/`removed_at` columns on the UGC
   tables missing soft-delete + `banned_at` + ban fn; all FORCE-RLS, `owner_user_id` = `user_profiles.id`).

2. **(D) Block abusive users.**
   *Cheapest fix:* **one shared `user_blocks` table** (`blocker_user_id`, `blocked_user_id`,
   `created_at`, `deleted_at`, unique pair) + `POST/DELETE /api/blocks` + **one** Block action reused
   across profiles/posts/forum/DMs, and a shared filter that excludes blocked users from feed, forum,
   search, DM threads, and walk discovery. **Migration: YES** (new `user_blocks` table, FORCE-RLS).

3. **(B) Filter objectionable content.**
   *Cheapest fix:* a **shared server-side text filter** (profanity/keyword list) applied at the API
   write chokepoints for all text UGC (posts, barks, forum, DMs, reviews, profiles, listings, events),
   rejecting or holding flagged submissions; plus a stated image-content policy enforced reactively via
   the report pipeline (item 1). A hosted vision/NSFW check on `upload/route.js` is the stronger option
   but not strictly required for approval. **Migration: NO** (logic only — unless you choose to persist
   a `moderation_status`, which folds into item 1's migration).

4. **(A) EULA acceptance gate + zero-tolerance language.**
   *Cheapest fix:* add a **required terms checkbox** to web `account/signup/page.jsx` (the real signup
   surface, used by the mobile WebView) — block submit until checked — and a matching gate in mobile
   `welcome.jsx`/onboarding for the Expo-web path; add the **zero-tolerance / objectionable-content /
   abusive-user** clause to `docs/legal/terms-of-service.md`. **Migration: optional** (a
   `terms_accepted_at` column on `user_profiles` is nice-to-have proof but not required for approval).

5. **Published in-app developer contact info.**
   *Cheapest fix:* wire the existing `settings.jsx` "Contact Us" row to a `mailto:` support address
   (and/or a hosted support URL), and host the Terms + Privacy docs and set
   `EXPO_PUBLIC_PRIVACY_POLICY_URL` / `EXPO_PUBLIC_TERMS_URL`. **Migration: NO.**
   **UPDATE (2026-06-28):** the legal-docs half is done — both docs finalized and hosted live at
   `https://augustotraversa98-dot.github.io/pawpi-legal/{privacy,terms}` (HTTP 200), with the
   `EXPO_PUBLIC_*` (mobile) and `NEXT_PUBLIC_*` (web) URL env vars set so the in-app links open them.

### NICE-TO-HAVE (not required for 1.2 approval)
- Hosted image/NSFW moderation on uploads (vs. reactive report-driven removal).
- A full admin moderation dashboard (vs. an initial SQL-view + manual-action queue).
- `terms_accepted_at` / `moderation_status` audit columns for compliance record-keeping.
- Rate-limiting / auto-hide on N reports.

---

## 5. Required build size

**Not "none."** It is **one shared moderation slice + a single migration** — a medium, bounded build,
not sprawling per-surface work:

- **1 migration** — `content_reports` table, `user_blocks` table, `hidden_at`/`removed_at` on the UGC
  tables lacking soft-delete, `banned_at` + `ban_user()`; all FORCE-RLS and `owner_user_id`-scoped per
  house rules.
- **~3 shared API routes** — `reports`, `blocks`, and an admin remove/ban path.
- **2 shared UI actions** — Report and Block — reused across every surface's overflow menu, plus a
  shared "hide blocked/removed content" filter in feed/forum/DM/search.
- **1 shared text filter** at the write chokepoints.
- **EULA gate** (web signup checkbox, the real surface) + **zero-tolerance terms text** + **contact
  wiring** (settings `mailto:` + hosted/configured legal URLs).

Because report and block are polymorphic and the actions are shared components, the cost scales with
the *number of shared pieces*, not the ~14 surfaces. Recommend scoping this as a single pre-submission
ticket.
