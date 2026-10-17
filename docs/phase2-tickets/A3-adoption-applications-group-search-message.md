# Ticket A3 — Adoption applications: group by dog, search, and message the applicant (A2 follow-up)

> **Run-note (attended).** Fresh CC chat. Orient first: read `docs/phase2-tickets/00-README.md`, skim `ARCHITECTURE.md`, read `docs/phase2-tickets/WALKER-MARKETPLACE-AND-NAV-PLAN.md`, and note this **builds on A2** (`A2-adoption-applications-mobile-business.md`, already merged): the mobile business adoption review screen `apps/mobile/src/app/business-adoption.jsx` and the `useReviewProviderAdoptionApplication` hook already exist. Stack: `apps/web` = React Router 7 + file-based Hono API (`src/app/api/**`), tests = web vitest + real-Postgres integration (test through the REAL router by URL, routes registered WITHOUT the `/api` prefix); `apps/mobile` = Expo Router, Jest, i18n EN+ES via `t()` (neutral "tú"). Adds **ONE small API route** (provider opens a thread with an applicant) — **NO migration, no schema change**. **404 non-integer ids before SQL.** No internal jargon in copy. Build on a **fresh branch off `main`**, all gates green (mobile jest + web vitest + integration), then **open a PR and STOP** — do not auto-merge.

## Context — what already exists (build on it, don't rebuild)
- **A2 shipped** the review screen `business-adoption.jsx` (list + status chips + Approve/Decline/Mark-under-review, reachable from Today's tappable applications glance row) and the `useReviewProviderAdoptionApplication(providerId)` mutation. This ticket **extends that screen** — do not rebuild it.
- **List data (unchanged from A2):** `GET /api/providers/[id]/adoption-applications` returns per application `id, listing_id, status, answers` (jsonb Q&A), `created_at`, `listing_name, listing_breed, listing_status, applicant_name, applicant_email, applicant_owner_user_id`. Read hook `useProviderAdoptionApplications(providerId)` (key `["provider-adoption-applications", providerId]`).
- **Chat is fully built and reusable.** `provider-chat.jsx` is the shared owner↔provider conversation screen; the provider/staff side opens it with `{ threadId, title, meUserId (staff profile id via useMyProfileId), ownerUserId }` — see `business/messages.jsx` `openThread`. Hooks: `useThreadMessages`, `useSendMessage`, `useMarkThreadRead`, `useMyProfileId`.
- **The only messaging gap is the START direction.** `POST /api/threads` is **owner-initiated only** (caller becomes `owner_user_id`). But `message_threads` RLS `message_threads_participant_all` already permits an **active-staff INSERT** for the provider (`with check (owner_user_id = current_app_user_id() OR app_is_active_staff_of(provider_id))`), and `idx_message_threads_unique_general (owner_user_id, provider_id) WHERE booking_id IS NULL` makes it idempotent. So a provider-initiated open is **route-only** — **no migration, no RLS change**.

## Changes

### 1. New API route — provider opens/reuses a thread with an applicant (no migration)
`POST /api/providers/[id]/adoption-applications/[applicationId]/thread` (new file, sibling of the PATCH route). Gate exactly like the PATCH sibling: `requireProviderCapability(id,'adoption')` + `requireProviderRole` + `withRequestContext`. **404 a non-integer `id`/`applicationId` before any SQL.** Load the application scoped by `provider_id` (404 if not found), derive `applicant_owner_user_id`. Idempotent: reuse the general thread (`owner_user_id = applicant, provider_id, booking_id IS NULL`) if present, else INSERT one (RLS staff-insert already allows this). Return `{ thread }`. The applicant relationship (they applied to this provider) is what authorizes the DM — staff cannot cold-message arbitrary users.

### 2. New mobile hook (`apps/mobile/src/hooks/useProviders.js`)
- `useOpenAdoptionApplicantThread(providerId)` — `POST …/[applicationId]/thread`; returns `{ thread }`. Follow existing mobile mutation conventions (relative `fetch`, throw on `!res.ok`).

### 3. Extend `business-adoption.jsx`

**a) Search bar** (top, debounced, client-side over the already-fetched list): match applicant name, dog `listing_name`/`listing_breed`, and `answers` text. Clearing restores the full list. Reuse the app's existing search-field styling.

**b) Group by dog.** Section per `listing_id`: header shows `listing_name` + breed + the `listing_status` + an application count. Order sections by open-application count desc, then most-recent activity. Search that matches nothing → "No matches."

**c) Declined sink to the bottom.** Within each dog group, rank open (`requested`/`pending`/`under_review`) = 0, `approved` = 1, `declined` = 2; within a rank, newest first. So **declined always sit at the bottom** of their dog group.

**d) Message the applicant.** Add a **Message** action to each application card (available even after a decision, so the shelter can still talk). On press: `useOpenAdoptionApplicantThread(providerId)` → `router.push('/provider-chat', { threadId, title: applicant_name, meUserId: <useMyProfileId()>, ownerUserId: applicant_owner_user_id })`. Reuses `provider-chat` unchanged. Idempotent (double-tap safe).

Keep A2's existing Approve/Decline/Mark-under-review actions, status chips, contact + answers rendering, and empty/loading/error states — only add the above.

### 4. i18n
Add the new `business.adoption.*` keys (search placeholder, no-matches, the by-dog "N applications" count, message) to `en.json` **and** `es.json` (neutral "tú"). Reuse existing A2 keys.

## Data / API rules
- **No migration, no schema change.** One new nested route reuses existing tables; `message_threads` RLS already permits the staff insert (cited above); idempotent via the existing unique index.
- **Degrade clean:** grouping/search are pure client transforms over the existing query. Opening a thread is idempotent; route errors surface as copy, never a crash.

## Acceptance criteria
- Applications on `business-adoption` are **grouped by dog**, **searchable**, and **declined sink to the bottom** of each dog group; real empty + no-matches states; A2's review actions still work.
- **Message** opens `/provider-chat` with the applicant and a working send; opening twice reuses the same thread (idempotent).
- **Gates:** mobile jest green (baseline + net-new); **web vitest + integration green** including a new integration proof for the thread route.
- **Tests:**
  - Integration (real router by URL): as active staff, `POST /providers/[id]/adoption-applications/[applicationId]/thread` **creates then reuses** the applicant thread; a **non-staff** caller → 403/zero rows; **non-integer** `id`/`applicationId` → 404 **before** SQL.
  - Mobile: extend `business-adoption.test.jsx` — grouped-by-dog render; search filters; declined ordered last; Message calls the open-thread hook then navigates to `/provider-chat` with the right params.
- **Device pass (Tats):** search, expand a dog, and message an applicant end-to-end on a real device.

## MVP decisions flagged for Tats
- **Message availability:** the **Message** button is on **every** application (incl. declined) so you can still talk after a decision. Say if you want it hidden once decided.
- **Grouping:** grouped by dog, sections ordered by open-count then recency; declined last within a dog. If you'd rather a flat list with a dog filter chip instead of sections, say so.
