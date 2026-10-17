# Ticket B3 — QR pickup: scan → deduct a credit + check in the walk + capture pickup

> **Run-note (AUTONOMOUS).** Read `WAVE-B-README-walker-marketplace.md` first. ⛔ Build on `origin/main` **after B2 is merged**. Fresh branch; gates green → squash-merge → continue to B4. Migration = next free (**~0090**); flag at PR top + `docs/test-backlog.md` ACTION 1; do not auto-apply. Degrade clean. 404 non-integer ids before SQL. i18n EN+ES.

## Goal
At pickup the **owner shows a QR**, the **walker scans it** (DECISION LOCK 5). The scan **atomically**: (a) verifies a short-lived token, (b) **deducts 1 credit** from the owner's balance with that provider, (c) **checks in the walk** (creates the `walk_session`, status `in_progress`), (d) **captures the walker's current GPS as the pickup point**. One action starts the walk AND spends the credit. Reuses the existing check-in path (`useCheckInWalk` / `POST /api/providers/[id]/pets/[petId]/walk-sessions`).

## Data / migration (~0090)
- **`walk_sessions` additive columns:** `pickup_lat numeric(9,6)`, `pickup_lng numeric(9,6)`, `credit_pack_id integer references walk_credit_packs(id)` (which pack a credit was spent from; NULL for non-credit walks). Additive only — every existing consumer keeps working. No RLS change (0033 participant policy still governs).
- **SECURITY DEFINER helper** `app_redeem_walk_credit(provider_id, pet_id, pickup_lat, pickup_lng)` → performs, in one transaction: authorize the caller is active staff of `provider_id` (return NULL/raise if not); find the oldest active `walk_credit_packs` for (owner of pet, provider) with `walks_used < walks_total` (derive owner from `pets.owner_user_id`); if none → signal "no credits"; else `walks_used += 1`, INSERT a `walk_sessions` row (`status='in_progress'`, `started_at=now()`, `pickup_lat/lng`, `credit_pack_id`), and RETURN the new `session_id`. Mirrors `app_approve_adoption`'s definer/atomic style. This is the ONLY path that decrements a credit (the owner cannot self-decrement — RLS in B2).

## Token (stateless, signed — no table)
- The owner's QR encodes a **signed short-lived token**: payload `{ owner_user_id, pet_id, provider_id, exp }` signed server-side (reuse the app's existing token/crypto util — same family as `tokenCrypto.js`/password-reset tokens). Default TTL ~5 min. Endpoint `GET /api/pets/[id]/walk-pickup-token?provider_id=` returns the token for the owner to render.
- Verify server-side on scan; reject expired/tampered/foreign tokens.

## API (web Hono)
- `POST /api/providers/[id]/walk-pickup/redeem` — body `{ token, lat, lng }`. Gate `requireProviderCapability(id,'walker')` + role. Verify token (matches this provider; not expired). Call `app_redeem_walk_credit(...)`. Returns `{ session_id }` on success; **409 "no credits"** when balance is 0 (friendly, actionable → owner buys a pack); 401/403 on bad token/role. 404 non-integer id before SQL.
- (Non-credit walks keep using the existing `pets/[petId]/walk-sessions` check-in unchanged — this route is the credit-redemption path.)

## Mobile
- **Owner** — a **"Show pickup QR"** action (on the pet's walk surface / `service/walking.jsx` live section, or the pet header): fetch the token, render with `react-native-qrcode-svg` `<QRCode value={token} />` (same lib as `emergency-card.jsx`); show the walker's remaining-credits count; the QR refreshes as the token nears expiry.
- **Walker** — in `walker-walks.jsx`, a **"Scan pickup"** button opens an `expo-camera` `CameraView` scanner (`barcodeScannerSettings={{ barcodeTypes:['qr'] }}`, `onBarcodeScanned`) with `useCameraPermissions`. On scan → `POST …/walk-pickup/redeem` with the token + current GPS. On success, drop straight into the existing live-walk tracking for the returned `session_id` (reuse the current track/finish flow). On **409 no-credits**, show "No walks left — ask the owner to buy a pack." Handle permission-denied and bad-QR gracefully.
- Hooks: `useWalkPickupToken(petId, providerId)` (owner), `useRedeemWalkPickup(providerId)` (walker).

## Acceptance criteria
- Owner shows QR → walker scans → exactly **one** credit is deducted, a `walk_session` is created `in_progress` with the walker's GPS as pickup, and the walker lands in live tracking — **one action**.
- Zero balance → 409 with a buy-a-pack message; **no** session created, **no** decrement. Expired/foreign token → rejected. Double-scan of the same token does not double-deduct (token TTL + the redeem is per-scan; guard against replay within TTL by design — acceptable for MVP, note in test-backlog).
- **Gates:** web vitest + integration green — integration proves: redeem deducts exactly one credit + creates the session atomically; no-credit → 409 + no writes; non-staff → 403; token for provider A rejected at provider B; non-integer ids → 404 before SQL. Mobile jest green (scanner mocked).
- **Degrade clean:** unmigrated prod (no pickup columns / helper) → redeem route no-ops to a clear "not available yet" (never 500); existing non-credit check-in unaffected.

## MVP decisions (locked; Tats end review)
- Owner-shows / walker-scans; credit spent at pickup (not booking); pickup = walker's current GPS. Replay protection is TTL-only in v1 (a one-time-use token store is a later hardening — flag).
