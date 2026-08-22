# PawPi demo-account seeder

Fills the existing demo account so **every tab an App Store reviewer opens shows
real content**. It talks to the backend over the same auth + API flow the mobile
app uses (Auth.js credentials sign-in → JWT → `Authorization: Bearer`), so what it
creates is exactly what the app renders.

- **Add-only.** Every section checks what already exists and only tops up empty
  ones. It never deletes or edits existing demo data, and never touches a real
  user. (Daily-post duplication is additionally blocked server-side.)
- **Zero dependencies.** Plain Node 18+ (global `fetch`/`FormData`). No `npm install`.
- **No secrets in the repo.** Credentials and the base URL come from the
  environment. Nothing sensitive is written to disk or committed.

## Why a script (and not run from CI/the web session)

The cloud/web session that generated this could not reach
`pawpi-production.up.railway.app` (network egress policy), so it could not seed
production directly. Run this from any machine that *can* reach the backend
(your laptop, or a shell with production network access).

## Usage

```bash
export PAWPI_DEMO_EMAIL='augusto+demo@pawpi.info'
export PAWPI_DEMO_PASSWORD='********'            # the demo account password

# Optional — a supporting demo account used for DMs, pet friendships, and to own
# the demo provider/shelter/shop. If PAWPI_DEMO2_PASSWORD is unset the script
# generates one, creates the account, and prints it once (save it to re-run).
export PAWPI_DEMO2_EMAIL='augusto+demo2@pawpi.info'
export PAWPI_DEMO2_PASSWORD='********'

# Optional — defaults to production:
export PAWPI_BASE_URL='https://pawpi-production.up.railway.app'

node scripts/demo-seed/seed.mjs
```

The run prints a live log and a section-by-section report, then a final
**verification pass** of authenticated GETs proving each section is non-empty.
It is safe to run more than once — re-runs report records as "already present".

## What it seeds (feature pet: Mango)

| Section | Content |
|---|---|
| Profile & Settings | Fills any empty profile field; marks onboarding complete |
| Feed / daily moments | Photo posts, a multi-day streak, paws + barks |
| Health | Weight, food, walks, wellness, photo checks, general checks, meds, preventives, poo/pee/vomit, medical-care history |
| Vet Record | Medical profile, allergies, conditions, lab results, surgeries, vet notes, documents, vaccinations, a vet appointment, prescription, **Emergency Card** (minted + settings + share link) |
| Reminders / Routines | Feeding, walk, medication, wellness routines (+ the vet appointment) |
| Training | Completed curriculum sessions across programs |
| Community | Forum threads, a local event, a social walk, a nearby lost-and-found report |
| Social | Mutual pet follows, a two-way DM conversation, and the notifications those generate |
| Services / bookings | A published demo provider; an upcoming **and** a past booking via the no-payment "pay in person" path (no `order_id` / `pay_with_credit`) |
| Adopt | Adoptable listings (shown in browse), plus a favorite + application |
| Shop | Products on the published demo store |

## How the "content from another user" is produced

Community posts by others, a DM partner, a provider's services, and adoption/shop
listings must come from a second account. The script creates one minimal
**supporting demo account** and a **demo provider** it owns, then has the demo
account interact with them (book, DM, follow, apply). No real user is used or
altered.

## Known API limitations (documented, not silently skipped)

- **Pet friendships** (`pet_friendships`) have **no create endpoint** in the API.
  The seeder uses **mutual follows** (`pet_follows`), the only social-graph write
  the API exposes. A true accepted-friendship row would require a direct DB write.
- **Notifications** have no create endpoint — they are produced as **side effects**
  of the follow / DM / join-request / lost-report actions the script performs, so
  the demo account ends up with real notifications.
- **Prescriptions** cannot be created by an owner. The script grants the demo
  provider (a vet) `medical_write` **care access**, then issues the Rx from the
  provider side — the intended product flow.
- **Calendar events/bookings** have no create route; a booking *is* a
  `vet_appointments` row (created via the booking/appointment endpoints above).

## Files

- `seed.mjs` — orchestrator (auth, pet lookup, runs sections, verifies, reports)
- `lib.mjs` — cookie-jar Auth.js sign-in, Bearer fetch, image upload, `topUp` helper
- `sections/*.mjs` — one module per section
