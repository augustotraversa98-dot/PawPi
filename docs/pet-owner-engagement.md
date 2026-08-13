# PawPi — Pet Owner Engagement System (Retention Spec)

**Owner:** Tats · **Designed in Cowork:** 2026-08-13 · **Status of record:** this doc is the DESIGN;
live build status lives in `docs/roadmap.md`. Update this doc when a decision changes.

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

## Open decisions to confirm with Tats (tracked, not blocking)

- **Ring goal per life stage** (puppy/adult/senior) — deferred to post-v1; v1 = same three for all.
- **Streak repair cost** — v1 free one-tap; revisit if abused.
- **Leaderboard min cohort size + neighborhood radius** — set a starting config, tune with real density.
- **Which E4 templates ship first** — milestone + streak are highest-leverage; recap depends on E10.

_When any of these is decided, update THIS doc (per the persist-to-system rule in PawPi_instructions.md)._
