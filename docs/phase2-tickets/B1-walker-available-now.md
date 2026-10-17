# Ticket B1 — Walker "Available now" toggle (live status)

> **Run-note (AUTONOMOUS).** Read `docs/phase2-tickets/WAVE-B-README-walker-marketplace.md` first (autonomy + decision locks + degrade-clean + RLS). Fresh branch off `origin/main`; when all gates green (web vitest + integration + mobile jest), **squash-merge and continue to B2**. Migration = next free number (**≥0088**); flag it at the TOP of the PR body + `docs/test-backlog.md` ACTION 1; do NOT auto-apply. Degrade clean if unmigrated (missing table → "not accepting / off", never 500). 404 non-integer ids before SQL. i18n EN+ES for mobile strings.

## Goal
A walker business can flip **"Available now / accepting walks"**. This is a live presence flag **separate from** the recurring `provider_availability` windows (DECISION LOCK 1/2). It auto-expires so a forgotten toggle doesn't linger. (The area **broadcast/alerts** that consume this are Wave C — not here.)

## Data / migration (~0088)
New table `provider_live_availability` (provider-level; DECISION LOCK 2):
- `provider_id integer PK references providers(id) on delete cascade` (one row per provider — upsert),
- `accepting boolean not null default false`,
- `lat numeric(9,6)`, `lng numeric(9,6)` (walker's current point at toggle-on; nullable if location denied),
- `expires_at timestamptz` (default now()+8h on toggle-on; NULL when off),
- `updated_at timestamptz not null default now()`.
- **RLS ENABLE+FORCE.** Read: any authed user MAY read a provider's live status (it's public presence, published providers only — mirror the discover "published" gate; a draft provider's status is not public). Write (upsert): **active staff of the provider** only (`app_is_active_staff_of(provider_id)`). Harness proofs: staff can upsert own; non-staff write → 0 rows; read scoped to published.
- **A row is "available" iff `accepting = true AND expires_at > now()`** — always evaluate expiry at read time (don't rely on a cron to flip it).

## API (web Hono)
- `PUT /api/providers/[id]/live-availability` — active-staff upserts `{ accepting, lat?, lng? }`; on `accepting:true` set `expires_at = now() + interval '8 hours'`; on `false` clear coords + expiry. Gate: `requireProviderCapability(id,'walker')` + `requireProviderRole` + `withRequestContext`. 404 non-integer id before SQL.
- `GET /api/providers/[id]/live-availability` — returns `{ accepting: <accepting && not expired>, expires_at }`. Degrade clean: missing table → `{ accepting:false }`.

## Mobile
- Hook `useProviderLiveAvailability(providerId)` (GET) + `useSetProviderLiveAvailability(providerId)` (PUT; optimistic; invalidate the GET).
- On the **business hub Today** (`business/index.jsx`), for `hasWalker` providers, add an **"Accepting walks now"** switch near the existing Walks quick action. On enable: request foreground location (reuse the `expo-location` pattern from `walker-walks.jsx`/`nearby-walks.jsx`), pass current `lat/lng` (or null if denied — still allowed). Show the live state + a subtle "until HH:MM" from `expires_at`. Toggling off clears it.
- Copy via `t()` (EN+ES). No fake state — reflect the real GET.

## Acceptance criteria
- A walker business can turn "Accepting walks now" on/off from Today; state persists (GET reflects PUT); it **auto-reads as off after `expires_at`**.
- Non-walker providers never see the switch; non-staff cannot write (RLS + gate).
- **Gates:** web vitest + integration green (incl. RLS proofs: staff upsert, non-staff 0-rows, expiry evaluated at read); mobile jest green.
- **Degrade clean** verified: with the table absent, GET returns `accepting:false` and the switch reads off (no 500).

## MVP decisions (already locked; flagged for Tats' end review)
- Provider-level flag, current-GPS point, 8h auto-expiry. If Tats later wants per-staff-walker presence or a chosen service-area instead of live GPS, that's a follow-up.
