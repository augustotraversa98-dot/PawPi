# RUN: A4 + WAVE C + WAVE D (AUTONOMOUS CONTINUOUS RUN) — READ THIS FIRST

Paste this README into CC first, then build **A4 → C1 → C2 → D1 → D2 in order**, each on its own branch, **auto-merging when green**, continuing to the next without stopping. Tats does ONE review at the end (hand-apply the C migrations in order + device pass). Same model as the merged Wave-B run (`WAVE-B-README-walker-marketplace.md`).

## ⚡ AUTONOMY PREAMBLE (applies to every ticket in this run)
- **Never stop for input.** Every fork is decided below (DECISION LOCKS). Resolve any residual ambiguity by choosing the sensible, on-brand, standard option and proceeding.
- **Merge policy:** each ticket on its **own fresh branch off `origin/main`**; when **all gates green**, **squash-merge automatically**, then start the next from the freshly-updated `origin/main`. Red CI → fix → merge. (This **supersedes** any "PR and STOP" line inside an individual ticket — including A4's — for this run.)
- **Build order:** A4 → C1 → C2 → D1 → D2. Honor ⛔ blockers; verify a prerequisite is on `origin/main` before building on it.
- **Migrations:** next free number at build time (this run starts at **≥0092**). FLAG each at the TOP of the PR body + `docs/test-backlog.md` ACTION 1; **do NOT auto-apply to Supabase** (Tats hand-applies post-run). The integration harness applies repo migrations so gates pass. Add a `supabase/verify_00XX.sql` per migration (every row PASS).
- **Degrade clean (non-negotiable):** new code must no-op if its table/column/function is missing in prod (empty / 0 / friendly 503, never a 500) — merged-but-unapplied must be harmless.
- **RLS ENABLE+FORCE** on every new table + as-`pawpi_app` zero-rows harness proofs. Reuse helpers (`current_app_user_id()`, `app_is_active_staff_of`, `assertCareAccess`); add SECURITY DEFINER helpers for cross-table/cross-user writes (mind recursion) — the claim/accept path is a DEFINER helper (mirror `app_approve_adoption` / `app_redeem_walk_credit`).
- **No fake data** (empty states only). **Tests:** web vitest (gate) + real-Postgres integration (test through the REAL router by URL, no `/api` prefix; **404 non-integer ids before SQL**) + mobile jest. Prefer fake timers over real-timer `waitFor`. Update roadmap + test-backlog per ticket.
- **i18n:** every new mobile string through `t()` in **en.json AND es.json** (neutral "tú"). Web dashboard is English-only.

## 🔒 DECISION LOCKS (decided with Tats — do not re-litigate)
**Requests (C):**
1. **One `walk_requests` model** serves both: an owner creates a request; `target_provider_id` **set** = C1 direct (to one chosen walker), **null** = C2 broadcast (to nearby available walkers). Statuses: `open → accepted → cancelled | expired`; auto-expire (default **2h**). **First provider to accept wins** (atomic DEFINER claim; late accepts get "already taken").
2. **C1 direct:** owner requests from a specific walker's profile → notify that provider → walker accepts → request `accepted`, notify owner, **open a chat thread** for coordination, and create a **walker booking** (reuse `POST /providers/[id]/book`, `capability='walker'`; `pay_with_credit:true` if the owner has a pack, else normal). The walk then runs via the existing check-in / B3 QR pickup.
3. **C2 broadcast:** owner "Find a walker now" captures pickup GPS + radius (default **5km**) → **fan-out notifications** (via `app_notify` / `safeNotify`) to providers holding `walker` that are **live-available now** (B1 `provider_live_availability.accepting = true AND not expired`, within radius of the toggle-on point) → first to accept claims it (same accept path as C1). Reuses `walk_requests` broadcast rows — no second table.
4. **Notifications:** reuse the `notifications` table + `app_notify`; widen the type CHECK with `walk_request_targeted`, `walk_request_broadcast`, `walk_request_accepted`, `walk_request_taken`. Add the tap-routing cases in `handleNotificationTap.js`.
5. **Entry points (pre-D):** C surfaces "Request a walk" (direct) on the walker storefront/`service/walking.jsx`, and "Find a walker now" (broadcast) in the walker discovery. **D2 later relocates these into the Care hub** — build them where walkers live today; D2 moves them.

**Navigation (D):**
6. **D1 — Services → "Stores & Vets".** Rename the tab label (EN+ES) and **scope its discover categories** to non-care: Veterinary (`vet`/`groomer`/`telehealth`), Shops (`shop`/`pharmacy`), Pet-friendly places, Insurance, Adoption, Transport. **Remove the care categories** (`walker`/`daycare`/`sitter`/`trainer`) from this hub — they move to Care. Extract the category taxonomy (currently `SERVICE_CATEGORIES` in `ServicesDiscovery.jsx`) into a shared constant so both hubs read from one source.
7. **D2 — Training → "Care" hub.** Rename the tab **"Care"** (EN+ES; keep the DIY curriculum as a **"Learn"** segment). Restructure `(tabs)/training.jsx` into a segmented shell (mirror `services.jsx`'s `[Discover|My Activity]` pattern): **"Learn"** (the existing DIY `TRAINING_PROGRAMS` content, untouched) + **"Hire"** (reuse `ServicesDiscovery` restricted to the **care** capabilities `walker`/`daycare`/`sitter`/`trainer`). **Relocate** the owner walker surfaces (packages/available-now/request-a-walk from B/C) so owners find them here. The "Want a pro? Hire a trainer" banner folds into the Hire segment.
8. **Naming lock:** tab = **"Care"**; segments = **"Learn"** / **"Hire"**. (Tats can rename at end review — it's i18n only.)

## BUILD ORDER (⛔ = hard blocker)
1. **A4** — Adoption web parity (group-by-dog + message applicant). See `A4-adoption-web-parity-group-and-message.md`. No migration. *(Independent — do first.)*
2. **C1** — Direct "request this walker" (`walk_requests` + accept + notify + booking + chat). Migration ~0092. ⛔ builds on the merged walker + booking + threads spine (all on `main`).
3. **C2** — Broadcast "find a walker now" to nearby available walkers. ⛔ after C1 (reuses `walk_requests` + accept) and B1's live table (on `main`). Migration only if an index is needed.
4. **D1** — Rename Services → "Stores & Vets" + scope categories. No migration. ⛔ extract the shared category constant here (D2 consumes it).
5. **D2** — Training → "Care" hub (Learn + Hire; relocate walker surfaces). No migration. ⛔ after D1 (shared category constant) — and after C (so the request surfaces exist to relocate).

## END OF RUN
After **D2 merges green**, STOP. Post: the 5 PR links; the ordered **migrations to hand-apply** (C1's 0092 + any C2 index) with one-line purposes; and a **device-pass checklist** (request a walk from one walker → walker accepts → chat opens; broadcast "find a walker now" → an available nearby walker gets notified → accepts; confirm Services now reads "Stores & Vets" with care categories gone; confirm the Care tab shows Learn + Hire and walkers/packages live there).
