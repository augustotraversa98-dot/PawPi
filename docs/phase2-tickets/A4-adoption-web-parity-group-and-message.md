# Ticket A4 — Adoption applications on the web dashboard: group by dog + message the applicant (web parity for A2/A3)

> **Run-note (attended).** Fresh CC chat. Orient first: read `docs/phase2-tickets/00-README.md`, skim `ARCHITECTURE.md`, read `docs/phase2-tickets/WALKER-MARKETPLACE-AND-NAV-PLAN.md`, and note this brings the **A2/A3** adoption improvements (already merged on mobile) to the **web provider dashboard**. Stack: `apps/web` = React Router 7 + file-based Hono API; provider dashboard lives in `apps/web/src/app/provider/` (React Query + Tailwind); tests = web vitest (the gate) + real-Postgres integration. **Web-only. NO new API route, NO migration** — it reuses the thread route A3 already shipped (`POST /api/providers/[id]/adoption-applications/[applicationId]/thread`). No internal jargon in copy. Build on a **fresh branch off `main`**, all gates green (web vitest; mobile jest + integration must stay unaffected), then **open a PR and STOP** — do not auto-merge.

## Context — what already exists (build on it, don't rebuild)
- **Web adoption workspace** `apps/web/src/app/provider/components/ProviderAdoption.jsx` already has an **applications review section** (`ApplicationsSection` ~L849) using `useAdoptionApplications(providerId)` + `useReviewAdoptionApplication(providerId)`, with a `FilterBar` (case-insensitive search over applicant + email + dog, plus status chips) and a **Past group** (approved/declined) collapsed by default. Approve/Decline/Mark-under-review already work here. An answers renderer exists (~L170).
- **Application data:** each application carries `id, listing_id, status, answers, created_at, listing_name, listing_breed, listing_status, applicant_name, applicant_email, applicant_owner_user_id`.
- **The thread route already exists (from A3):** `POST /api/providers/[id]/adoption-applications/[applicationId]/thread` — provider-initiated, idempotent open/reuse of the applicant's thread, capability+role+RLS gated. **Reuse it; do not add a new route.**
- **Web chat surface exists:** `provider/components/ProviderChats.jsx` (two-pane: thread list + `Conversation`) at route `/provider/chats` (`provider/chats/page.jsx`). Hooks present in `provider/hooks/useProviders.js`: `useProviderThreads(providerId)` (side=provider inbox; key `threadsKey(providerId)`), `useThreadMessages(threadId)`, `useSendMessage(providerId, threadId)`, `useMarkThreadRead(providerId)`. **Thread selection today is in-component state (`activeId`), with no deep-link.**

## Changes

### 1. New web hook (`apps/web/src/app/provider/hooks/useProviders.js`)
`useOpenAdoptionApplicantThread(providerId)` — `POST /api/providers/${providerId}/adoption-applications/${applicationId}/thread`; returns `{ thread }`. On success invalidate `threadsKey(providerId)` so the Chats inbox shows the (possibly new) thread. Mirror the existing web mutation conventions.

### 2. Deep-link a thread on `/provider/chats` (`ProviderChats.jsx` + `chats/page.jsx`)
Let the Chats page pre-select a thread from the URL: read `?thread=<id>` (React Router `useSearchParams`) and initialize/override `activeId` with it (once threads load, select that thread; if it isn't in the list yet, still set `activeId` so the conversation opens on arrival). This is the hand-off target for the Message button and is a generally useful deep-link. Keep all existing Chats behavior unchanged when no param is present.

### 3. Message the applicant + group by dog (`ProviderAdoption.jsx` → `ApplicationsSection`)
- **Message action** on each application card: on click, `useOpenAdoptionApplicantThread(providerId)` then navigate to `/provider/chats?thread=${thread.id}` (use the provider app's existing router navigation — `useNavigate`/`Link` as used elsewhere in `provider/`). Idempotent (reuses the thread on repeat). Available on every application (incl. decided) so the shelter can still talk.
- **Group by dog:** reorganize the applications list into **per-dog sections** (by `listing_id`): section header = `listing_name` + breed + the `listing_status` + an application count. Order sections by open-application count desc, then most-recent activity.
- **Declined sink to the bottom** within each dog: rank open (`under_review`/pending) = 0, `approved` = 1, `declined` = 2; newest first within a rank. (This can replace the current global Past-collapse; keep the **search** from `FilterBar`.)
- Keep the existing Approve/Decline/Mark-under-review actions, status tags, answers rendering, and empty/error states.

### 4. Copy
Web dashboard is English-only (no i18n needed) — just add clear button/section labels ("Message", the per-dog "N applications" count, section headers). No internal jargon.

## Data / API rules
- **No new API route, no migration, no schema change.** Reuse the A3 thread route + existing thread/message hooks.
- **Degrade clean:** grouping/search are client transforms over the existing query. Opening a thread is idempotent (double-click safe); a failed open surfaces a toast/message, never a crash. `?thread=` with an unknown/foreign id simply shows the normal Chats empty/selection state (RLS already scopes what the caller can see).

## Acceptance criteria
- On `/provider/adoption`, applications are **grouped by dog**, still **searchable**, with **declined at the bottom** of each dog group; existing review actions unchanged.
- A **Message** button opens/reuses the applicant thread and lands on `/provider/chats` with **that conversation open**; sending a message works. Opening twice reuses the same thread.
- `/provider/chats?thread=<id>` pre-selects that conversation; no param → unchanged behavior.
- **Gates:** web vitest green (baseline + net-new); **mobile jest + integration unaffected** (no mobile/API/migration change — the thread route already has integration coverage from A3).
- **Tests (web vitest, mocked):**
  - `ProviderAdoption` — applications render **grouped by dog**; declined ordered last; **Message** calls `useOpenAdoptionApplicantThread` then navigates to `/provider/chats?thread=…`; search still filters.
  - `ProviderChats` — with `?thread=<id>` the matching conversation is pre-selected; without it, first-load behavior is unchanged.
- **Browser pass (Tats):** on web, review + message an applicant end-to-end; the deep-link opens the right conversation.

## MVP decisions flagged for Tats
- **Hand-off style:** v1 **navigates** to `/provider/chats` (mirrors the mobile flow, minimal code, adds a reusable deep-link). The nicer-but-bigger alternative is an **in-context chat drawer** on the adoption page (talk without leaving review) — say the word and I'll do that as a follow-up instead.
- **Grouping vs status chips:** this replaces the current status-chip/Past-collapse organization with **per-dog sections** (search retained). If you want to *keep* the status filter chips alongside the by-dog grouping, I'll leave them in.
- **Message availability:** on every application incl. decided. Say if you want it hidden once decided.
