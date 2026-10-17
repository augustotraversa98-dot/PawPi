# Ticket C2 — Broadcast "find a walker now" to nearby available walkers

> **Run-note (AUTONOMOUS).** Read `WAVE-CD-README-requests-and-nav.md` first. ⛔ Build on `origin/main` **after C1 is merged** (reuses `walk_requests` + `app_accept_walk_request` + the notify types) and uses **B1's** `provider_live_availability` (on `main`). Fresh branch; gates green → squash-merge → continue to D1. Migration only if an index is needed (**~0093**, flag it); otherwise none. Degrade clean. 404 non-integer ids before SQL. i18n EN+ES.

## Goal
An owner posts **"find a walker now"** — a broadcast walk request (no specific walker). Every walker business that is **live-available now** (B1 toggle) and **near** the pickup point is notified; the **first to accept claims it** (DECISION LOCK 3). Reuses the C1 `walk_requests` row (`target_provider_id = null`) and the C1 accept path.

## Data
- **No new table.** A broadcast request is a `walk_requests` row with `target_provider_id IS NULL` + `pickup_lat/lng` required.
- **RLS addition (small migration only if needed, ~0093):** extend the `walk_requests` provider read policy so **active staff of a walker provider may READ `open`, non-expired, broadcast rows** (`target_provider_id IS NULL`) — needed so a notified walker can open the request. Scope reads to walker-capability providers. If this can be expressed by widening the C1 policy without a new migration, prefer that; otherwise add `0093_walk_requests_broadcast_read.sql`. (Optional index on `provider_live_availability(accepting)` for the fanout query.)
- Broadcast eligibility: a provider is a candidate iff it holds `walker` AND `provider_live_availability.accepting = true AND expires_at > now()` AND its live point (`lat/lng`) is within `radius_km` of the request pickup (haversine, mirror `/discover`). No PostGIS.

## API (web Hono)
- Extend `POST /api/walk-requests` (from C1): when `target_provider_id` is null, require `pickup_lat/lng` + accept `radius_km` (default **5**). After insert, **fan out**: SELECT candidate providers (query above), then `safeNotify` each candidate's staff with type `walk_request_broadcast` (fire-and-forget; reuse the C1 provider-staff notify resolution). Cap the fan-out (e.g. nearest 25) and `log()`-note if capped. Return the created request.
- `GET /api/providers/[id]/walk-requests?scope=broadcast` — a walker's nearby open broadcast requests (active staff, walker capability): the same candidate query, filtered to this provider's eligibility, newest first. Degrade clean → `[]`.
- **Accept** reuses C1's `POST /api/providers/[id]/walk-requests/[requestId]/accept` + `app_accept_walk_request` unchanged (the helper already flips `open→accepted` atomically → first wins; losers get 409 → "already taken"). On accept, also `safeNotify` the OTHER notified candidates with `walk_request_taken` (optional, best-effort) so their list can clear.

## Mobile
- **Owner** — a prominent **"Find a walker now"** action (in walker discovery / `service/walking.jsx`): captures current GPS (reuse the `expo-location` pattern), optional note + now/scheduled, posts the broadcast. Show a live "Looking for a nearby walker…" state that resolves to "Accepted by <walker> — open chat" or "No walker available — try again / request a specific walker" on expiry. (Reuse the C1 request-status UI.)
- **Walker** — the incoming-requests list (from C1) gains a **"Nearby now"** section of broadcast requests (distance + pickup); **Accept** uses the C1 flow. A taken request greys ("Taken by another walker").
- Hooks: extend `useCreateWalkRequest` (broadcast branch), add `useNearbyWalkRequests(providerId)`. `handleNotificationTap.js` already routes the new types (added in C1).
- Copy via `t()` (EN+ES).

## Acceptance criteria
- An owner posts a broadcast request; a walker business that is **accepting-now within 5km** is notified and can accept; the first accept wins and opens the chat + booking (C1 path); other walkers see it taken. A walker who is **not** accepting-now, or is out of radius, is **not** notified and does not see it.
- **Gates:** web vitest + integration green — integration proves: broadcast create fans out only to live-available, in-radius, walker-capable providers; the read policy admits an eligible walker and rejects an ineligible one (RLS proof); accept race-safe (reused); non-integer ids → 404 before SQL. Mobile jest green.
- **Degrade clean:** unmigrated prod (no live table / no broadcast policy) → fan-out finds no candidates and the feature reads "no walkers available", never a 500.

## MVP decisions (locked; Tats end review)
- Radius default 5km; fan-out cap 25 nearest; targeting keyed to B1's live point + `accepting`. Owner sees the accepting walker; direct 1:1 chat opens on accept. No auto-assignment/ETA/geofence in v1 (later candidates — flag in test-backlog).
