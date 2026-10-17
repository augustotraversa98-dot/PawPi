# Ticket A1 — Business hub pull-to-refresh (Today + Bookings)

> **Run-note (attended).** Fresh CC chat. Orient first: read `docs/phase2-tickets/00-README.md` and skim `ARCHITECTURE.md`. Stack: Expo Router mobile app (`apps/mobile`), Jest tests, i18n EN+ES (new strings via `t()`). This is a **mobile-only** change — no web/API/schema. No internal jargon in user-facing copy. Build on a **fresh branch off `main`**, all gates green (mobile jest; web vitest + integration must stay unaffected), then **open a PR and STOP** — do not auto-merge.

## Context — what already exists (build on it, don't rebuild)
- `apps/mobile/src/components/RefreshableScrollView.jsx` is a drop-in `<ScrollView>` replacement pre-wired with `RefreshControl` + the `useRefresh` hook. Prop: `refetch` accepts **a single fn OR an array of fns**; all other ScrollView props forward unchanged; spinner defaults to app coral.
- `business/messages.jsx` already uses it — `<RefreshableScrollView refetch={refetch}>` (~line 108). This is the reference pattern; mirror it.
- **Gap:** `business/index.jsx` (Today) and `business/bookings.jsx` (Bookings) still use a plain `<ScrollView>`.

## Changes
1. **Bookings** (`apps/mobile/src/app/business/bookings.jsx`): the screen already destructures `refetch` from `useProviderBookings` (~line 209). Replace the single content `<ScrollView>` (~line 305) with `<RefreshableScrollView refetch={refetch}>`, forwarding the existing `contentContainerStyle`.
2. **Today** (`apps/mobile/src/app/business/index.jsx`): replace **only** the main content `<ScrollView>` (~line 440) with `<RefreshableScrollView>`. **Do NOT touch** the second `<ScrollView>` inside the provider-switcher modal (~line 687). Pull should reload the whole screen, so pass an array of the screen's refetch fns: `refetchPosts` (already destructured) plus the `refetch` from `useProviderBookings`, `useProviderUnreadCount`, and `useProviderAdoptionApplications` (destructure each with an alias to avoid name collisions). Result: `refetch={[refetchPosts, refetchBookings, refetchUnread, refetchAdoptionApps]}`.
3. **i18n:** none — RefreshControl shows no label.

## Data / API rules
- None. Mobile-only: no API route, no migration, no schema change. Nothing to hand-apply.

## Acceptance criteria
- Pulling down on **Today** and on **Bookings** shows the coral spinner and refetches that screen's queries; the spinner clears when the refetch settles.
- The provider-switcher modal's inner `ScrollView` is unchanged.
- **Gates:** mobile jest green; web vitest + integration unchanged (this touches neither).
- **Tests:** extend `business/bookings.test.jsx` and `business/index.test.jsx` to assert the content scroller is `RefreshableScrollView` and that a pull triggers the refetch(es) — mirror the mock in `business/messages.test.jsx`.
- **Device pass (Tats):** pull-to-refresh works on both tabs on a real device and doesn't fight the inner modal scroll.

## MVP decisions flagged for Tats
- Default is **refetch-everything** on Today so "scroll down reloads" reloads the whole screen. If you'd rather keep the pull light (posts only), the array trims to `[refetchPosts]`.
