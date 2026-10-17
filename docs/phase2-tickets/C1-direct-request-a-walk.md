# Ticket C1 — Direct "request a walk" from a specific walker

> **Run-note (AUTONOMOUS).** Read `WAVE-CD-README-requests-and-nav.md` first (autonomy + decision locks + degrade-clean + RLS). ⛔ Builds on the merged walker/booking/threads/notifications spine. Fresh branch off `origin/main`; gates green (web vitest + integration + mobile jest) → squash-merge → continue to C2. Migration = next free (**~0092**); flag at PR top + `docs/test-backlog.md` ACTION 1 + a `verify_0092.sql`; do not auto-apply. Degrade clean. 404 non-integer ids before SQL. i18n EN+ES.

## Goal
An owner picks a **specific walker** and **requests a walk**. The walker is notified, **accepts**, and that opens a chat + creates a confirmed walker booking so both sides can coordinate. This introduces the shared `walk_requests` model (C2 reuses it for broadcast). DECISION LOCKS 1, 2, 4.

## Data / migration (~0092)
1. `walk_requests`:
   - `id`, `owner_user_id references user_profiles(id) on delete cascade`, `pet_id references pets(id) on delete cascade`,
   - `target_provider_id integer references providers(id) on delete cascade` (**set = direct/C1**; null = broadcast/C2),
   - `pickup_lat numeric(9,6)`, `pickup_lng numeric(9,6)`, `note text`,
   - `when_type text not null default 'now' check (when_type in ('now','scheduled'))`, `scheduled_at timestamptz`,
   - `status text not null default 'open' check (status in ('open','accepted','cancelled','expired'))`,
   - `accepted_provider_id integer references providers(id)`, `accepted_at timestamptz`,
   - `expires_at timestamptz not null default now() + interval '2 hours'`, `created_at timestamptz not null default now()`.
   - Indexes: `(owner_user_id)`, `(target_provider_id, status)`, `(status, expires_at)`.
   - **RLS ENABLE+FORCE:** owner does ALL on their own rows (`owner_user_id = current_app_user_id()`, insert pinned to `status='open'`); **provider active staff** may READ rows targeted at their provider (`target_provider_id` = one they staff) — the broadcast read policy comes in C2. Accept is a DEFINER helper (below), not a raw staff UPDATE. Harness proofs: owner sees own; another owner → 0; targeted provider staff read the targeted row; non-target staff → 0.
   - **A request is live iff `status='open' AND expires_at > now()`** — evaluate expiry at read time.
2. Widen `notifications` type CHECK (mirror 0080) to add: `walk_request_targeted`, `walk_request_broadcast`, `walk_request_accepted`, `walk_request_taken` (all four now, so C2 needs no notify migration).
3. **DEFINER helper `app_accept_walk_request(request_id, provider_id)`** — atomically: authorize caller is active staff of `provider_id`; verify the request is still `open` AND not expired AND (targeted at this provider OR — for C2 — a broadcast the provider is eligible for); flip to `accepted` + set `accepted_provider_id/accepted_at`; return the row (or NULL if already taken/expired/unauthorized → the route maps NULL to 409 "already taken"). This is the single claim path (race-safe: the UPDATE `WHERE status='open'` is the lock).

## API (web Hono)
- `POST /api/walk-requests` — owner creates: body `{ pet_id, target_provider_id, pickup_lat?, pickup_lng?, note?, when_type, scheduled_at? }`. For C1 `target_provider_id` is required. On insert, `safeNotify` the target provider's… (notify the provider — use a provider-staff fanout helper or notify the provider admin; simplest: notify via `app_notify` to the provider's active staff — see note*). 404 non-integer ids before SQL.
- `GET /api/providers/[id]/walk-requests?status=open` — the walker's incoming targeted requests (active staff; capability `walker`). Degrade clean → `[]` if table missing.
- `GET /api/pets/[id]/walk-requests` (or `/api/walk-requests?mine=1`) — the owner's own requests + their status.
- `POST /api/providers/[id]/walk-requests/[requestId]/accept` — active staff accepts: call `app_accept_walk_request`; on success (a) `safeNotify` the owner (`walk_request_accepted`), (b) **open a chat thread** owner↔provider (reuse the idempotent thread open — same mechanism as the adoption thread route / `POST /api/threads`), (c) **create a walker booking** (server-side call into the existing book flow: `capability='walker'`, `pay_with_credit=true` if the owner has ≥1 credit with this provider else normal; a `scheduled` request uses `scheduled_at`, a `now` request uses the near-term slot). Return `{ request, thread_id, booking_id }`. NULL from the helper → **409 "already taken"**. 404 non-integer ids before SQL.
- `PATCH /api/walk-requests/[requestId]` — owner cancels their own open request (`status='cancelled'`).

\*Notifying a provider's staff: reuse the existing per-provider notify pattern (how booking requests already notify the provider on a new booking — mirror that recipient resolution). Keep `safeNotify` fire-and-forget.

## Mobile
- **Owner** — on a walker's storefront / `service/walking.jsx`, a **"Request a walk"** CTA opens a small form (pet picker, optional note, now/scheduled, optional pickup = current GPS) → `POST /walk-requests` with `target_provider_id`. Show the owner their request + live status ("Waiting for <walker>…", "Accepted — open chat", "Expired"). On accept, deep-link into the opened chat (`provider-chat`).
- **Walker** — in `walker-walks.jsx` (or business Today), an **"Incoming requests"** list of open targeted requests with **Accept**; Accept → `…/accept`, then drop into the chat / the created booking. A taken/expired request greys with "No longer available".
- Hooks: `useCreateWalkRequest`, `useMyWalkRequests`, `useProviderWalkRequests(providerId)`, `useAcceptWalkRequest(providerId)`. Notifications: add tap-routing for the new types in `handleNotificationTap.js`.
- Copy via `t()` (EN+ES). Empty/loading/error states real.

## Acceptance criteria
- An owner can request a walk from a specific walker; the walker sees it and accepts; on accept a chat opens, a walker booking is created, and the owner is notified. A second accept (or an expired request) returns 409/greys out.
- **Gates:** web vitest + integration green — integration proves: create + owner-scope RLS; targeted-provider read; `app_accept_walk_request` is race-safe (two accepts → one wins, other 409); accept opens the thread + booking; expiry evaluated at read; non-integer ids → 404 before SQL. Mobile jest green.
- **Degrade clean:** unmigrated prod (no table/helper) → create/list no-op to empty, accept → friendly 503, never 500.

## MVP decisions (locked; Tats end review)
- 2h auto-expiry; accept creates a booking + chat; credit-funded if the owner has a pack. Cancellation/rescheduling of the created booking uses the existing booking flows.
