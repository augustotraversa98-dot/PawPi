# Ticket D2 — Training tab → "Care" hub (Learn + Hire; relocate walker surfaces)

> **Run-note (AUTONOMOUS).** Read `WAVE-CD-README-requests-and-nav.md` first. ⛔ Build on `origin/main` **after D1** (consumes the shared category constant) **and after C** (so the walker request surfaces exist to relocate). Fresh branch; gates green (mobile jest; web vitest + integration unaffected) → squash-merge → **last ticket: STOP + post the end-of-run summary.** **No migration.** Mobile-only. i18n EN+ES. Keep deep links working.

## Goal
Turn the DIY **Training** tab into a **"Care" hub** that groups (a) the existing DIY training curriculum and (b) hiring care providers — walkers, trainers, daycare, sitters — with the walker packages/available/request surfaces (B/C) reachable here. DECISION LOCKS 6, 7, 8. This is the payoff of the "split by intent" IA: **Stores & Vets** (shop/vet) vs **Care** (hire someone to care for the dog).

## Context — what exists
- `(tabs)/training.jsx` = a single-scroll DIY curriculum (`TRAINING_PROGRAMS`, `useSelfTrainingProgress`) with a "Want a pro? Hire a trainer" banner → `/service/training`. Tab label `tabs.training`.
- The segmented-shell pattern to mirror: `(tabs)/services.jsx` (`pane` state + a `GlassSurface` segmented header `[Discover | My Activity]`).
- `ServicesDiscovery` now accepts an allowed-category-set prop (D1); `CARE_CATEGORIES` = `walker`/`daycare`/`sitter`/`trainer` (D1's shared constant).
- Walker owner surfaces to relocate: packages/buy + "you have N walks" + "Show pickup QR" (B2/B3), request-a-walk + find-a-walker-now (C1/C2) — currently on `service/walking.jsx` / the walker storefront.

## Changes
1. **Segmented shell** in `(tabs)/training.jsx`: a `[Learn | Hire]` segment (mirror `services.jsx`).
   - **Learn** = the existing DIY curriculum content verbatim (programs, progress, session modals) — moved under the segment, behavior unchanged.
   - **Hire** = `ServicesDiscovery` restricted to `CARE_CATEGORIES` (walkers/trainers/daycare/sitters) — the same list+map discovery, care-only. The "Want a pro?" banner is unnecessary here (hiring IS the segment) — drop it or fold it into an empty state.
2. **Rename tab** `tabs.training` → **"Care"** (EN) / **"Cuidado"** (ES); update the tab icon to a care-appropriate glyph. Keep the route name `training` (or add a redirect) so deep links/tests resolve — **rename the label + icon, not necessarily the route path** (least churn; confirm expo-router route stability).
3. **Relocate walker surfaces:** ensure the walker storefront reached from the **Hire** segment surfaces packages/buy/QR (B2/B3) and the request-a-walk + find-a-walker-now CTAs (C1/C2). If those already live on the walker provider screen (`service/provider.jsx` / `service/walking.jsx`), they come along for free once Hire routes into them — verify the entry points are present from the Care hub and remove any now-orphaned entry from the old Services location.
4. **Deep links:** wire legacy `?category=walker|daycare|sitter|trainer` (and `/service/walking` etc.) to open the **Care → Hire** segment with that category pre-applied (pair with D1's alias). Non-care deep links still go to Stores & Vets.
5. i18n EN+ES for all new labels; no fake data; real empty states ("No walkers nearby yet").

## Acceptance criteria
- The former Training tab now reads **"Care"** and shows a **[Learn | Hire]** segment: Learn = the untouched DIY curriculum; Hire = care-only provider discovery (walkers/trainers/daycare/sitters) with list+map.
- From Care → Hire, an owner can reach a walker, **buy a pack, show the pickup QR, request a walk, and "find a walker now"** (B/C surfaces reachable here). Stores & Vets no longer lists care providers (D1).
- Legacy care deep-links open the Care hub with the right category; DIY training progress still persists.
- **Gates:** mobile jest green (update `training.test.jsx` for the segmented shell + relocate coverage; keep DIY curriculum tests green); web vitest + integration unaffected. No migration.

## END OF RUN
Last ticket. After merge, STOP and post: the run's PR links (A4, C1, C2, D1, D2); the **migrations to hand-apply** (C1 `~0092` walk_requests + notify types + accept helper; C2 `~0093` broadcast read policy/index if added) with one-line purposes + their `verify_*.sql`; and the **device-pass checklist** (request a walk from one walker → accept → chat; "find a walker now" → nearby available walker notified → accept; Services reads "Stores & Vets" sans care categories; Care tab shows Learn + Hire with walkers/packages/QR/requests reachable).

## MVP decisions (locked; Tats end review)
- Tab "Care"; segments "Learn"/"Hire"; DIY curriculum unchanged, just re-homed. Route path kept for deep-link/test stability (label/icon renamed). All naming is i18n-only and adjustable at review.
