# Ticket A2 — Adoption applications on the mobile business hub

> **Run-note (attended).** Fresh CC chat. Orient first: read `docs/phase2-tickets/00-README.md`, skim `ARCHITECTURE.md`, and read `docs/phase2-tickets/WALKER-MARKETPLACE-AND-NAV-PLAN.md` (this ticket is A2 of that wave). Stack: Expo Router mobile app (`apps/mobile`), Jest tests, i18n EN+ES (new strings via `t()`, neutral "tú"). This reuses **existing web API routes** — **no new API, no migration, no schema change**. No internal jargon in user-facing copy. Build on a **fresh branch off `main`**, all gates green (mobile jest; web vitest + integration must stay unaffected), then **open a PR and STOP** — do not auto-merge.

## Context — what already exists (build on it, don't rebuild)
- **API is done.** `GET /api/providers/[id]/adoption-applications` returns each application with `id, listing_id, status, answers` (jsonb Q&A), `created_at`, plus `listing_name, listing_breed, listing_status, applicant_name, applicant_email`. `PATCH /api/providers/[id]/adoption-applications/[applicationId]` takes `{ status }` ∈ `under_review | approved | declined`; **approval is atomic and irreversible** (server `app_approve_adoption` creates the adopter's pet + marks the listing adopted, returns `transferred_pet_id`; a non-approvable app → **409**). Both are capability+role+RLS gated already.
- **Mobile read hook exists:** `useProviderAdoptionApplications(providerId)` (`apps/mobile/src/hooks/useProviders.js` ~L736; query key `["provider-adoption-applications", providerId]`, polls 30s). Today already uses it for the `pendingAppCount` glance.
- **No mobile review mutation yet.** The web has `useReviewAdoptionApplication(providerId)` (`apps/web/src/app/provider/hooks/useProviders.js` ~L1807) — mirror its shape on mobile.
- **Business hub is a 4-tab Tabs layout** (`business/_layout.jsx`: index/bookings/messages/profile). Detail screens are **root-level pushed routes**, NOT files inside `business/` — e.g. messages pushes to `/provider-chat`, Today pushes to `/walker-walks`. Follow that pattern so this does **not** become a 5th tab.
- **Styling template:** `business/bookings.jsx` already does "list + status chip + Confirm/Decline action" on the hub — reuse its `STATUS_STYLE` palette, card layout, and action-button pattern. Web parity target for the review UX: the applications section of `provider/components/ProviderAdoption.jsx`.
- **Today entry point (currently informational):** `business/index.jsx` renders the pending-applications `GlanceRow` (adoption-capability only, `testID="glance-applications"`) with **no `onPress`** and a comment that review "is managed on the web dashboard." `GlanceRow` auto-renders a chevron when `onPress` is present.

## Scope (MVP boundary — application REVIEW only)
Mobile gets the **application review inbox**. Managing the adoptable **dogs/listings** (create/edit/delete/relist, media upload, the questions editor) **stays on web** — same "manage the deep stuff on web" split Bookings uses. See flagged decision below.

## Changes
1. **New mobile mutation hook** in `apps/mobile/src/hooks/useProviders.js`: `useReviewProviderAdoptionApplication(providerId)` — `PATCH /api/providers/${providerId}/adoption-applications/${applicationId}` with `{ status }`; on success invalidate `["provider-adoption-applications", providerId]` (and the owner-facing key if trivially relevant). Mirror the web `useReviewAdoptionApplication` shape and the existing mobile mutation conventions (relative `fetch`, throw on `!res.ok`).
2. **New screen** `apps/mobile/src/app/business-adoption.jsx` → route `/business-adoption` (root-level, pushed — mirrors `walker-walks.jsx`):
   - Reads `useActiveProvider()` for the active `providerId`; `useProviderAdoptionApplications(providerId)`.
   - Wrap the content in `RefreshableScrollView` (`refetch` from the query) for consistency with the hub.
   - Header with a back affordance (mirror `walker-walks.jsx` header).
   - **List**, newest first: per application card show applicant name, the dog (`listing_name` + `listing_breed`), a **status chip** (reuse the bookings palette: requested/pending → warm, `under_review` → info/blue, `approved` → green, `declined` → red), submitted date, the applicant **contact** (email; and the phone that rides in `answers` as the "Best contact number" answer), and the **answers** (render the `answers` Q&A rows).
   - **Actions** on a still-open application (status not `approved`/`declined`): **Approve**, **Decline**, and **Mark under review**. **Approve is behind a confirm** `Alert` ("This creates the adopter's pet and can't be undone."). On a **409** show a friendly "This application was already decided — pull to refresh." (do not crash). Buttons disable while the mutation is pending.
   - **States:** loading spinner; **empty** → "No applications yet." (real empty state, no fake rows); error → retry/empty, never a crash.
3. **Make Today's glance row tappable** (`business/index.jsx`): add `onPress={() => router.push("/business-adoption")}` to the `glance-applications` `GlanceRow` (the chevron appears automatically); update the adjacent comment (it no longer "has no mobile tab to open"). In the **"Manage on web" note**, drop *applications* from the listed items (dogs/listings/services/products/hours/adoption-listings stay on web; applications now on mobile).
4. **i18n:** add `business.adoption.*` keys (title, empty, statuses, approve/decline/underReview, the approve-confirm copy, contact/answers labels) to `en.json` **and** `es.json` (neutral "tú"). Reuse existing keys where they fit (e.g. `business.today.applicationsLabel`).

## Data / API rules
- **No new API, no migration, no schema change** — reuse the existing GET list + PATCH review routes (RLS + `adoption` capability + role already guard them).
- **Degrade clean:** the entry point is already gated by the provider holding the `adoption` capability; if the list route errors, the screen shows the error/empty state, never a 500-driven crash. Approval failures (409/permission) surface as copy, not crashes.

## Acceptance criteria
- From Today (adoption-capable provider), tapping the applications row opens `/business-adoption`; a non-adoption provider never sees the row (unchanged).
- The screen lists real applications with applicant + dog + status chip + contact + answers; empty state when there are none.
- **Approve** (after confirm) sends `PATCH {status:"approved"}`, and on success the list refetches and the row reflects approved; **Decline** and **Mark under review** send their statuses and refetch. A 409 shows the "already decided" copy.
- **Gates:** mobile jest green (baseline + net-new); web vitest + integration unaffected (no web/API files touched).
- **Tests:** new `business-adoption.test.jsx` — renders list + empty state + status chips; Approve triggers the mutation with `approved` **after** the confirm; Decline/under_review trigger theirs; the query invalidates on success (mock the hooks as the other `business/*.test.jsx` do). Extend `business/index.test.jsx` to assert the glance row is now tappable and routes to `/business-adoption`.
- **Device pass (Tats):** review an application end-to-end on a real device (approve creates the pet; decline/under-review update); pull-to-refresh works.

## MVP decisions flagged for Tats
- **Boundary:** mobile does application **review** only; creating/editing adoptable dogs, media uploads, and the questions editor **stay on web**. Confirm that's the split you want (vs. also porting listing management to mobile — a much bigger surface).
- **Approve is irreversible** (creates the adopter's pet). It's gated behind a confirm dialog. Say the word if you'd rather a two-step "approve → final confirm on a summary" instead of a single confirm.
- Actions offered: Approve / Decline / Mark under review (full web parity). If you want mobile to be triage-only (Approve/Decline, no under-review), I'll drop the third.
