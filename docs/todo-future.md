# PawPi — later, parked or not planned yet

Things we have decided to do **later**, or have **parked on purpose**, so they are not lost and not mistaken for open bugs.
Each entry says what it is, why it is not being built now, and what it needs. Nothing here is planned for the build currently in
review (build 33) unless it says so. When one is picked up, move it to `docs/roadmap.md` and delete it here.

---

## 1. Rule 3b — "owner and family never see a blur, including on other people's posts" — PARKED product decision

- **What it is:** the "post today's moment to see other people's" lock should never blur anything for an **owner** or a **family**
  member of a dog, not even other people's posts in the Feed.
- **Where we are today:** the lock never blurs posts of the viewer's **own household** (their own dogs and the dogs shared with them;
  PR #780, `utils/feed/householdPosts` on the app and the household rule in `api/utils/dailyMomentsGate.js` on the server). Other
  people's posts still come back `locked: true` until the viewer has posted a moment today. That is the rule that ships.
- **Why it is parked:** it is a product decision, not a bug, and it **needs a server change** (the Feed redaction decides
  what is withheld, so the app cannot honour 3b on its own: the media is not in the response). It changes what the Feed unlock
  means for everyone who owns a dog, so it must be decided on purpose.
- **Status:** **NOT planned for build 33.** Do not build the literal rule. If it is ever approved: change `dailyMomentsGate.js` and the
  redaction in `GET /api/posts`, add tests next to `daily-moments-gate` / `caregiver-feed-lock` integration tests, and make the app's lock UI follow the
  server (it already reads `locked`).
- **What needs deciding first:** does "never blur" also lift the "post to unlock" prompt for owners (then the daily moment stops
  being a gate for most users and the mechanic changes), or only the blur on the household's posts (what ships now)?

## 2. Food, walk, pee, poo, vomit and general checks have no history list — "who logged it" cannot show there

- **What it is:** migration 0144 records **who logged** each health entry (`logged_by_user_id` / `logged_by_known` on the 11 log tables,
  stamped by a trigger). The app shows "Logged by {name}" where a history list exists: **weight, wellness-check and photo-check history**.
  **Food, walk, pee, poo, vomit and general (Quick Check) entries have no history list in the app**: they only feed the Today timeline
  and counts, so there is nowhere to print a name next to each entry (the server already sends it).
- **Why it is not being built now:** the name is already stored and returned; adding the lists is new screens, not a small change.
- **Needs:** a history list per log type (or a combined activity list) in the app, reading the author fields the routes already
  return, plus EN + ES copy. Until then the device check for 0144 covers the lists that exist (see `docs/test-backlog.md`).

## 3. Former-member endpoint — `GET /api/account/contributions` — LATER task

- **What it is:** a caller-only, parameter-free route that answers `{ "posts_on_others_dogs": n }`: how many posts the signed-in
  person has on dogs they do **not** own. The delete-account screen would use it to tell a **former** member (their grant ended, so
  the pets list no longer shows the dog) that they still have posts to keep or delete. Design: option D in
  `docs/former-member-contributions-design.md` (in draft PR #786 until that is merged).
- **Why it is later:** `app_delete_my_account(true)` already removes a former member's posts on request; the only gap is that the app
  cannot tell the person they have any. It is server code that runs in production, so it ships as its own **draft PR** for approval;
  the app falls back to today's rule when the route fails or is missing. **Not needed for the submission.**
- **Needs:** the route (no migration, read from the RLS policies; the former member cannot read the other owner's `pets` row, so the
  query must not join it), an integration test against real Postgres (the design's SQL was **not** run), the app call with the
  fallback, EN + ES copy, and a device check on a throwaway account. Out of scope until someone says go.

## 4. TEMPORARY legal identity (Tanquetats 2022) — revert after the ElevenLabs grant answer

- **What it is:** the legal pages (privacy, terms, support, EN + ES), the `docs/legal` copies and the site footer name
  Tanquetats 2022 as controller/provider, the Terms use Spanish law and the courts of Valencia, and the EULA uses
  Spanish law. This is temporary.
- **To change it back:** follow [`docs/legal/TEMP-company-identity-revert.md`](legal/TEMP-company-identity-revert.md)
  (old and new strings, added sections, previous dates and consent versions).
