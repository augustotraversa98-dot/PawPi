# PawPi — Pet Owner Engagement System (Retention Spec)

**Owner:** Tats · **Designed in Cowork:** 2026-08-13 · **Status of record:** this doc is the DESIGN;
live build status lives in `docs/roadmap.md`. Update this doc when a decision changes.

> ✅ **SHIPPED 2026-08-14 — the full E0–E10 wave is built, merged, and live in production.**
> Two autonomous Claude Code runs. E0–E4 = migrations 0094–0095; E5–E10 = PRs #384–#389 +
> docs PR #390, migrations 0096–0099 (all APPLIED + VERIFIED on Supabase). Test baselines at
> completion: mobile jest 1809 · web vitest 1924 · web integration 932. Every feature degrades
> cleanly and is now fully live against the real DB. Per-merge detail: `docs/roadmap.md` +
> `docs/night-run-log.md`. This doc stays the DESIGN of record; the sections below are unchanged
> from the as-built spec except the resolved config knobs at the bottom.

> 🔜 **WAVE 2 (E11–E15) — Household & Retention — DESIGNED + QUEUED 2026-08-14.** Weekly digest, comeback
> loop, shared custody (tiered + multi-caregiver daily-moment carousel + household leaderboard), multi-pet
> household, life-stage ring goals. Full spec + grey-box Claude Code prompts at the **bottom of this doc**.

---

## Why this exists

North star: **daily / weekly active pet owners**, not installs. The thesis: no engaged owners →
no marketplace businesses. PawPi already has the hard social plumbing (daily moments, paws, barks,
follows, share frame, Memories/Wrapped, health/routines, Vet Record + Vet Summary). What's missing is
the **return loop** — a reason the owner opens PawPi tomorrow without being told to.

Unfair advantage: Finch built a business making people care for a *fake* bird. PawPi users already
have a real dog they love. So the whole system reflects that love back daily. **Every mechanic must
celebrate the dog, never shame the owner.**

## Design principles / guardrails (apply to every unit below)

- **Celebrate the dog, never shame the owner.** No guilt copy ("Rex is sad you didn't walk him"), ever.
- **Forgiveness is shipped on day one.** Streak freezes, streak repair, rest/vacation mode. One missed
  day must never feel like the dog was neglected.
- **Health framing is always positive or points toward positive.** Never "less active than other dogs."
  Above cohort → celebrate; below → switch to personal-progress framing or a gentle forward nudge.
- **Never diagnostic.** Health copy tracks changes and prepares vet conversations; it does not diagnose
  (existing PawPi health rule).
- **No fake data.** No seeded fake dogs, fake counts, or fake likes to make things look alive. Empty
  states instead. (One allowed exception, clearly labelled and honest: a "PawPi Welcome" first paw in
  onboarding — see E6.)
- **Location privacy.** Neighborhood features show the dog, never the home location; opt-in; coarse geo.
- **Cold-start honesty.** Density-dependent features (leaderboards, breed cohorts) are built now but
  gated behind a minimum cohort size, so we never ship an empty board that reads as "abandoned app."

## Data rules (every unit)

- Scope by `pet_id` + `owner_user_id`. `owner_user_id` = `user_profiles.id`
  (identity chain: `auth_users.id` → `user_profiles.auth_user_id` → `user_profiles.id` → `pets.owner_user_id`).
- IDs are integers, not uuid. Soft delete (`deleted_at` / `active=false`) where records can be removed;
  preserve health history.
- New tables: `ENABLE` + `FORCE` RLS, own-row policies, app connects as the locked-down `pawpi_app` role.
- Migrations are numbered; Code owns numbering (live DB at 0068, `0069` pending). Use the next available
  number. Every new migration is additive + harness-proven + ships a `verify_XXXX.sql`.
- EN + ES strings for every user-facing surface.

---

## The system at a glance

The **Care Ring is the spine.** Everything hangs off it:

```
                       ┌─────────────────────────────┐
   daily habit  ─────► │        CARE RING (E1)        │  close 3 segments today:
                       │   Walk · Moment · Care       │  (walk logged · moment posted · 1 care action)
                       └──────────────┬──────────────┘
                                      │ closing it =
                                      ▼
                       ┌─────────────────────────────┐
                       │      STREAK + FORGIVENESS    │  (E2) 🔥 days the ring closed
                       └──────────────┬──────────────┘
             ┌────────────────────────┼────────────────────────┐
             ▼                        ▼                        ▼
   MILESTONE MOMENTS (E3)     PACK STREAKS (E7)        LEADERBOARDS (E8, gated)
   birthday/gotcha/adoption   shared streak w/ a       XP from CARE EFFORT
   → animated frame + feed     dog friend + "boop"     (walk/ring/care/paw), not popularity
   event + share card
             │
             ▼
   SHARE CARDS (E4) ─── story-ready, branded → organic growth
             │
   NOTIFICATIONS (E5) ─── triggers, all wanted/positive
             │
   ONBOARDING (E6) ─── first session ends with ring started + first paw
             │
   HEALTH ENGINE ─── the Care segment forces one care action daily; reinforced by
   COMPARATIVE INSIGHT (E9, gated, positive) + VET-SUMMARY PAYOFF + monthly care recap (E10)
```

## Build order (pre-submission vs density-gated)

**Ship pre-submission (great with a single user, make the app feel alive on day one):**
E0 data foundations → E1 Care Ring → E2 Streak + forgiveness → E3 Milestone moments →
E4 Share cards → E5 Notification rewrite → E6 Onboarding D1 polish → E10 Health reinforcement.

**Build the framework now, gate behind cohort size (shine after we have users):**
E7 Pack streaks (works as soon as one friend pair exists — safe pre-submission),
E8 Leaderboards (gate on neighborhood/breed density), E9 Comparative cohort insight
(default to the dog's own history until cohorts are dense).

> New-vs-same CC chat: **E0 + E1 begin a NEW Claude Code chat** (they carry the orientation line).
> E2→E10 continue as focused follow-ups; start a fresh chat at each big boundary (e.g. after E6).

---

## E0 — Data foundations

**Purpose:** the small, shared schema the rest depends on, added once so later units don't each fight
the DB.

**What it adds (only if not already present — Code checks the schema first):**
- `pets.adopted_on` (a.k.a. gotcha day) — a date, nullable. Syncs Dog Profile ↔ Pet Medical Profile per
  the existing shared-field sync rule. `pets.birthday` already exists.
- A per-pet **streak/ring state** table (see E1/E2 for fields) — one row per pet.
- A lightweight **daily activity signal** the ring can read (walks, moments, care logs already exist;
  E0 just confirms each is queryable by `pet_id` + local day in the owner's timezone).

**Guardrails:** additive migration; no backfill of fake dates; timezone = the owner's (America/Buenos_Aires
default but read per-user).

```
Read ARCHITECTURE.md and supabase/SCHEMA_NOTES.md to get oriented, then I'll give you the task.

CONTEXT: We're starting a new "Pet Owner engagement" workstream. The full design is in
docs/pet-owner-engagement.md — read it first; this is unit E0 (data foundations). Do E0 ONLY.

TASK (E0): Add the shared schema the engagement system needs, additively.
- Add pets.adopted_on (date, nullable) — "gotcha/adoption day". If a medical-profile adoption/gotcha
  field already exists, reuse it and wire the Dog Profile ↔ Pet Medical Profile sync for it exactly like
  the other shared fields (name/breed/birthday/etc.). Do NOT duplicate storage.
- Create a per-pet ring/streak state table `pet_care_days` (or the name that fits our conventions):
  id, pet_id, owner_user_id, day (date, owner-timezone), walk_done bool, moment_done bool,
  care_done bool, ring_closed bool, created_at, updated_at — UNIQUE(pet_id, day). ENABLE+FORCE RLS,
  own-row policies via the identity chain, app runs as pawpi_app.
- Add a per-pet streak summary table `pet_streaks`: pet_id (pk), owner_user_id, current_count,
  longest_count, last_closed_day, freezes_available (default 1), paused_until (nullable date), created_at,
  updated_at. RLS same pattern.
- Confirm walks, daily moments/posts, and care/routine logs are each queryable by pet_id for a given
  owner-timezone day (the ring reads these; don't rebuild them).

DATA RULES: integer IDs; owner_user_id = user_profiles.id; additive migration with a verify_XXXX.sql;
no fake/seed data; owner-timezone day boundaries.

ACCEPTANCE: migration applies clean + verify passes; RLS proven (own-row read/write, other-user denied)
through the real router/harness; no existing table's RLS changed; EN+ES not needed yet (no UI in E0).
Also: add E0–E10 to docs/roadmap.md build queue as the "Pet Owner engagement" wave.

When done, get CI green AND merge in ONE go: push → open PR → wait for CI (retrigger with a minimal real
commit if Actions doesn't schedule) → IF all green, merge with a merge commit (repo convention) + delete
the branch + confirm the Railway deploy is healthy; IF any job is red, STOP and report. This BEGINS a new
Claude Code chat.
```

---

## E1 — The Care Ring (the spine)

**Purpose:** turn "be a good dog parent" into one satisfying, closeable daily target — and make the
health-logging habit fall out of it for free.

**What it is:** a single **"Rex's Day"** ring made of three segments the owner fills each day:
**Walk** (≥1 walk logged / walk reminder done), **Moment** (today's photo moment posted), **Care**
(any one care action from Health → Today: meal, meds, wellness/photo check, water). Close all three →
completion animation: "Rex's day is complete 🎉."

**Why it's cheap for us:** the ring is a *visualization layer* over things already tracked (walks, daily
moments, routines/Health-Today). We derive segment state from existing logs; we don't build three new
systems. The Care segment is what quietly drives health updating (E10).

**UX:** ring lives on the Health → Today hub and the dog's profile header. Low goal (one of each, not
three walks + five logs). Tapping a segment deep-links to the action that closes it. Closing animation +
haptic. **Rest/vacation mode** (skip today, or pause for a date range) that keeps the ring/streak intact.
Later (post-v1): life-stage-aware goals (puppy vs senior). v1 = same three for everyone.

**Guardrails:** half-closed ring copy = "one more thing to finish Rex's day", never "you neglected Rex".
Rest mode always visible. No streak damage from a rest day.

```
CONTEXT: Unit E1 of the Pet Owner engagement spec (docs/pet-owner-engagement.md). E0 is merged. Do E1 ONLY.

TASK (E1): Build the daily "Care Ring" as a visualization over existing logs.
- Derive today's three segments for the current pet (owner-timezone day) from existing data:
  Walk = ≥1 walk logged today; Moment = ≥1 daily moment/post today; Care = ≥1 care action today
  (any Health→Today routine completion: feeding / meds / wellness / photo check). Write the derived
  state into pet_care_days (from E0); don't duplicate the source logs.
- Render the ring on Health→Today and on the dog's profile header: three segments, closing animation +
  haptic when all three close ("Rex's day is complete"), tap a segment → deep-link to the action that
  closes it.
- Rest/vacation mode: a "rest day" toggle (today) and a "pause" (date range → pet_streaks.paused_until).
  A rest/paused day does NOT break the ring or the streak.
- Copy is celebrate-the-dog, never shame-the-owner. EN + ES.

DATA RULES: pet_id + owner_user_id scoping; owner-timezone day; no fake data; reads existing
walks/moments/care logs, writes only pet_care_days.

ACCEPTANCE: ring reflects real logs live (log a walk → Walk segment fills without reload); closing all
three fires the animation once; rest/pause preserves ring+streak; scoped to current pet only (other pets'
logs never fill this ring); jest/vitest cover the derivation + the rest-day exemption; EN+ES present.

CI-green + merge in ONE go (push → PR → CI → merge commit + delete branch + Railway healthy; red = STOP).
New-vs-same CC chat: this can continue the E0 chat if it's still fresh, otherwise START A NEW CLAUDE CODE
CHAT (and prepend the orientation line).
```

---

## E2 — Streak + forgiveness (on the ring)

**Purpose:** loss aversion pulls the owner back daily — with a soft landing so it never becomes anxiety.

**What it is:** the streak = **consecutive days the ring closed** (one number, rewards the whole care
habit, not just posting). Shown on profile + feed header ("🔥 12 days"). Forgiveness shipped with it:
one **auto paw-freeze** banked (silently covers a missed day), earn more at milestones; **streak repair**
(one-tap restore within ~1–2 days). Rest/pause (E1) never counts as a miss.

**Guardrails:** the whole point is forgiveness. Never a punishing wipe. A "streak at risk" nudge is the
only streak notification, positive, end-of-day, and only when genuinely one segment from closing (E5).

```
CONTEXT: Unit E2 of docs/pet-owner-engagement.md. E0+E1 merged. Do E2 ONLY.

TASK (E2): Streak + forgiveness on top of the Care Ring.
- On ring-close, advance pet_streaks.current_count (and longest_count); set last_closed_day. A gap of one
  day auto-consumes a banked freeze (freezes_available) instead of resetting; a gap with no freeze resets
  to 0 (but see repair). Rest/paused days are skipped, not counted as gaps.
- Streak repair: if the streak reset within the last ~48h, offer a one-tap "restore your streak" (bank it
  back once); keep it gentle, no paywall for v1.
- Earn freezes at milestone counts (e.g. 7/30/100) — cap the bank (e.g. 2).
- Display: 🔥 count on the profile + feed header; a small "your streak is safe" state when today's ring is
  closed. EN + ES.

DATA RULES: pet_id + owner_user_id; owner-timezone day; all writes to pet_streaks; idempotent (closing the
ring twice in a day doesn't double-count).

ACCEPTANCE: close ring N days → count = N; miss one day with a freeze → count preserved + freeze consumed;
miss with no freeze → reset, then repair restores once; rest/pause never breaks it; tests cover
freeze-consume, reset, repair, and rest-exemption.

CI-green + merge in ONE go. Continue the same CC chat as E1 if fresh; else new chat + orientation line.
```

---

## E3 — Milestone moments (birthday / gotcha / adoption)

**Purpose:** pure identity + emotion + organic sharing; almost no competitor does this well.

**What it is:** on the dog's birthday, gotcha day (`pets.adopted_on`), or adoption anniversary, that day's
moment gets a **special animated frame + ribbon** ("🎉 Rex's Gotcha Day — 3 years"), confetti, and an
auto "share this" CTA (→ E4 card). The **feed treats it as an event**: friends see "It's Rex's Gotcha Day"
and can send paws/barks — a social-reciprocity spike exactly when it feels good. A gentle 3-day countdown
gives a wanted notification (E5).

**Guardrails:** celebratory only; no "you forgot Rex's birthday" if they don't post. Uses real dates only
(no fabricated milestones).

```
CONTEXT: Unit E3 of docs/pet-owner-engagement.md. E0–E2 merged. Do E3 ONLY.

TASK (E3): Milestone moments for birthday / gotcha day / adoption anniversary.
- Detect from pets.birthday and pets.adopted_on (owner-timezone). On a milestone day, that pet's daily
  moment gets a special animated frame + ribbon (e.g. "Rex's Gotcha Day — 3 years") + confetti + a
  "Share this" CTA that opens the E4 share card (if E4 not yet merged, stub the CTA to the existing share
  frame).
- Feed event: followers see a celebratory event card for that pet's milestone and can paw/bark it. No
  fabricated data — only fires when a real date matches.
- Gentle 3-day-before countdown state (feeds E5 notification). EN + ES.

DATA RULES: pet_id + owner_user_id; real dates only; scoped so only that pet's followers see its event.

ACCEPTANCE: set a test pet's birthday/adopted_on to today → frame + ribbon + feed event appear; no
milestone date → nothing appears (no placeholder); countdown shows only in the 3-day window; EN+ES.

CI-green + merge in ONE go. New-vs-same CC chat: START A NEW CLAUDE CODE CHAT if E2's chat is long.
```

---

## E4 — Share cards ("Marco para fotos", leveled up)

**Purpose:** the cheapest growth engine — every shared card is free acquisition + belonging signaling.
Builds on the existing load-gated share frame (2.62).

**What it is:** a small deck of **story-sized (1080×1920), PawPi-branded** templates: milestone card,
"Rex's week in walks", pet-of-the-day badge, "X-day streak", monthly care recap. Consistent visual
identity (tribe belonging), beautiful enough to be proud to post, each carrying the @handle + a deep link
(quiet acquisition). One-tap share to Instagram Stories / WhatsApp / save.

**Guardrails:** real stats only; no fake counts on a card. Handle/link never expose private location.

```
CONTEXT: Unit E4 of docs/pet-owner-engagement.md. E0–E3 merged. Do E4 ONLY.

TASK (E4): Turn the existing share frame into a branded story-card deck.
- Templates (1080×1920, PawPi-branded, EN+ES): (a) milestone card (from E3), (b) "week in walks"
  (walk count + a mini route/summary), (c) "X-day streak" (from E2), (d) pet-of-the-day badge,
  (e) monthly care recap (from E10 when present). Each shows the dog photo + a REAL stat + @handle +
  a deep link back to the pet's profile.
- One-tap share sheet (Instagram Stories / WhatsApp / Save). Reuse the existing share-frame/upload path;
  don't fork a new one.

DATA RULES: pull real stats for the current pet only; no fabricated numbers; deep link uses the public
handle, never location.

ACCEPTANCE: each card renders with real data + degrades to a clean empty state when a stat is 0 (no fake
number); share sheet opens; card carries handle + working deep link; EN+ES.

CI-green + merge in ONE go. Continue E3's chat if fresh; else new chat + orientation line.
```

---

## E5 — Notification rewrite (triggers, all wanted)

**Purpose:** notifications are the external trigger of the habit loop — but only the *wanted* ones.

**What it is:** an audit + rebuild of push categories. **Keep/add:** social (paws, barks, new friend,
"Bella just posted"), milestone (gotcha day + 3-day countdown), and a single **positive** end-of-day
streak-save **only** when the ring is one segment from closing AND the streak is genuinely at risk
("One more thing to finish Rex's day — your 12-day streak is safe"). **Kill:** every guilt/chore push.
Personalize send time to each owner's usual open time; frequency caps; per-category toggles; dormant users
get warmth, not escalation ("Bella misses Rex", not "you haven't opened in 5 days").

**Guardrails:** no guilt, no fake urgency, no badge-spam. Respect caps + toggles.

```
CONTEXT: Unit E5 of docs/pet-owner-engagement.md. E0–E4 merged. Do E5 ONLY.

TASK (E5): Rewrite the notification system around wanted triggers.
- Categories: social (paw/bark/new-follow/friend-posted), milestone (E3 day + 3-day countdown),
  streak-save (fires ONLY if today's ring is 1 segment from closing AND streak>0 AND not already closed;
  once/day, evening, positive copy). Remove/soft-disable any guilt- or chore-flavored notification.
- Per-category user toggles in Settings; a global frequency cap; personalized send time per user (their
  historical open hour, fallback evening local). Dormant re-engagement copy is warm, tied to a friend's
  real activity when available, never guilt.
- EN + ES for all copy.

DATA RULES: scoped per owner/pet; only fire on REAL events (real paw, real milestone date, real at-risk
streak); respect toggles + caps.

ACCEPTANCE: streak-save only fires in the exact at-risk condition (tested); toggles suppress their
category; no notification contains guilt/shame copy (grep the strings); caps enforced; EN+ES.

CI-green + merge in ONE go. START A NEW CLAUDE CODE CHAT for this (notifications touch many surfaces).
```

---

## E6 — Onboarding D1 polish

**Purpose:** D1 retention sets the ceiling for D7/D30, and D1 is won in the first minutes. Today onboarding
likely ends at "profile created" (MVP) — it should end at the emotional payoff.

**What it is:** the first session ends with the ring **started**: profile created → **first moment posted**
(closes the Moment segment) → **first paw received** (a clearly-labelled, honest "PawPi Welcome" paw — not
deceptive fake data) → streak day 1 → birthday + gotcha date captured (so E3 can fire later). Don't force
health data at signup — invite it over the next days via the Care segment. Show the empty ring with
"Take Rex's first photo to close today's ring."

**Guardrails:** the welcome paw is labelled and honest (from an official PawPi account), the one allowed
seeded interaction. Keep it short; progressive disclosure for health.

```
CONTEXT: Unit E6 of docs/pet-owner-engagement.md. E0–E5 merged. Do E6 ONLY.

TASK (E6): Make the first session end with the Care Ring started, not just "profile created".
- Onboarding flow ends with: post the dog's first moment (closes Moment) → receive a first paw from an
  official, clearly-labelled "PawPi Welcome" account (honest, not anonymous fake data) → streak shows
  day 1 → capture birthday + adopted_on (gotcha day) inline (optional but prompted, feeds E3).
- Show the empty ring during onboarding with "Take Rex's first photo to close today's ring."
- Do NOT force medical/health fields at signup; invite them later via the Care segment.
- EN + ES.

DATA RULES: the welcome paw is a real row from a real official account, labelled as such (NOT a fabricated
count); everything scoped to the new pet/owner; birthday/adopted_on stored on the pet.

ACCEPTANCE: a fresh signup finishes with a posted first moment, a visible welcome paw (labelled), streak=1,
and (if entered) birthday/gotcha saved; no medical fields required to finish; EN+ES.

CI-green + merge in ONE go. Continue E5's chat if fresh; else new chat + orientation line.
```

---

## E7 — Pack / shared streaks

**Purpose:** social accountability makes streaks resilient — "our streak", not "my streak". (Duolingo:
one friend streak ≈ +22% daily return.) Works as soon as one friend pair exists, so it's pre-submission-safe.

**What it is:** two dog friends who both close their ring on the same day build a **pack flame** with its
own count + a friendly **"boop"** nudge before midnight. Extendable to a small "pack" (dog-park crew).
Deliberately lower stakes than Snapchat: a broken pack streak celebrates what was built, never blames one
dog. Opt-in.

**Guardrails:** opt-in; no blame framing; freezes apply; lower stakes by design.

```
CONTEXT: Unit E7 of docs/pet-owner-engagement.md. E0–E2 merged (E3–E6 optional). Do E7 ONLY.

TASK (E7): Shared "pack" streaks between dog friends.
- New table pet_pack_streaks: id, pet_a_id, pet_b_id (or a pack_id + members for groups), owner ids,
  current_count, longest_count, last_active_day, created_at, updated_at. ENABLE+FORCE RLS; both owners can
  read/act; own-row write rules. Opt-in only (both accept).
- Advance when BOTH pets closed their ring on the same owner-timezone day. A "boop" action sends a friendly
  nudge notification to the friend if their ring isn't closed yet today (respect E5 caps/toggles). Break
  framing celebrates the run ("you and Bella hit 14 days!"), never blames.
- EN + ES.

DATA RULES: scoped to the two owners/pets; only advances on REAL mutual ring-closes; no fake activity.

ACCEPTANCE: both close → pack count advances; one closes → no advance + boop available; break shows
celebratory copy; RLS proven (only the two owners see/act); tests cover mutual-advance + boop condition.

CI-green + merge in ONE go. START A NEW CLAUDE CODE CHAT.
```

---

## E8 — Neighborhood / breed leaderboards (density-gated)

**Purpose:** competition that pulls people back — and beats Fi/Tractive by being **free + phone-only**
(no $150 collar) and by rewarding **care effort, not popularity**.

**What it is:** Duolingo-league model — cohorts of ~30, weekly reset, tiers with promotion/relegation.
Flavors: neighborhood, breed, friends. **XP comes from care effort**: walk logged, ring closed, care
action, giving a paw (reciprocity) — NOT from likes received, so it's equitable and doubles as a health
incentive. **Gate on density:** show the friends board until a neighborhood/breed cohort has enough dogs;
never render an empty board.

**Guardrails:** XP = effort not popularity; small cohorts + promotion/relegation so most win sometimes;
location is coarse + opt-in, never exposes home; density gate prevents dead boards.

```
CONTEXT: Unit E8 of docs/pet-owner-engagement.md. E0–E2 merged. Do E8 ONLY. This is DENSITY-GATED — it
must degrade to the friends board (or a "coming soon in your area" state) until a cohort is big enough.

TASK (E8): Weekly leaderboards driven by care effort.
- Weekly XP per pet from REAL actions: walk logged, ring closed, care action completed, paw GIVEN
  (reciprocity). Store weekly XP + cohort assignment; reset weekly; tiers with promotion/relegation in
  cohorts of ~30.
- Flavors: friends (always available if the pet has friends), neighborhood (coarse geo, opt-in), breed.
  Neighborhood/breed render ONLY when the cohort has >= a min size (config); otherwise show the friends
  board or a clean "not enough dogs near you yet" state. NEVER show an empty/fake board.
- EN + ES; location coarse + opt-in; never display home location.

DATA RULES: pet_id + owner_user_id; XP only from real actions; geo coarse + opt-in; density gate enforced
server-side.

ACCEPTANCE: XP reflects real actions (giving a paw adds XP; receiving a like does NOT); weekly reset +
promotion/relegation work; a sparse neighborhood falls back to friends/empty-safe state (tested); no home
location leaked; EN+ES.

CI-green + merge in ONE go. START A NEW CLAUDE CODE CHAT.
```

---

## E9 — Comparative health insight (density-gated, always positive)

**Purpose:** make the health layer feel like a *reward*, not a chore — and free vs Fi.

**What it is:** an insight surfaced after logging — "Rex was more active than 80% of Labs his age this
week 🎉" when above cohort. **The rule you set:** always positive or pointing toward positive. Below cohort
→ never "less active than other dogs"; instead **personal-progress** framing ("Rex added 2 walks vs last
week — his best in a month") or a **gentle forward nudge** ("A short evening walk would put Rex back in his
usual range"). **Cold-start:** default v1 to the **dog's own history**; switch on breed-and-age cohorts
only once dense enough. Behavioral only — never diagnostic.

**Guardrails:** positive/forward framing enforced in code (no bare negative comparison ever renders); not
diagnostic; cohort gate; per-pet privacy.

```
CONTEXT: Unit E9 of docs/pet-owner-engagement.md. E0–E1 merged. Do E9 ONLY. DENSITY-GATED + must never
render a negative comparison.

TASK (E9): Comparative health/activity insight as a positive reward.
- v1 default: compare the pet to its OWN history (this week vs prior weeks) — "best week in a month", "2
  more walks than last week". This works with one user.
- When a breed+age cohort is dense enough (config min size), ALSO allow "more active than X% of {breed}s
  his age" — but ONLY when the pet is above median. If below, NEVER show the cohort comparison; fall back
  to personal-progress or a gentle forward nudge. Enforce this in code so no bare negative comparison can
  render.
- Surface it after a care/walk log (reward moment) and on Insights. Behavioral only, NOT diagnostic
  (existing health rule + disclaimer). EN + ES.

DATA RULES: pet_id + owner_user_id; cohort reads are aggregate + gated on min size; no fake cohort; never
diagnostic.

ACCEPTANCE: with one user, personal-history insights render; below-cohort pets NEVER see a negative
comparison (tested); cohort insight only fires above median + above min cohort size; disclaimer present;
EN+ES.

CI-green + merge in ONE go. Continue an E1-lineage chat if fresh; else new chat + orientation line.
```

---

## E10 — Health-update reinforcement (the payoff loop)

**Purpose:** the hardest retention problem in the app (health apps retain worst). Attack it from three
positive angles so owners *want* to keep records current.

**What it is:**
1. **The Care Ring already does the heavy lifting** — one care action closes a segment daily. Add one-tap
   "all good" logging on Health → Today so the Care segment is a single thumb-tap, not a form.
2. **Vet-Summary payoff (unique to PawPi):** make the link explicit — "the more you log, the better the
   summary Rex's vet sees." Surface a live "Vet Summary readiness" nudge that grows as records fill. This
   is the IKEA-effect moat: people won't abandon what they've built.
3. **Monthly care recap** — a positive "Rex's care was 100% this month" card (shareable via E4).

**Guardrails:** positive framing only; the "readiness" nudge celebrates progress, never shames gaps; not
diagnostic.

```
CONTEXT: Unit E10 of docs/pet-owner-engagement.md. E0–E1 merged (E4 optional for the recap card). Do E10.

TASK (E10): Reinforce health logging with positive payoff loops.
- Add one-tap "all good" logging on Health→Today items so closing the Care ring segment is a single tap
  (still writes a real care log, scoped to pet_id).
- "Vet Summary readiness": a positive indicator that grows as the pet's real records fill (meds, weight,
  photo checks, vet visits) with copy "the more you log, the better Rex's next vet summary". Links to the
  existing Vet Summary. Celebrates progress; never shames gaps.
- Monthly care recap: compute the month's real ring/care completion → a positive recap ("Rex's care was
  100% this month") surfaced in-app + as an E4 share card (if E4 merged; else in-app only).
- EN + ES; behavioral, not diagnostic.

DATA RULES: real logs only (no fabricated completeness); pet_id + owner_user_id; reuse the existing Vet
Summary + care/routine tables.

ACCEPTANCE: one-tap log writes a real care log + closes the Care segment; readiness indicator reflects
REAL record counts (0 records → honest empty/low state, no fake); monthly recap uses real completion;
no shame copy (grep); EN+ES.

CI-green + merge in ONE go. START A NEW CLAUDE CODE CHAT if the prior chat is long.
```

---

## Resolved config knobs (as shipped 2026-08-14) — tune with real density

- **Leaderboard min cohort size** — shipped at **5 dogs**. Below that, the neighborhood/breed board
  falls back to the friends board or a clean "not enough dogs near you yet" state. Raise toward ~30
  (Duolingo-league feel) once density supports it.
- **Neighborhood radius** — shipped as a **coarse same-area label** (not a fine GPS radius), opt-in,
  never exposing home location. Revisit the grouping once we have real geographic density.
- **E9 cohort minimum** — shipped at **5**; same tuning logic as the leaderboard cohort.
- **E4 templates that shipped first** — milestone, week-in-walks, X-day streak, pet-of-the-day; the
  monthly care-recap card was filled by E10.

## Open decisions still deferred (post-v1, tracked, not blocking)

- **Ring goal per life stage** (puppy/adult/senior) — deferred; v1 ships the same three for all.
- **Streak repair cost** — shipped free one-tap; revisit only if abused.

_When any of these is decided, update THIS doc (per the persist-to-system rule in PawPi_instructions.md)._

---

# WAVE 2 — Household & Retention (E11–E15)

**Designed in Cowork:** 2026-08-14 · **Status:** DESIGNED + QUEUED (not yet built). This wave extends the
shipped E0–E10 retention system. Same design-of-record rules apply: this doc is the DESIGN; live build
status lives in `docs/roadmap.md`. Update this doc when a decision changes; refresh the Snapshot in
`PawPi_instructions.md` when the wave (or a unit) merges.

## Why this wave

E0–E10 built the daily loop (Care Ring) and its amplifiers. Wave 2 attacks the two return-drivers the
first wave left thin: **belonging** (make caring a shared family act, not a solo one) and **resurrection**
(pull back the owners who slipped out of the loop). The thesis, restated from the retention discussion
with Tats (2026-08-14): social relationships + belonging outlast every mechanic; streaks and reminders are
amplifiers, not the reason people stay. Email/scheduled triggers are NOT a daily nag here — they belong on
a **weekly beat** (E11) and in **reactivation** (E12), exactly the two channels where they earn their keep.

**Build order (chosen with Tats):** E11 Weekly digest → E12 Comeback loop → E13 Shared custody →
E14 Multi-pet household → E15 Life-stage ring goals. Two cheap standalone wins first for momentum, then the
riskiest schema change (custody generalises RLS) isolated, then multi-pet rides on the household model, then
polish. **Run each unit as its own Claude Code session, in this order.** E13 is multi-PR (sequence inside it).

## Guardrails (inherit all E0–E10 principles, plus)

- **Celebrate the family, never shame a co-parent.** The household leaderboard (E13) celebrates
  participation; it never frames the less-active caregiver as failing. Same rule as "never shame the owner".
- **A solo owner is a household of one.** Every household/custody/multi-pet change must be a no-op for a
  single-owner, single-dog account — no regression to shipped behaviour.
- **Real re-surfacing only.** The feed "bump" when a caregiver adds a moment (E13) is real new content, not
  fabricated activity. Comeback hooks (E12) reference REAL friend activity / real dates only.
- **Strict scoping survives sharing.** Access widens from "owner only" to "owner OR accepted caregiver" —
  and NOT one inch further. No cross-household leakage; revoked caregivers lose write, history is preserved.

## Data rules (this wave)

- Identity chain unchanged (`auth_users.id` → `user_profiles.auth_user_id` → `user_profiles.id`). Pet access
  becomes **owner OR accepted caregiver** via a new `pet_caregivers` join (E13). Integer IDs; soft delete;
  preserve health history. New tables ENABLE+FORCE RLS, household-scoped policies, app runs as `pawpi_app`.
- Migrations additive + numbered + `verify_XXXX.sql`. **Live DB is at 0099** — use the next available number.
- EN + ES for every user-facing surface.

## Orientation preamble — prepend to EVERY Wave 2 Claude Code chat

```
You are working on PawPi. The Pet Owner engagement wave E0–E10 is SHIPPED and live (Care Ring, streaks +
forgiveness, milestones, share cards, notification rewrite, D1 onboarding, pack streaks, care-effort
leaderboards, positive health insight, health reinforcement). Design of record: docs/pet-owner-engagement.md.
This is WAVE 2 (E11–E15): Household & Retention. Read ARCHITECTURE.md and supabase/SCHEMA_NOTES.md to orient,
then read the WAVE 2 section of docs/pet-owner-engagement.md for the unit named below. Data rules: integer
IDs; owner_user_id = user_profiles.id via the identity chain; pet access = owner OR accepted caregiver once
E13 lands; additive numbered migrations each with a verify_XXXX.sql; new tables ENABLE+FORCE RLS + app runs
as pawpi_app; NO fake/mock data (empty states only); EN+ES on every surface; celebrate the dog/family, never
shame. Live DB is at migration 0099 — use the next available number. Build the assigned unit ONLY.
```

---

## E11 — "Rex's Week" weekly digest (broad return beat + growth)

**Purpose:** a weekly moment of pride that (a) gives everyone a scheduled reason to come back on a weekly
beat, (b) is a re-entry point for anyone who slipped out of the daily loop, (c) is shareable → organic
growth. **Distinct from E10's monthly recap** — this is weekly, social, and delivered (push + optional
email), not just an in-app card.

**What it is:** an in-app **"Rex's Week"** screen showing this week's REAL stats — walks, ring days closed
(x/7), best moment (most-pawed post of the week), current streak, care actions logged — plus a peek at
friends' dogs ("Bella and Max also had a great week") and a milestone preview if one falls within ~7 days.
Delivered on a fixed weekly cadence (default **Sunday evening, owner timezone**) via **push AND optional
email**, reusing E5's personalised send-time + caps + toggles. One-tap **"Share Rex's week"** → the E4
week-in-walks / recap card. This is the correct home for the "email like Duolingo" instinct: weekly, warm,
shareable — never a daily nag.

**Guardrails:** real stats only; quiet weeks degrade to an honest gentle state ("A quieter week — here's one
nice moment"), never a shame frame; if there's genuinely nothing, a soft forward nudge, no fake numbers. New
**"Weekly digest"** setting with independent push + email toggles.

```
CONTEXT: Unit E11 of docs/pet-owner-engagement.md (WAVE 2). E0–E10 shipped. Do E11 ONLY. (Prepend the Wave 2
orientation preamble.)

TASK (E11): Build the "Rex's Week" weekly digest.
- In-app "Rex's Week" screen: compute this week's REAL stats for the current pet (owner-timezone week,
  Mon–Sun): walk count, ring days closed (x/7), best moment (most-pawed post this week), current streak,
  care actions logged; a small "friends' dogs this week" strip (real friend activity only); a milestone
  preview if pets.birthday/adopted_on falls within ~7 days. Empty/quiet week → honest gentle state, no fake.
- Delivery: a weekly job (default Sunday evening, per-owner timezone) sends a push AND, if opted in, an
  email digest. Reuse E5's personalised send-time, frequency caps, and per-category toggles; add a new
  "Weekly digest" preference with independent push + email switches (default push on, email off).
- One-tap "Share Rex's week" opens the E4 week-in-walks/recap share card with the real stats.
- EN + ES for screen + push + email copy.

DATA RULES: reads existing walks/moments/paws/care logs/streaks scoped to pet_id + owner_user_id for the
week; no new activity storage. Add a small idempotency/state row (e.g. weekly_digest_state: pet_id,
owner_user_id, last_sent_week, channels) so a week is never double-sent. No fabricated stats.

ACCEPTANCE: screen shows real weekly stats live; a seeded week of real logs produces a correct digest; a
quiet week degrades to the gentle state (no fake numbers); the weekly job is idempotent (re-running the same
week doesn't resend); push/email respect the new toggle + E5 caps; share card carries real stats; EN+ES.

CI-green + merge in ONE go (push → PR → CI → merge commit + delete branch + Railway healthy; red = STOP).
START A NEW CLAUDE CODE CHAT for this unit.
```

---

## E12 — Comeback / re-engagement loop (rescue the lapsed)

**Purpose:** reactivate lapsed owners — the cheapest, highest-ROI retention lever — using their existing
investment (dog, history, friends, streak repair) with warmth, never guilt.

**What it is:** define **"lapsed"** server-side (no ring activity for N days, config; default 7). When a
lapsed owner returns, greet them with a **"Welcome back — here's what your pack did"** screen: friends'
dogs' recent real moments, pack-streak status (E7), an upcoming milestone, and a **one-tap streak repair**
(extends E2 repair with a configurable returning-user grace window). The **win-back message** goes on the
right channel — a lapsed user has likely muted daily push, so prefer **email** (plus at most one gentle
push if allowed), tied to a REAL hook: a friend's dog's activity, an upcoming gotcha day, or the E5
celebrate-the-dog dormant line ("Bella misses Rex"). Frequency-capped, escalation-free, one-tap opt-out.

**Guardrails:** no guilt / no streak-shaming; warm, not escalating; caps + toggles respected; **real hooks
only** — if there's no real friend activity, fall back to the dog's own memory ("On this day last year…")
or a soft "pick up where you left off," never fabricated social proof.

```
CONTEXT: Unit E12 of docs/pet-owner-engagement.md (WAVE 2). E0–E11 shipped. Do E12 ONLY. (Prepend the Wave 2
orientation preamble.)

TASK (E12): Build the comeback / re-engagement loop.
- Server-side "lapsed" definition: no ring activity for N owner-timezone days (config, default 7). Track
  lapsed state per owner/pet (reengagement_state: owner_user_id, pet_id, lapsed_since, last_winback_sent,
  channel) for capping + idempotency.
- Win-back message: prefer email (fallback one gentle push if permitted by E5 caps/toggles), tied to a REAL
  hook — a friend's real recent activity, an upcoming birthday/gotcha (pets.adopted_on/birthday), or the E5
  dormant celebrate-the-dog line. If no real hook exists, use the pet's own memory / a soft resume nudge. No
  fabricated activity. Escalation-free, frequency-capped, one-tap opt-out.
- Return experience: on next open after lapse, a "Welcome back — here's what your pack did" screen (friends'
  real recent moments, pack-streak status, next milestone) + one-tap streak repair with a configurable
  returning-user grace window (extends E2; keep it free for v1).
- EN + ES.

DATA RULES: reads last-activity per owner/pet; reuses E5 notifications + E2 repair + memories. Only real
hooks. Scope everything to the owner/pet.

ACCEPTANCE: a pet with no ring activity for N days marks lapsed; win-back fires at most once per cap window
on a real hook (tested), never on a fabricated one; the welcome-back screen shows real friend/memory data or
a clean empty state; one-tap repair restores the streak within the grace window; no guilt/shame copy (grep);
EN+ES.

CI-green + merge in ONE go. START A NEW CLAUDE CODE CHAT.
```

---

## E13 — Shared custody / caregivers (tiered) + multi-caregiver daily moment + household leaderboard

**Purpose:** let a whole family/household care for the same dog — everyone can post the daily moment, log
care, log walks, and contribute to the SHARED ring/streak. This is the wave's biggest belonging lever ("our
dog, our streak") and multiplies daily-active users per pet. **This is the riskiest unit** (it generalises
pet-access RLS), so it is isolated in the build order and sequenced into focused PRs.

**Roles (tiered, chosen by Tats):**
- **Owner / Admin** — the creating owner. Can invite/remove caregivers, set roles, edit the Pet Medical
  Profile, and delete the pet. Single admin for v1 (ownership transfer deferred).
- **Caregiver** — full day-to-day care: post the daily moment, log care/health, log walks, close the ring,
  view everything. Cannot manage membership or delete the pet (and, config, cannot edit sensitive
  medical/insurance fields).
- **Viewer** (optional tier, ship it thin) — walker / sitter / grandparent: read, and optionally log a
  walk/care action, but cannot post to the public social profile. Wire minimal perms now; expandable later
  (this also foreshadows the Walker section).

**Invitations:** invite by handle / email / link; the invitee **accepts** (both-sides opt-in). Revoking a
caregiver is a soft-remove that **preserves the history they contributed**.

**The multi-caregiver daily moment (Tats's design — build exactly this):**
- The daily moment is **per-pet-per-day**, not per-user. Each caregiver may add **one** moment for that pet
  per day (**cap 1 / caregiver / day** — keeps it "the daily moment", prevents spam).
- All of a pet's moments for a given day render as **ONE feed post — a "day card" — containing a horizontal
  carousel** of slides. Each slide is **attributed to its author** ("Posted by Tats", "Posted by Sofia").
- When a **new caregiver adds their moment**, that pet's day-card **re-surfaces to the top of the feed**
  (bump by latest real contribution) so followers re-see it — honest re-surfacing, real new content.
- Paws/barks attach at the **day-card level** for v1 (simplest), with per-slide author shown. (Per-slide
  reactions deferred.)

**Household leaderboard (internal, private to the household):**
- A private view of each caregiver's contributions this week/month: moments posted, care actions logged,
  walks, ring-days contributed. Positive, celebratory framing ("Sofia logged 12 care actions this week 💪"),
  a friendly "most active caregiver" — **never shame the less-active partner** (guardrail: celebrate the
  family). Per-household opt-out if it ever creates friction.

**Shared ring/streak semantics:** the ring + streak stay **per-pet** (shared). ANY caregiver's walk / moment
/ care action fills the shared segment; the streak is the **household's shared streak** (belonging).
Leaderboard attribution rides on a `logged_by` (author `user_profiles.id`) column on the activity rows.

**RLS (the careful part):** introduce `pet_caregivers` (id, pet_id, user_id, role, status, invited_by,
accepted_at, revoked_at). Generalise pet-scoped read/write policies from "owner only" to "owner OR accepted
caregiver" across the pet-scoped tables (posts/moments, care logs, walks, pet_care_days, pet_streaks, health
records per the medical-field role rule, etc.). Prove: an accepted caregiver can read/write the pet's data; a
non-caregiver cannot; NO cross-household leakage; a revoked caregiver loses write but contributed history
remains; a solo owner is unaffected (household of one).

```
CONTEXT: Unit E13 of docs/pet-owner-engagement.md (WAVE 2). E0–E12 shipped. Do E13 ONLY. This is the riskiest
unit (it generalises pet-access RLS) — be surgical, additive, and prove RLS. Sequence it as THREE PRs in one
focused chat/wave: (1) caregiver model + RLS generalisation + invites/roles; (2) multi-caregiver daily-moment
day-card carousel + feed bump; (3) household leaderboard. (Prepend the Wave 2 orientation preamble.)

TASK (E13):
PR1 — Caregiver model + access:
- New table pet_caregivers (id, pet_id, user_id, role IN owner/caregiver/viewer, status IN pending/accepted/
  revoked, invited_by, accepted_at, revoked_at, created_at, updated_at). ENABLE+FORCE RLS.
- Generalise pet-scoped RLS from "owner only" to "owner OR accepted caregiver" across pet-scoped tables
  (posts/moments, care/health logs, walks, pet_care_days, pet_streaks, and medical fields per the existing
  role/shared-field rule). Owner/Admin = manage membership + edit medical + delete pet; Caregiver = full
  day-to-day except membership/delete (+ config on sensitive medical fields); Viewer = read + optional
  walk/care log, no public post. A solo owner must be unaffected.
- Invites: invite by handle/email/link → invitee accepts (both-sides opt-in). Revoke = soft-remove, history
  preserved. EN+ES.
PR2 — Multi-caregiver daily moment:
- Daily moment becomes per-pet-per-day; each caregiver may add ONE moment/day (cap enforced). Render a pet's
  day's moments as ONE feed "day card" with a horizontal carousel; each slide attributed to its author.
  Adding a new caregiver's moment bumps that day-card to the top of the feed (real re-surfacing). Paws/barks
  at day-card level for v1; show per-slide author. EN+ES.
PR3 — Household leaderboard:
- Private-to-household view of per-caregiver contributions this week/month (moments, care logs, walks,
  ring-days contributed) via a logged_by author column on activity rows. Positive framing, "most active
  caregiver", never shame the less-active; per-household opt-out. EN+ES.

DATA RULES: pet access = owner OR accepted caregiver (and no further); integer IDs; soft delete; logged_by =
user_profiles.id; ring/streak stay per-pet (shared); no fake data.

ACCEPTANCE: accepted caregiver can post/log/close-ring for the shared pet; non-caregiver denied; revoked
caregiver loses write but their history remains; NO cross-household leakage (RLS proven via the real
router/harness as pawpi_app); solo-owner behaviour unchanged; daily moment caps at 1/caregiver/day and
renders as an attributed carousel that bumps on new contribution; shared ring closes from ANY caregiver's
action and the streak is shared; leaderboard reflects real per-caregiver counts with no shame copy (grep);
EN+ES throughout.

CI-green + merge each PR (push → PR → CI → merge commit + delete branch + Railway healthy; red = STOP).
START A NEW CLAUDE CODE CHAT; keep all three PRs in this one chat/wave.
```

---

## E14 — Multi-pet household (owner/household with 2+ dogs)

**Purpose:** first-class support for households with multiple dogs — each dog keeps its own
ring/streak/profile, but the owner gets a clean household view + fast switching, so a two-dog family isn't
fragmented. Protects high-LTV multi-dog users. **Rides on E13's household model** (a "household" is the set
of pets a user owns or co-cares for; E13 is the many-people side, E14 the many-pets side).

**What it is:** a **household/home view** listing all the household's dogs with each one's ring status +
streak at a glance; a fast **pet switcher** in the header (avatars) so ring / health / profile / feed
authoring always respect the active pet. Optional **"family streak"**: a household-level flame that advances
on days when every active dog's ring closed (or a softer "all dogs cared for" metric) — forgiveness-aware,
opt-in, a belonging bonus.

**Guardrails:** strict pet scoping preserved (no cross-pet data bleed — existing rule); each dog's history +
streak independent; the family streak never shames one dog for another's miss.

```
CONTEXT: Unit E14 of docs/pet-owner-engagement.md (WAVE 2). E0–E13 shipped. Do E14 ONLY. Builds on E13's
household model. (Prepend the Wave 2 orientation preamble.)

TASK (E14): Multi-pet household support.
- Household/home view: list all of the household's dogs (owned + co-cared via pet_caregivers) with each
  dog's ring status + streak at a glance; tap to switch active pet.
- Fast pet switcher in the header (avatars); ring, health, profile, and feed authoring all respect the
  active pet (no cross-pet bleed — each dog's ring/streak/history stays independent).
- Optional "family streak": a household-level flame advancing on days when every active dog's ring closed
  (forgiveness-aware; opt-in). Never shames one dog for another. EN+ES.

DATA RULES: pets already keyed by owner/caregiver; strict per-pet scoping preserved; family-streak is
additive (household_streaks or a derived aggregation); no fake data.

ACCEPTANCE: a household with 2+ dogs sees all of them with correct per-dog ring/streak; switching pets scopes
every surface correctly (no data bleed, tested); a single-dog account is unchanged; family streak advances
only when all active dogs' rings closed and is forgiveness-aware; EN+ES.

CI-green + merge in ONE go. START A NEW CLAUDE CODE CHAT.
```

---

## E15 — Life-stage ring goals (puppy / adult / senior)

**Purpose:** make the daily Care Ring feel personalised and credible by adapting targets to the dog's life
stage — the explicitly-deferred item from the E-series ("Ring goal per life stage").

**What it is:** derive **life stage** from age (birthday) + size/breed where available (puppy / adult /
senior thresholds, config; senior varies by size — larger dogs age faster). The ring stays **three
closeable segments** — life stage tunes *what counts / the copy / suggested actions*, not the number of
segments. E.g. puppies → shorter, more frequent walks / potty check; seniors → a lower walk bar + a gentle
wellness/comfort emphasis; adults → the current three. Copy adapts ("A short senior-friendly walk closes
Rex's ring"). The owner can **override** the detected stage.

**Guardrails:** never diagnostic; positive framing; a senior dog is never judged against a puppy's bar;
override always available; conservative defaults; EN+ES.

```
CONTEXT: Unit E15 of docs/pet-owner-engagement.md (WAVE 2). E0–E14 shipped. Do E15 ONLY. (Prepend the Wave 2
orientation preamble.)

TASK (E15): Life-stage-aware Care Ring goals.
- Derive life stage (puppy/adult/senior) from pets.birthday + breed/size where available (config thresholds;
  senior scaled by size). Store a per-pet life_stage with an owner override.
- Adapt the ring WITHOUT changing its three-segment shape: tune what counts / suggested actions / copy per
  stage (puppies → shorter more-frequent walk + potty; seniors → lower walk bar + wellness/comfort emphasis;
  adults → current). Never punish a senior against a puppy's bar. EN+ES copy per stage.
- Owner can override the detected stage in Dog Profile.

DATA RULES: reads pets.birthday/breed/size; additive per-pet life_stage + override; no fake data; behavioral,
not diagnostic.

ACCEPTANCE: a puppy/adult/senior test pet each gets stage-appropriate ring targets + copy; the ring is still
three closeable segments; override changes the stage and persists; defaults are conservative; nothing
diagnostic; EN+ES.

CI-green + merge in ONE go. START A NEW CLAUDE CODE CHAT.
```

---

## Wave 2 open decisions (tracked, not blocking)

- **Ownership transfer / multiple admins** — v1 ships a single Owner/Admin per pet; transfer + co-admins
  deferred.
- **Per-slide reactions on the day card** — v1 keeps paws/barks at the day-card level; per-slide reactions
  deferred.
- **Family-streak metric** — "every dog's ring closed" vs a softer "all dogs cared for"; pick during E14
  with a real multi-pet account and record the choice here.
- **Sensitive-medical-field editing by caregivers** — shipped config-gated; default to owner-only edit of
  insurance/microchip; revisit with real family usage.

_When any of these is decided, update THIS doc (persist-to-system rule, PawPi_instructions.md Rule 5)._
