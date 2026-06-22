# PawPi demo / screenshot seed plan

Purpose: populate **one dedicated demo account** with attractive, realistic data so App Store
screenshots (and the App Review demo login) don't look empty. This is the **only** sanctioned use of
seeded content — it lives as real DB rows scoped to the demo account, never as mock data in the app,
and the seed script must never auto-run in production. Real users still get empty states.

Images live in `demo-assets/` (royalty-free, Unsplash License). Resize/compress on upload — several
are 3–5 MB originals.

---

## The demo account

- A normal account created through the usual sign-up flow, then seeded.
- Suggested login (use as the App Review demo account too): **demo@pawpi.app** / **[strong password]**.
- All seeded rows are owned by this account's `user_profiles.id` (`owner_user_id`). The vet clinic is
  a separate provider record (its own staff account or admin-owned, per the provider model).

## The dog (hero profile)

| Field | Value |
|---|---|
| Name | Mango |
| Handle | @mango |
| Breed | Golden Retriever |
| Sex | Female |
| Birthday | [a date ~3 years ago] |
| Weight | 28.1 kg |
| Bio | "Golden girl. Lake swimmer, garden inspector, professional napper." |
| Profile photo | `demo-assets/dog-hero.jpg` |

## Daily moments (feed posts) — `demo-assets/dog-moment-1..6.jpg`

Post these over the past ~2 weeks (varied timestamps) with a few paws/barks each so counts look alive:

1. `dog-moment-1.jpg` — "Garden patrol complete." · 24 paws · 3 barks
2. `dog-moment-2.jpg` — "Found my happy place by the lake." · 41 paws · 6 barks
3. `dog-moment-3.jpg` — "Zoomies, fully committed." · 18 paws · 2 barks
4. `dog-moment-4.jpg` — "Morning walk = best part of the day." · 33 paws · 4 barks
5. `dog-moment-5.jpg` — "Lakeside daydreaming." · 27 paws · 1 bark
6. `dog-moment-6.jpg` — "Sun's out, tongue's out." · 52 paws · 7 barks

Set the streak so the 🔥 badge shows (post on consecutive days). Birthday frame optional.

## Pet friends (for follower/following + a friends row)

Two more owner accounts + dogs so follows/friends aren't empty:

- **Luna** (@luna) — `demo-assets/friend-1.jpg` — follows Mango and is followed back.
- **Cooper** (@cooper) — `demo-assets/friend-2.jpg` — follows Mango and is followed back.

(One or two barks from these accounts on Mango's posts makes comments look real.)

## Vet clinic (provider / "shop")

| Field | Value |
|---|---|
| Name | Northside Veterinary Clinic |
| Capabilities | `vet` (+ optionally `telehealth`) |
| Bio | "Full-service small-animal clinic. Wellness, dentistry, vaccinations, and telehealth consults." |
| Location | [a real-looking address + lat/lng for the map pin] |
| Hours | Mon–Fri 9:00–18:00, Sat 9:00–13:00 |
| Cover image | `demo-assets/vet-cover.jpg` |
| Secondary image | `demo-assets/vet-2.jpg` |
| Rating | seed 1–2 reviews so an aggregate shows |

Services (sensible prices — adjust to your currency):

- Wellness exam — $55
- Vaccination (per shot) — $30
- Dental cleaning — $180
- Telehealth consult — $40

## Health section (so Today + Vet Record look full)

- **Weight logs:** 4–5 entries over ~4 months, gently stable: 28.4 → 28.0 → 28.3 → 28.1 kg (nice chart).
- **Wellness checks:** one or two — mood/energy "good", appetite "normal".
- **Vaccinations:** Rabies, DHPP, Bordetella — each with an administered date and a next-due date.
- **Current medication:** monthly flea/tick prevention + heartworm prevention (with next-due reminders).
- **Allergies:** one mild entry (e.g. "Chicken — mild") so the section isn't empty; or leave empty.
- **Pet medical profile:** microchip number, spayed/neutered = yes, primary vet = Northside Veterinary
  Clinic, emergency contact.
- **Upcoming reminders (Health → Today):** Breakfast 8:00, Dinner 18:00, Morning walk, a Paws photo
  check, and an annual vet checkup a few days out — so "Today" and the reminders list are populated.

Keep all health copy non-diagnostic (the app already does).

---

## Build notes for the seed script

- Idempotent: running it twice must not duplicate rows (upsert on a stable key, or check-then-insert).
- Gated: refuse to run unless an explicit flag/env (e.g. `SEED_DEMO=1`) is set, and never against the
  production DB by default — target the dev/staging Supabase or a clearly-labeled demo project.
- Self-contained: a teardown path (`SEED_DEMO_RESET=1`) that removes only the demo account's data.
- Images: upload from `demo-assets/` via the existing Supabase Storage path; store the returned URLs on
  the rows (don't hardcode local paths).
- No schema changes, no migration — seed uses existing tables/routes only.

---

## Implementation — how to run

The seed lives at `anything/apps/web/scripts/demo-seed/` (`spec.mjs` = pure data +
distribution, unit-tested in `spec.test.js`; `lib.mjs` = env/DB/storage/resize;
`index.mjs` = orchestrator). Run from `anything/apps/web`:

```bash
# Seed (idempotent — safe to re-run; no duplicates):
npm run seed:demo
# Remove ONLY the demo account's data (accounts + all cascaded rows + storage objects):
npm run seed:demo:reset
```

Both are gated: the script refuses unless `SEED_DEMO=1` / `SEED_DEMO_RESET=1` is set
(the `npm run` scripts set these for you). It targets `DEMO_DATABASE_URL` if set,
otherwise `DATABASE_URL` from `web/.env`, and prints the target host before writing —
set `DEMO_DATABASE_URL` to a dev/staging project to keep production untouched.
`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (already in `web/.env`) are required for
the image uploads. After a successful seed the script prints the login (`demo@pawpi.app`).

How it stays honest about RLS: the app connects as the locked-down `pawpi_app` role,
so every owner/author/provider write runs inside a transaction stamped with that
user's `app.current_user_id` (the same mechanism as `withRequestContext`) — the rows
are reachable exactly as a real user's would be. Only account/identity setup touches
the RLS-disabled `auth_*`/`user_profiles` tables, and reset relies on `user_profiles`
FK-cascade (which bypasses child RLS) to remove everything in one delete.

Images are resized/compressed with macOS `sips` (no native dep) and uploaded to the
Supabase `media` bucket at a deterministic path, so re-runs reuse stable URLs.
