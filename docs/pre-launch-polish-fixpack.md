# PawPi — Pre-launch Polish Fix-pack (PP1–PP3) — autonomous Claude Code run

**Designed in Cowork:** 2026-08-15 · Closes the three buildable items flagged by the pre-launch night run
(`docs/night-run-2026-08-16-report.md`) before App Store submission. Each ticket its own PR: CI-green →
merge → deploy → log. **Live DB is at migration 0112 — next number 0113.** Standing rules apply: no fake
data; EN+ES on every surface; additive numbered migrations + verify; own-row RLS; app runs as pawpi_app;
never break prod (degrade cleanly); keep docs current (Rule 6).

## PP1 — Navigation "layers on layers" (the stacked-modals bug)

**Root cause (found in the night run):** the Search/Discovery screen is registered with
`presentation: "modal"`, so everything opened from it — a pet profile (a card), then the photo/image
viewer — stacks *on top of* the modal, leaving modal-on-modal-on-modal that only a swipe-down/back
dismisses. **Fix:** make Search/Discovery a normal **pushed card screen** (not a modal) so pet profile →
photo push onto a proper back stack with a working back button; ensure opening a pet from Discovery and
tapping a photo each **push as screens** (a full-screen photo viewer may stay a modal, but must never
stack on another modal). Preserve deep links and the tab's initial route. **Mobile-only; no migration.**
**NEEDS ON-DEVICE CONFIRMATION** — implement the fix with reasoning; Tats verifies the feel on device.

## PP2 — EN/ES parity gaps (Apple shows some of these)

The night run flagged two English-only surfaces — both break our EN+ES guardrail, and the iOS permission
strings are shown by Apple at prompt time and in review:
- **iOS permission usage strings.** The `Info.plist` / `app.json` permission descriptions (camera, photo
  library, location, notifications, and any others in use) are English-only. Localize them EN+ES via the
  proper Expo mechanism (per-locale `InfoPlist` strings / `locales` config) so the OS prompt shows the
  right language. Keep the copy accurate to why PawPi needs each (per the App Privacy map).
- **Moderation menu buttons.** The report/block/hide/delete labels in the moderation menu are still
  hardcoded English — wire them through `t()` with EN+ES keys. Sweep for any other hardcoded user-facing
  strings surfaced by the run and localize them too. **Mobile + app config; no migration.**

## PP3 — Basic write rate-limiting (abuse / cost protection before launch)

No app-level rate-limiting exists on writes. Add lightweight per-user (and/or per-IP) rate limits on the
high-risk write endpoints — posts, comments/barks, bookings, reports, follows/paws — returning a friendly
**429** with EN+ES copy. Because the app runs on multiple Railway instances, the limiter must use a
**shared store** (a small DB-backed counter / token bucket, or an equivalent), **not** pure in-memory.
Pick the simplest approach consistent with the stack; if a table is needed it's migration **0113**
(additive, own-row RLS, verify_0113.sql). Sensible default limits (tune later); never rate-limit reads.
Prove with tests (under-limit passes, over-limit 429s, limits are per-user).

## Recommended defaults (take without asking)
- PP1: Search/Discovery = card push; photo viewer may stay modal but never stacked on a modal; keep deep
  links working.
- PP2: use Expo's per-locale InfoPlist strings; moderation keys under a `moderation.*` i18n block (reuse
  if it already exists).
- PP3: DB-backed limiter keyed by user_profiles.id; generous defaults (e.g. posts/comments a few per
  minute, reports a handful per hour); 429 + friendly bilingual message; reads never limited.
- Anything else: simplest option consistent with the standing guardrails; implement + log it.

---

```
PRE-LAUNCH POLISH FIX-PACK DRIVER — PawPi (autonomous, 3 PRs)

MODE: UNATTENDED, AUTONOMOUS run. Build 3 PRs IN ORDER — PP1 nav layers → PP2 EN/ES parity →
PP3 write rate-limiting — each its own PR, CI-green → merge → deploy → log, without asking me
anything. Take the recommended defaults; log any deviation.

ORIENTATION (read first): You are working on PawPi (anything/). Read ARCHITECTURE.md +
supabase/SCHEMA_NOTES.md, then docs/pre-launch-polish-fixpack.md for the ticket briefs +
defaults (context is in docs/night-run-2026-08-16-report.md). Data rules: integer IDs;
owner_user_id = user_profiles.id via the identity chain; additive numbered migrations each with
verify_XXXX.sql; new tables ENABLE+FORCE RLS + app runs as pawpi_app; NO fake data; EN+ES on
every surface; never break prod (degrade cleanly). Live DB is at migration 0112 — use the next
number (0113) only if PP3 needs a table.

PP1 — Navigation "layers on layers": the Search/Discovery screen is presentation:"modal", so a
pet profile and then the photo viewer stack on top of it (modal-on-modal, only swipe/back
dismisses). Make Search/Discovery a pushed CARD screen; ensure pet-from-Discovery and the photo
tap PUSH as screens onto a proper back stack (a full-screen photo viewer may remain a modal but
must never stack on another modal). Preserve deep links + the tab's initial route. Mobile-only,
no migration. Flag NEEDS ON-DEVICE CONFIRMATION in the log.

PP2 — EN/ES parity: (a) localize the iOS permission usage strings (camera, photo library,
location, notifications, etc.) EN+ES via Expo's per-locale InfoPlist mechanism so the OS prompt
shows the right language; keep copy accurate + consistent with the App Privacy map. (b) Wire the
moderation menu labels (report/block/hide/delete) through t() with EN+ES keys, and sweep for any
other hardcoded user-facing strings the run surfaced. Mobile + app config, no migration.

PP3 — Write rate-limiting: add lightweight per-user (and/or per-IP) limits on high-risk writes
(posts, comments/barks, bookings, reports, follows/paws) → friendly 429 with EN+ES copy. MUST use
a shared store (DB-backed counter/token-bucket), not pure in-memory (multiple Railway instances).
If a table is needed, migration 0113 (additive, own-row RLS, verify_0113.sql). Generous default
limits; NEVER limit reads. Tests: under-limit passes, over-limit 429s, per-user isolation.

PER PR: CI-green → merge (merge commit + delete branch) → apply any migration + verify + Railway
healthy (or log "0113 awaits hand-apply" + degrade cleanly) → append a night-run-log.md entry +
update docs/roadmap.md + update docs/night-run-2026-08-16-report.md (flip the flagged items to
FIXED). STOP only if a PR can't go green after real effort (BLOCKED entry, move to the next —
they're independent). Flag PP1 as NEEDS ON-DEVICE CONFIRMATION. START A NEW CLAUDE CODE CHAT.

Begin with PP1. Work through PP3. Don't ask me anything — log it and keep moving.
```

## After this fix-pack
- **PP1** still needs your on-device tap-test (the nav feel) even though the code fix lands.
- Then the remaining path to the App Store is human-gated: **legal review + publish** the policy site,
  and the **Apple submission runbook** (`docs/app-store-submission-runbook.md`).
