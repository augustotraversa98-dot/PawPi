# PawPi — Wave 2 (E11–E15) autonomous Claude Code run

Paste the block below as ONE Claude Code session. It builds E11 → E15 in order, gets each
green, deploys, fixes if red, takes the recommended defaults without asking, and logs
everything into `docs/night-run-log.md` + flips the `docs/roadmap.md` status mirror.

Full unit specs (what each grey-box references): `docs/pet-owner-engagement.md` → "WAVE 2".

---

```
MASTER DRIVER PROMPT — PawPi Wave 2 (E11–E15), autonomous sequential run

MODE: This is an UNATTENDED, AUTONOMOUS run. Build the entire Pet Owner "Household &
Retention" wave — units E11 → E12 → E13 → E14 → E15 — one after another, in that exact
order, WITHOUT pausing to ask me anything. Resolve every product/technical decision
yourself using the "Recommended defaults" below + the spec. Never wait for input. Log
everything as you go so I can review afterward.

ORIENTATION (read first):
You are working on PawPi. The Pet Owner engagement wave E0–E10 is SHIPPED and live (Care
Ring, streaks + forgiveness, milestones, share cards, notification rewrite, D1 onboarding,
pack streaks, care-effort leaderboards, positive health insight, health reinforcement).
Read ARCHITECTURE.md and supabase/SCHEMA_NOTES.md to orient, then read the "WAVE 2" section
of docs/pet-owner-engagement.md — each unit E11–E15 has a full design + its own paste-ready
task block; follow them exactly. Data rules: integer IDs; owner_user_id = user_profiles.id
via the identity chain; pet access = owner OR accepted caregiver once E13 lands; additive
numbered migrations each with a verify_XXXX.sql; new tables ENABLE+FORCE RLS + app runs as
pawpi_app; NO fake/mock data (empty states only); EN+ES on every surface; celebrate the
dog/family, never shame. Live DB is at migration 0099 — use the next available number.

PER-UNIT LOOP — repeat for E11, E12, E13, E14, E15 IN ORDER:
1. Read that unit's section in docs/pet-owner-engagement.md.
2. Implement the unit ONLY. (E13 = its three PRs in sequence, in this same run.) Additive
   migrations, RLS exactly as specified, EN+ES, no fake data, celebrate-not-shame.
3. Get CI GREEN: push → open PR → wait for CI (retrigger with a minimal real commit if
   Actions doesn't schedule). If ANY job is red, FIX IT and re-run until green. Never merge red.
4. When ALL green: merge (merge commit per repo convention) + delete the branch.
5. DEPLOY: apply the new migration(s) + run verify_XXXX.sql; confirm the Railway deploy is
   healthy. If you cannot apply the migration in this environment, log it as "migration NNNN
   awaits hand-apply" and continue — do not block.
6. LOG (before starting the next unit): append an entry to docs/night-run-log.md — unit,
   PR number(s), migration number(s), test deltas (jest / vitest / integration before→after),
   EVERY decision you made + which recommended default you took, any deviation from spec + why,
   and deploy/verify status. Flip that unit's ☐→✅ in the docs/roadmap.md Wave 2 status mirror.
   If a decision changed the design, update docs/pet-owner-engagement.md too.
7. Move to the next unit.

RECOMMENDED DEFAULTS — take these without asking (they resolve the spec's open decisions):
- Custody roles: tiered — Owner/Admin, Caregiver, Viewer (as spec). Single Owner/Admin per
  pet in v1; no ownership transfer yet.
- Daily moment: per-pet-per-day, cap 1 moment/caregiver/day; one "day card" carousel with
  per-author slides; bump-to-top on a new contribution; paws/barks at day-card level (no
  per-slide reactions in v1).
- Household leaderboard: ON by default, per-household opt-out; positive framing only, never
  shame a co-parent.
- Sensitive medical fields (insurance/microchip): owner-only edit; caregivers cannot edit
  them in v1.
- Lapsed threshold (E12): 7 days. Win-back prefers email + at most one gentle push; real
  hooks only.
- Weekly digest (E11): Sunday evening in the owner's timezone; push default ON, email default
  OFF; reuse E5 caps/send-time.
- Family streak (E14): advances only on days when EVERY active dog's ring closed;
  forgiveness-aware; opt-in.
- Life stage (E15): puppy/adult/senior from birthday + size (senior scaled by size); owner
  override; ring stays three segments.
- Anything not covered here: pick the simplest option consistent with the E0–E10 guardrails,
  implement it, and LOG the choice. Never pause for me.

STOP CONDITIONS — only these; otherwise keep going:
- A unit cannot be made green after genuine, repeated fixing → STOP the wave (do NOT build
  later units on a broken base) and write a clear "BLOCKED" entry in docs/night-run-log.md:
  the failing jobs, what you tried, your best next step.
- A destructive/irreversible action would be required that isn't authorised above → log it
  and stop.
- Do NOT stop merely because a decision is ambiguous — resolve it via the defaults and log it.

WAVE CLOSE (after E15 merges + deploys):
- Refresh the Snapshot block in PawPi_instructions.md to reflect Wave 2 as shipped (Rule 5).
- Write a final Wave 2 summary at the TOP of docs/night-run-log.md: units shipped, all PRs +
  migrations, final test baselines, every decision taken, anything deferred, Railway health.

Begin now with E11. Work straight through E15. Don't ask me anything — log it and keep moving.
```
