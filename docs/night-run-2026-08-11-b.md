# Night-run batch — 2026-08-11 (follow-up B) (READ THIS FIRST)

Four self-contained tickets (`2.93`–`2.96` in `docs/phase2-tickets/`) from on-device feedback after the
2.88–2.92 batch. Shared conventions from [`docs/phase2-tickets/00-README.md`](phase2-tickets/00-README.md)
apply (spine reuse, capabilities model, RLS-on-every-table, squash-merge, migration hand-apply-after-merge,
no fake data, i18n EN+ES neutral "tú"). The ⚡ autonomy preamble from `night-run-2026-08-11.md` applies
verbatim (never ask; CI-green → auto squash-merge; CI-red → fix then merge; keep going; update the bridge
docs + `night-run-log.md` per merge).

## HARD LESSONS (carried from the 2026-08-10/11 sessions — do not relearn)
- **Test API behavior through the REAL router by URL** (`api.request('/api/...')`), never by importing the
  handler — that is exactly what hid the services-reorder 500. New routes: no static-vs-`[param]` shadowing,
  404 a non-integer id before SQL.
- **No internal jargon in user-facing copy** (no "capability", "RLS", etc.).

## Root causes already found (stated so CC fixes the cause, not the symptom)
- **2.95 (adoption not visible):** `GET /api/adoption/listings` HARD-filters by a 100km radius bounding
  box. The 2.91 fix only rescued *coordless* shelters; a shelter WITH a map pin that is OUTSIDE 100km of
  the browsing owner is still dropped. Also the browse requires `al.status = 'available'` — verify the
  create-listing default actually sets that. Both hide a real test listing (Northside).
- **2.96 (Rx section shows when not selected):** the provider dashboard left-nav IS capability-gated
  (`navItemVisible`), but a **"Show all sections" escape hatch** (`showAll` state + button in
  `ProviderShell.jsx` Sidebar, ~lines 330 / 384–395) reveals every section regardless of selection. Remove
  that hatch.
- **2.94 (business posts have no "paws"):** `provider_posts` has comments (0082) + moderation (0066) but NO
  like/paw primitive and no `provider_post_paws` table — so a "Paws" stat + liking a business post is
  net-new and needs a migration. Isolated into its own ticket for that reason.

## Migrations this batch
Only **2.94** adds one (`provider_post_paws`, next free number — 0084 at time of writing; check the dir).
Flag it in `docs/test-backlog.md` ACTION 1; hand-applied by Tats; degrade cleanly pre-apply (missing table
→ 0 paws, like is a no-op, never a 500/crash). 2.93 / 2.95 / 2.96 need NO migration.

## Build order (single serial agent; shared files respected)
1. **2.93** Business Posts → pet-social-profile design parity — mobile, no migration. (no dep)
2. **2.94** "Paws" (likes) on business posts — migration, mobile + web. ⛔ after **2.93** (adds the paw stat
   into 2.93's new header + the like action into its post grid/detail).
3. **2.95** Adoption: surface located-but-far + newly-created listings; apply-to-adopt CTA — web (+ verify
   mobile), no migration. (independent)
4. **2.96** Remove the "Show all sections" nav escape hatch — web, no migration. (independent)

## Recommended order
2.93 → 2.94 → 2.95 → 2.96 (stop at whichever token limit hits; nothing after is lost). One line per merge
in `docs/night-run-log.md`; add the Wave 11 index entries to `00-README.md`.

## Not in scope (deliberately)
Daily moments / video for businesses, and a comment-report menu — still parked for an attended session.
"Follow a business" (2.92) is confirmed working on device — no further work.
