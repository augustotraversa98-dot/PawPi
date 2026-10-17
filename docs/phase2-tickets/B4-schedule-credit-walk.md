# Ticket B4 — Schedule a walk against a pack (owner books, walker confirms)

> **Run-note (AUTONOMOUS).** Read `WAVE-B-README-walker-marketplace.md` first. ⛔ Build on `origin/main` **after B2 is merged** (pairs with B3's pickup redemption). Fresh branch; gates green → squash-merge → continue to B5. Migration only if needed (**~0091**); if added, flag at PR top + `docs/test-backlog.md` ACTION 1; do not auto-apply. Degrade clean. 404 non-integer ids before SQL. i18n EN+ES.

## Goal
An owner with a credit balance **schedules a walk** with the walker (a time they agree on); the **walker confirms** (DECISION LOCK 6). The credit is **NOT** spent at booking — it is consumed at **pickup** (B3), so a no-show never burns a credit. This is a thin layer over the **generalized booking** (`vet_appointments`, `capability='walker'`, ticket 2.4) already used for walks.

## Approach (reuse the booking spine; minimal/no new schema)
- A scheduled credit walk **is a normal walker booking** with a marker that it will be **paid by credit** (not a fresh checkout). Prefer a single additive column on the booking row: `vet_appointments.pay_with_credit boolean not null default false` (migration ~0091, additive, degrade clean) — set true when the owner books from their pack. No new lifecycle: it reuses `requested → confirmed → …` (owner requests, only staff can confirm — same policy as bookings/`transport_trips`).
- At pickup, B3's redeem creates the `walk_session` and decrements the credit. If a booking is linked, pass its `booking_id` into the session (the existing check-in already accepts `booking_id`) so the scheduled walk and the session tie together. Do **not** double-charge: a `pay_with_credit` booking never creates a money order.

## API (web Hono)
- Reuse `POST /api/providers/[id]/book` for the walker booking, extended to accept `pay_with_credit: true`. When true: verify the owner has ≥1 remaining credit with this provider (else 409 "no walks left — buy a pack") and set the flag; do NOT create a checkout. Keep the default (paid) path unchanged. 404 non-integer ids before SQL.
- Booking lists (owner + walker) already exist; surface the `pay_with_credit` flag so the UI can badge "Uses 1 walk".

## Mobile
- **Owner** — on the walker profile / `service/walking.jsx`, when the owner has a balance, a **"Schedule with my pack"** flow: pick a slot (reuse the existing `BookingFormModal` / availability slots), book with `pay_with_credit:true`. Show "Uses 1 of N walks (charged at pickup)". If balance 0 → route to buy a pack.
- **Walker** — the scheduled credit walk shows in the existing bookings agenda (`walker-walks.jsx` / business Bookings) with a **"Uses a walk"** badge; the walker **confirms** via the existing booking Confirm action. At pickup, the QR scan (B3) starts it and spends the credit.
- Hooks: extend the existing booking hook to pass `pay_with_credit`; reuse `useWalkCredits` (B2) to gate.

## Acceptance criteria
- An owner with a balance can schedule a walker booking marked pay-with-credit **without** a checkout; the walker sees it, confirms it; at pickup the credit is spent (via B3) and the session links to the booking. A zero-balance owner is blocked with a buy-a-pack prompt.
- **Gates:** web vitest + integration green — integration proves: a `pay_with_credit` booking is created without a money order; requires a positive balance (409 otherwise); owner cannot self-confirm (staff-only), mirroring booking/`transport_trips` policy; non-integer ids → 404 before SQL. Mobile jest green.
- **Degrade clean:** unmigrated prod (no `pay_with_credit` column) → the flag is ignored / feature greys out; normal paid booking unaffected; no 500.

## MVP decisions (locked; Tats end review)
- Credit consumed at pickup, not at booking. A cancelled/no-show scheduled credit walk simply never spends a credit. Cancellation-window / auto-release policy is a later ticket (flag in test-backlog).
