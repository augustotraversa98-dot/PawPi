# Ticket B5 — Walker walk history with map (past walks, route, dog, pickup)

> **Run-note (AUTONOMOUS).** Read `WAVE-B-README-walker-marketplace.md` first. ⛔ Build on `origin/main` **after B3 is merged** (pickup point comes from B3). Fresh branch; gates green → squash-merge → **this is the last ticket: STOP after merge and post the end-of-run summary**. **No migration** (reads existing `walk_sessions` + B3's pickup columns). 404 non-integer ids before SQL. i18n EN+ES.

## Goal
A walker's **history of past walks**: each finished walk with the **route drawn on the map**, **which dog**, **when**, distance/duration, and **where they were picked up** (DECISION LOCK — pickup from B3). Reuses the existing map + walk-session read; no new backend model.

## Context — reuse (don't rebuild)
- `GET /api/providers/[id]/walk-sessions` already returns the walker's own sessions (participant-scoped RLS); it accepts a status filter. Finished sessions carry `route` (jsonb `[{lat,lng,t}]`), `distance_m`, `duration_s`, `started_at/ended_at`, `pet_id`, `photo_urls[]`, and (from B3) `pickup_lat/lng`.
- Map: reuse `components/Health/WalkActivity/WalkerLiveMap` and/or `components/Map/MapLocationView` (Apple Maps on iOS, multi-point route + markers). A pickup marker uses `pickup_lat/lng`.
- Walker workspace: `apps/mobile/src/app/walker-walks.jsx` (the active surface). History is a **separate list/detail**, not the live tracker.

## Changes (mobile-only)
- Extend `useProviderWalkSessions(providerId, { status:'finished' })` (or add a small variant) to fetch finished sessions; add the pet name (join already available via the route or a lightweight lookup — confirm the route returns pet display info; if not, extend the route's SELECT additively to include `pet_name`).
- New screen `apps/mobile/src/app/walker-history.jsx` → `/walker-history` (root-level pushed route, like `walker-walks`): a **list** of past walks newest-first — per row: dog name + date + duration + distance + a small route thumbnail or "view". Tapping opens a **detail** (or expands) with the **full route drawn** (`WalkerLiveMap`/`MapLocationView`), a **pickup marker**, the dog, times, and any walk photos.
- Entry point: from `walker-walks.jsx` (a "History" link/tab) and/or the business hub Today Walks area.
- Empty state: "No past walks yet." Loading/error states real. No fake routes.
- Copy via `t()` (EN+ES).

## Acceptance criteria
- The walker sees a list of their finished walks; opening one draws the real route + pickup marker + shows dog/date/duration/distance/photos.
- Walks with no captured route (older/denied-location sessions) render gracefully (list row + "No route recorded", no crash); pre-B3 sessions with null pickup show no pickup marker.
- **Gates:** mobile jest green (map mocked); web vitest + integration unaffected unless the sessions route SELECT was extended (then add a small integration assertion for the added field + keep RLS proofs green). No migration.
- **Degrade clean:** null `pickup_lat/lng` and empty `route` handled; participant RLS unchanged (a walker sees only their own sessions).

## END OF RUN
This is the last Wave-B ticket. After merge, STOP and post: the 5 PR links, and the **ordered list of migrations Tats must hand-apply** (B1 provider_live_availability; B2 walk_packages + walk_credit_packs + orders kind; B3 walk_sessions pickup cols + app_redeem_walk_credit; B4 vet_appointments.pay_with_credit if added) with one-line purposes, plus the device-pass checklist (toggle available; buy a pack; show/scan QR to start a walk + deduct; schedule a credit walk; view history with map).
