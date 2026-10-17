# Ticket B2 — Walk packages (offerings) + prepaid credit balance + purchase

> **Run-note (AUTONOMOUS).** Read `WAVE-B-README-walker-marketplace.md` first. ⛔ Build on `origin/main` **after B1 is merged**. Fresh branch; gates green → squash-merge → continue to B3. Migration = next free (**~0089**); flag at PR top + `docs/test-backlog.md` ACTION 1; do not auto-apply. Degrade clean if unmigrated. **Real money** — mirror the `shop-checkout` pattern; grant credits in `applyPaymentStatus` on first→`paid` (idempotent), never at checkout creation. 404 non-integer ids before SQL. i18n EN+ES.

## Goal
A walker sets **walk packages** (single / 10 / 20 by default; walker sets each price). An owner **buys** a pack → a **prepaid credit balance** scoped per owner↔provider, usable across the owner's pets (DECISION LOCK 3/4). Credits are **spent at pickup** (B3) — this ticket only creates offerings + purchase + balance read.

## Data / migration (~0089)
1. `walk_packages` (the walker's offerings): `id`, `provider_id references providers(id) on delete cascade`, `walks_count int not null check (walks_count > 0)`, `price_cents int not null check (price_cents >= 0)`, `currency text not null default 'ARS'`, `active boolean not null default true`, `created_at`. Index on `(provider_id)`. **RLS**: public read of `active` packages for published providers (mirror `provider_services` read policy); admin/staff FOR ALL write (`app_is_active_staff_of`/`app_is_provider_admin`).
2. `walk_credit_packs` (the owner's purchased balance): `id`, `owner_user_id references user_profiles(id)`, `provider_id references providers(id)`, `walks_total int not null`, `walks_used int not null default 0`, `order_id references orders(id)`, `purchased_at timestamptz default now()`, `active boolean not null default true`. Indexes on `(owner_user_id, provider_id)`. **RLS**: owner reads/uses their own (`owner_user_id = current_app_user_id()`); provider **active staff** may READ balances of their own provider (so the walker sees a customer's remaining walks at pickup); the **decrement** is done by a SECURITY DEFINER helper in B3, not a raw owner update. Harness proofs: owner sees own; other owner → 0 rows; staff of provider reads own provider's, not another's.
3. `orders` — add the new `kind` value **`'walk_package'`** to whatever CHECK/enum constrains `orders.kind` (additive; keep existing kinds). No other order change.

## API (web Hono)
- Offerings CRUD (staff): `GET/POST /api/providers/[id]/walk-packages`, `PATCH/DELETE …/[packageId]` — gate `requireProviderCapability(id,'walker')` + role. Soft-delete via `active=false`. 404 non-integer ids before SQL.
- Public read: extend the provider public profile (`/api/providers/public/[slug]`) to also return `walk_packages` (active only) so the storefront/booking can show them — additive, degrade clean (missing table → `[]`).
- Purchase: `POST /api/pets/[id]/walk-package-checkout` (mirror `pets/[id]/shop-checkout`): body `{ provider_id, walk_package_id, rail }`. Server reads the package price from `walk_packages` (never trust client), builds an `orders` row `kind='walk_package'` (status `pending`), calls `createCheckout(order, {rail, idempotencyKey})`, returns `{ order, checkoutUrl, deeplink, qrContent }`. Provider-payments gating identical to shop-checkout.
- **Grant on paid:** in `applyPaymentStatus`, on the first transition of a `kind='walk_package'` order into `paid`, **insert a `walk_credit_packs` row** (`walks_total = package.walks_count`, `order_id`) — idempotent (guard on `order_id` so a re-delivered webhook doesn't double-grant). Mirror the product stock-decrement hook location.
- Balance read: `GET /api/pets/[id]/walk-credits?provider_id=` OR `GET /api/providers/[id]/walk-credits` (owner side) returning remaining = `sum(walks_total - walks_used)` for active packs, per owner↔provider.

## Mobile
- **Owner:** on the walker storefront / `service/walking.jsx` provider view, show the packages ("Single / 10 / 20", price each) with a **Buy** CTA → `walk-package-checkout` → hand to the existing payment surface (same as shop). After purchase, show **"You have N walks with <business>"**. Empty state when none.
- Hooks: `useWalkPackages(providerId)` (public read), `useBuyWalkPackage()`, `useWalkCredits(providerId)`.
- **Walker (web extranet):** a **Walk packages** editor in `ProviderServices.jsx` (or a sibling section) to add/edit/deactivate packages with a price each; **seed the three defaults (1/10/20)** as suggested rows the walker can price and activate (not auto-created rows — offer them, real data only).

## Acceptance criteria
- A walker can create/price/deactivate packages on web; owners see active packages on the walker profile and can buy one; a **paid** order grants a credit balance exactly once; balance read shows remaining across the owner's pets for that provider.
- **Gates:** web vitest + integration green — integration proves: package CRUD gated; purchase builds a `walk_package` order + createCheckout; `applyPaymentStatus`→paid grants credits **idempotently** (second webhook = no double-grant); RLS proofs for both tables; non-integer ids → 404 before SQL. Mobile jest green.
- **Degrade clean:** unmigrated prod → packages read `[]`, purchase route no-ops/greys, balance reads 0 — never a 500.

## MVP decisions (locked; Tats end review)
- Discount is implicit in per-pack price (no explicit % field). Credits per owner↔provider across pets. No expiry/refund policy in v1 (candidate for a later ticket — flag in test-backlog).
