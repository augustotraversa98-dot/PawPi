# PawPi — Wave 2 Finish + Fix-pack (FF1–FF3 + BX1–BX2) — autonomous Claude Code run

**Designed in Cowork:** 2026-08-14 · Closes the three deferred Wave 2 niceties + two on-device bugs
Augusto found. Same discipline as the Wave 2 run: each ticket its own PR, CI-green → merge → deploy →
log, autonomous, recommended defaults, no questions. **Live DB is at migration 0106 — next number is 0107.**

## Tickets (build in this order)

**BX2 — Walker "Scan QR" close (X) not tappable (simulator).** On the pet-walker QR pickup scanner (B3:
scan → deduct credit + check in), the close **X** does not respond to taps in the simulator. Almost
certainly a touch-layering issue: the camera/scanner view sits above the X (zIndex / absolute
positioning), a parent has `pointerEvents="none"`, the hit target is too small, or `onPress` isn't wired.
Fix: render the close control **above** the camera layer with correct `zIndex` + `pointerEvents="auto"`,
adequate `hitSlop`, and a working `onPress` (close/goBack). Add a component test if the harness allows.
**Final tap confirmation is on the simulator/device — CC can't tap the simulator — so implement the most
probable fix with reasoning and flag it for on-device verification in the log.**

**BX1 — Business account: no profile / log out on mobile.** Business/staff accounts on mobile have no
profile/account section and no way to sign out (pet-owner accounts have this under "More"). Find the
pet-owner logout/profile implementation (the More tab + the `signOut` call) and add an equivalent
profile/account section to the business mobile experience (business home/nav): account identity
(name/email/business), the standard settings entry points that apply, and a working **Log out** that
clears the session and returns to auth. **An account can be BOTH staff AND a pet owner** — keep the
existing pet-owner "More" intact and make sure logout works from both. EN+ES.

**FF1 — Per-user language for digest / win-back emails.** E11/E12 emails default to `es-AR` because
there's no server-side per-user locale — an English user would get a Spanish email (breaks the EN+ES
guardrail). Add a per-user locale column to `user_profiles` (migration 0107, additive, nullable → falls
back to `es-AR` so current behaviour is preserved; `verify_0107.sql`). Populate it from the app's current
locale on login/signup via a small prefs write (reuse Settings if a hook exists). The weekly-digest email
(E11 sender) and win-back email (E12 sender) render in the recipient's stored locale, `es-AR` when null.
Add a language control in Settings if none exists. EN+ES.

**FF2 — Caregiver in-app logging buttons (walks / health beyond the daily moment).** 0049 RLS already
permits an accepted `family` caregiver to write care/health/walk logs, but the app buttons / route gates
aren't wired for caregivers beyond the daily moment. Broaden the relevant route gates to
owner-OR-caregiver (consistent with E13 / `app_user_has_pet_access`) for care/health/walk logging, and
surface the log buttons (log walk, log care/health) for accepted caregivers on the shared pet, respecting
the E13 role map (`family` = full day-to-day; `caregiver`/Viewer = read or limited). Writes attribute the
logger correctly (owner_user_id = the logger, per the as-built attribution model). Prove RLS + gates via
the harness. EN+ES.

**FF3 — Day-card into the main feed.** The multi-caregiver **DayCard** carousel component +
`/api/pets/[id]/day-card` endpoint exist (E13 PR2) but aren't rendered in the main feed. Integrate them:
group a pet's same-day daily moments (multiple caregivers) into a single DayCard carousel with per-author
slides + bump-to-top on a new contribution; a single-author day renders as a clean one-slide card.
Non-moment posts and existing feed behaviour must NOT regress. Reuse the existing endpoint/component and
integrate surgically — no risky full feed rewrite. Tests for grouping + no-regression. EN+ES.

## Recommended defaults (take without asking)
- BX2: the close control is a real button above the camera layer; if the scanner library needs an overlay
  wrapper, add one with `pointerEvents="box-none"` so only the button captures touches.
- BX1: mirror the pet-owner More/settings/logout exactly; put the business profile entry in the business
  home header or nav. Dual staff+owner accounts keep both surfaces.
- FF1: locale column `preferred_locale text null`; values `en` / `es`; fallback `es-AR`; populate from the
  device locale on next login.
- FF2: `family` caregiver = full logging; `caregiver`/Viewer = read-only for now (no health writes) unless
  0049 already grants it — match 0049, don't widen RLS.
- FF3: group by (pet_id, owner-tz day); keep the existing single-post render for non-daily-moment posts.
- Anything else: simplest option consistent with the E0–E10 guardrails; implement + log it.

---

```
FIX-PACK DRIVER PROMPT — PawPi Wave 2 Finish + bug fixes (autonomous, sequential)

MODE: UNATTENDED, AUTONOMOUS run. Build these five tickets one after another, IN ORDER —
BX2 → BX1 → FF1 → FF2 → FF3 — each its own PR, without pausing to ask me anything. Resolve
every decision yourself using the "Recommended defaults" in docs/wave2-finish-fixpack.md +
the ticket briefs there. Log everything as you go.

ORIENTATION (read first): You are working on PawPi. Wave 2 (E11–E15, Household & Retention)
is shipped and live; migrations 0100–0106 are applied + verified. Read ARCHITECTURE.md and
supabase/SCHEMA_NOTES.md to orient, then read docs/wave2-finish-fixpack.md for the ticket
you're building (full briefs + defaults). Data rules: integer IDs; owner_user_id =
user_profiles.id via the identity chain; pet access = owner OR accepted caregiver (0049 model
— do NOT widen RLS beyond it); additive numbered migrations each with a verify_XXXX.sql; new
tables ENABLE+FORCE RLS + app runs as pawpi_app; NO fake/mock data (empty states only); EN+ES
on every surface; celebrate the dog/family, never shame. Live DB is at migration 0106 — use
the next available number (0107).

PER-TICKET LOOP — repeat for BX2, BX1, FF1, FF2, FF3 IN ORDER:
1. Read the ticket brief + defaults in docs/wave2-finish-fixpack.md.
2. Implement that ticket ONLY, surgically. Additive migrations where needed; RLS per the 0049
   model; EN+ES; no fake data.
3. Get CI GREEN: push → open PR → wait for CI (retrigger with a minimal real commit if Actions
   doesn't schedule). If ANY job is red, FIX IT and re-run until green. Never merge red.
4. When ALL green: merge (merge commit per repo convention) + delete the branch.
5. DEPLOY: apply any new migration + run its verify_XXXX.sql; confirm the Railway deploy is
   healthy. If you can't apply the migration in this environment, log "migration NNNN awaits
   hand-apply" and continue — do not block.
6. LOG before the next ticket: append an entry to docs/night-run-log.md — ticket, PR number,
   migration number (if any), test deltas (jest/vitest/integration before→after), every
   decision + which default you took, any deviation + why, deploy/verify status, and — for
   BX2 — an explicit "NEEDS ON-DEVICE CONFIRMATION" note. Update docs/roadmap.md's status
   mirror.
7. Move to the next ticket.

STOP CONDITIONS — only these; otherwise keep going:
- A ticket cannot be made green after genuine, repeated fixing → STOP and write a clear
  "BLOCKED" entry in docs/night-run-log.md (failing jobs, what you tried, best next step).
  (Tickets are independent — you MAY skip a truly-blocked ticket and continue to the next,
  but log the skip loudly.)
- A destructive/irreversible action not authorised above would be required → log it and stop.
- Do NOT stop merely because a decision is ambiguous — resolve it via the defaults and log it.

CLOSE (after FF3): write a short "Wave 2 Fix-pack" summary at the top of docs/night-run-log.md
(tickets shipped, PRs, migration, final test baselines, what still needs on-device confirmation)
and refresh the PawPi_instructions.md snapshot if anything user-facing changed.

Begin now with BX2. Work straight through FF3. Don't ask me anything — log it and keep moving.
```

## Notes for the Cowork/design side (not for CC)
- These close the three deferrals recorded in the Wave 2 "AS BUILT" section of
  `docs/pet-owner-engagement.md` + two on-device bugs (business logout, walker QR close).
- BX2 is the one that needs Augusto to confirm the tap on the simulator after merge.
- FF1 fixes a real EN+ES guardrail gap; harmless in the current Spanish-first market but a latent bug the
  moment there are English users.

---

# Business-side follow-ups (BX3 · BX4) — added 2026-08-15

On-device testing of the BX1 business logout surfaced two more items. Captured here so the
business/provider work is documented (per Rule 6 — docs always mirror the as-built system).

## BX3 — Business Settings dropped into the pet-owner app + back went to the feed — ✅ SHIPPED

**Bug:** business Profile → "Settings" did `router.push("/(tabs)/more/settings")`, pushing into the
PET-OWNER tab group — so the user landed in pet-owner context and the settings back arrow returned to
the pet feed instead of the business Profile. **Fix:** extracted the settings UI into a shared,
route-agnostic component and gave the business its own in-context settings route (back → business
Profile); pet-owner More → Settings unchanged. Mobile-only, no migration. Merged + verified on device.

## BX4 — Business-specific notification settings (mode-aware + functional) — 🔨 IN FLIGHT (CC)

**Why:** after BX3, the business Settings screen still showed the PET-OWNER notification categories
(social / milestone / streak / care) + the Walk-tracking / Apple Health block — none apply to a
provider. Businesses receive REAL server-sent notifications (`app_notify` / `safeNotify`,
`apps/web/src/app/api/utils/notify.js`) for booking lifecycle + chat.

**Decisions (Tats, 2026-08-15):**
- **Category set = FULL**, but audited-real only: Booking requests · Booking updates
  (confirmed/cancelled/rescheduled) · Client messages · Reviews · Payments/payouts — CC shows only the
  categories that actually fire today; omits any that don't yet exist (no fake toggle) and logs what it
  found vs omitted.
- **Toggles must be FUNCTIONAL (server-side).** New `notification_prefs` table (migration 0108, own-row
  RLS); `app_notify`/`safeNotify` consult the recipient's pref for a business category and no-op when
  disabled. `GET/PUT /api/notification-prefs`.
- **Mode-aware shared settings:** the shared AppSettings component (from BX3) renders `mode="business"`
  from the business route (business categories, hides pet categories + Walk-tracking) vs `mode="petOwner"`
  (default, unchanged). EN+ES.
- **Deliberate split (logged):** business categories go server-side; the pet-owner E5 client-side
  (AsyncStorage) prefs stay as-is this ticket. Unify later if desired.

**Structure:** 2 PRs in one CC chat (PR1 server prefs + gating; PR2 mode-aware UI), each CI-green →
merge → deploy → log. Full ticket prompt: this doc's history / the Cowork chat 2026-08-15. Needs
on-device confirmation of the business Settings visual after merge. As-built detail will be logged by CC
in `docs/night-run-log.md` on merge.

> **Note:** a dedicated `docs/business-provider.md` design-of-record should be started as the business/
> provider surface grows (logout, settings, notifications, and the deeper provider dashboard work) — the
> business side currently has no single living spec doc.
