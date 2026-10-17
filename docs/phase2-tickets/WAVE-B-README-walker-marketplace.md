# WAVE B — Walker marketplace core (AUTONOMOUS CONTINUOUS RUN) — READ THIS FIRST

Paste this README into CC first, then build **B1 → B5 in order**, each on its own branch, **auto-merging when green**, continuing to the next without stopping. Tats does ONE review at the end (hand-apply the migrations in order + device pass). This mirrors the Wave-5 autonomy model in `00-README.md`.

## ⚡ AUTONOMY PREAMBLE (applies to every B1–B5 ticket — unattended run)
Tats is away while these are built. Operate fully autonomously:
- **Never ask questions / never stop for input.** Every design fork is already decided below (DECISION LOCKS). If something is still ambiguous, pick the most sensible, on-brand, standard option and proceed — resolve a doubt by choosing, not by pausing.
- **Merge policy:** build each ticket on its **own fresh branch off `origin/main`**; when **all gates are green**, **squash-merge automatically**, then start the next ticket from the freshly-updated `origin/main`. If CI is red, debug → fix → merge once green. Never leave a ticket half-done.
- **Build order matters** (dependencies below) — follow B1→B5; verify `origin/main` actually contains a prerequisite before building on it.
- **Migrations:** leave each new migration in `supabase/migrations/` using the **next free number** at build time (Wave B starts at **≥0088**). **FLAG it at the TOP of the PR body AND in `docs/test-backlog.md` ACTION 1** for Tats to hand-apply to Supabase after the run. **Do NOT auto-apply to Supabase.** The integration harness (`apps/web/test/integration/migrate.ts`) applies every repo migration in ascending order, so your migration + downstream tickets' tests pass locally/CI even though PRODUCTION Supabase is applied later.
- **Degrade clean (non-negotiable):** because prod migrations are applied AFTER the run, all new code must degrade cleanly if its table/column is missing in prod — a missing table/column → **empty / 0 / no-op, never a 500**. Guard reads/writes so an unmigrated prod install behaves like "feature not set up yet."
- **RLS IS LIVE:** every new table ships with RLS **ENABLE + FORCE** + policies from day one, plus as-`pawpi_app` zero-rows harness proofs (owner-scoped / provider-staff-scoped / participant-scoped as fits). Money + pickup/location tables = strict. Reuse helpers: `current_app_user_id()`, `app_is_active_staff_of(provider_id)`, `app_is_provider_admin(provider_id)`, `assertCareAccess(petId, providerId, scope)`; add new SECURITY DEFINER helpers the same way when a policy must read another RLS table (mind recursion).
- **No fake data** anywhere — real API only; empty → empty states; only surface live capabilities.
- **Tests = two-suite canary + mobile jest:** web vitest (mocked, the PR gate) stays green + your net-new; `npm run test:integration` (real-Postgres) for anything DB/RLS — **test API behavior through the REAL Hono router by URL** (`api.request('/providers/…')`, routes registered WITHOUT the `/api` prefix; never import a handler); **404 non-integer ids BEFORE any SQL**. Mobile = jest. Prefer deterministic tests (fake timers over real-timer `waitFor`) to avoid CI flakes.
- **Per ticket, update** the roadmap + `docs/test-backlog.md` as you merge, same as prior waves.

## 💳 Payments caution
Purchases (B2) are **real money** via the shared `createCheckout` (MercadoPago live). Mirror the existing `pets/[id]/shop-checkout` server pattern (build an `orders` row → `createCheckout(order, {rail, idempotencyKey})`); **grant the credit pack in `applyPaymentStatus` on the first transition into `paid`** (idempotent — mirror the product stock-decrement hook), NOT at checkout creation. Do **not** alter the existing checkout/webhook contract; add the new `kind` path additively.

## 🔒 DECISION LOCKS (decided with Tats — do not re-litigate)
1. **"Available now" = a live provider-level toggle PLUS the existing recurring windows (BOTH).** New lightweight live flag; windows are untouched and keep doing scheduled booking.
2. **Live status is PROVIDER-level** ("this business is accepting walks now"), captured with the walker's **current GPS point** at toggle-on + an **auto-expiry** (default **8h**) so a forgotten toggle doesn't show available forever. (Broadcast/area alerts are Wave C, not here.)
3. **Packages = prepaid walk-credit balance.** The walker sets pack **prices** (discount is implicit in per-pack pricing). **Default offerings: single (1), 10-pack, 20-pack.** Offerings are managed on the **web extranet** (alongside `ProviderServices`); owners **buy on mobile**.
4. **Credits are scoped per owner↔provider (the walker's business), usable across the owner's pets.** Balance = `walks_total − walks_used`. Purchase requires the provider to have payments set up (reuse existing gating).
5. **QR pickup:** the **owner's app shows a QR**; the **walker scans it** at pickup (reuse `react-native-qrcode-svg` to render, `expo-camera` `CameraView` to scan — both already deps). The scan verifies a short-lived signed token (owner + pet + provider + expiry), then **atomically deducts 1 credit AND checks in the walk** (creates the `walk_session`) and **captures the walker's current GPS as the pickup point**. The QR flow is the **credit-redemption** path (requires ≥1 credit); a normal non-credit walk uses the existing check-in path unchanged.
6. **Scheduling (B4):** an owner schedules a walk against their pack (a generalized booking, `capability='walker'`, flagged pay-with-credit); the walker confirms. The **credit is consumed at pickup (B3), not at booking**, so a no-show never burns a credit.

## BUILD ORDER (dependencies — ⛔ = hard blocker)
1. **B1 — Walker "Available now" toggle** (migration ~0088). Independent; start first.
2. **B2 — Walk packages (offerings) + credit balance + purchase** (migration ~0089). ⛔ needed by B3/B4.
3. **B3 — QR pickup check-in that deducts a credit + captures pickup** (migration ~0090). ⛔ after B2.
4. **B4 — Schedule a walk against a pack** (migration only if needed). ⛔ after B2 (and pairs with B3's pickup redemption).
5. **B5 — Walker walk history with map** (no migration). ⛔ after B3 (pickup point comes from B3).

## SHARED CONVENTIONS
- **Spine reuse:** reuse the provider spine (`providers`, `provider_staff`, `provider_services`, `provider_capabilities`, discovery, generalized booking `vet_appointments` + `assertCareAccess`, payments `createCheckout` + `orders` + `applyPaymentStatus`, `walk_sessions` 0033, `transport_trips` 0052 as the lifecycle/pickup template). Do NOT rebuild these.
- **Provider web dashboard** = `apps/web/src/app/provider/` (React Router 7, React Query, Tailwind). **Owner/consumer + walker workspace UI** = Expo mobile (`apps/mobile`), i18n EN+ES via `t()` (neutral "tú"). Web dashboard is English-only.
- **Walker workspace** already exists: `apps/mobile/src/app/walker-walks.jsx` (check-in/track/finish), reached from the business hub Today "Walks" quick action (`hasWalker`). Hooks: `useCheckInWalk`, `useTrackWalk`, `useFinishWalk`, `useProviderWalkSessions`. Extend these; don't fork.

## END OF RUN
After **B5 merges green**, STOP. Post a short summary of the 5 PRs + the ordered list of migrations Tats must hand-apply (numbers + one-line purpose), then wait for Tats' review (hand-apply SQL in order + device pass).
