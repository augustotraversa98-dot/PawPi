# Night run #4 — morning report (2026-11-24 → 25)

All app changes that were merged are on `main` and production is healthy on commit `6dffbfe`
(`/api/health/deep`). **Nothing was tested on a device or the Simulator. No SQL was applied anywhere.**

## Results

| Item | PR | State | Fix attempts (CI) | Root cause | In build 33? |
|---|---|---|---|---|---|
| 1A access lost + last routine removed | #760 | merged | 0 | losing a dog cleared caches only; the alarm sweep was skipped when nothing was generated | **Yes** |
| 1B refresh on foreground / dog select | #761 | merged | 0 | routines were only read when Health loaded | **Yes** |
| 1C budget of ~48 alarms | #762 | merged | 0 | 14 days were armed against the iOS limit of 64 | **Yes** |
| 1C pending-alarm count telemetry | #763 | **open, not merged** (server allow-list) | 0 | the server drops unknown events | **Only if you merge it before building** |
| 1D "Remind me about this dog" | #764 | merged | 0 | no per-person control | **Yes** |
| 1E cancel what the household logged | #768 | merged | 0 | nothing cancelled an alarm someone else had resolved | **Yes** (persistent types) |
| 6 confirm before a rest day | #765 | merged | 0 | one-tap link | **Yes** |
| 7 feed-lock tests, app | #769 | merged | 0 | never tested | tests only |
| 7 feed-lock tests, server | #770 | **open** | 0 | never tested | n/a |
| 7 bug: shared dog's photo history locked for members | #771 | **open** (server) | 1 re-run (random test) | the route did not tell the lock which dog was read | server, any build |
| 7 bug: caregiver asked to post on the locked Feed | #772 | merged | 0 | the lock screens ignored the role | **Yes** |
| 8 member deletes own moment | #766 | merged | 0 | the app gated delete by dog ownership, the server by author | **Yes** |
| 8 owner deletes any moment | #775 | **DRAFT, migration 0145** | 0 | database allows the author only | No, unless applied + merged first |
| 9 resend invite | #767 | merged | 0 | no button | **Yes** |
| 10a invite codes (PR6) | #773 | **DRAFT, migration 0143** | 2 re-runs (random tests) | new feature | No, unless applied + merged first |
| 10b who logged it (PR7) | #774 | **DRAFT, migration 0144** | 0 | logs carry the owner's id only | No, unless applied + merged first |
| new: double "accept" notifies twice | #776 | **open** (server) | 0 | no lock between two answers; makes `main` fail at random | server, any build |
| 11 delete-account wording options | this PR | docs only | — | — | — |

## What needs you (in this order)

1. **Merge #776.** The red checks on `main` are this older race (since #753), not tonight's code.
2. **Merge #763 before building 33**, or the alarm numbers will not arrive.
3. **Delete-account wording, before App Review.** Today's confirmation says it deletes "posts and other data", but a
   member's posts on a shared dog are kept as "Former member". Pick an option in
   `docs/delete-account-contributions-options.md` (I recommend B); the copy change is not built.
4. **Merge #771 and #770** when convenient.
5. **Drafts.** For each: run the SQL in Supabase, run its verify file, mark ready, merge. To be in build 33 do it
   before building. They merge cleanly together.
   - #773: `0143_pet_invite_codes.sql` → `verify_0143.sql` (9 PASS)
   - #774: `0144_log_logged_by.sql` → `verify_0144.sql` (7 PASS)
   - #775: `0145_owner_delete_moment.sql` → `verify_0145.sql` (5 PASS)
6. **Questions.** (a) While the Feed is locked the app blurs older posts of your own dog too; intended? (b) By "owner
   and family never locked" did you mean more than "never locked out of their own dog"? (c) Should family members be
   able to resend invites (needs a server change)?
7. `git pull` in your local checkout (it is behind `main`), then build 33.

## Decisions I made on your behalf

- Only client-only PRs were merged (plus this docs PR). Server and test-only server changes are left open.
- Merged by hand after all four checks passed (auto-merge is not available on this repository).
- 1A: the cancellation rule takes `scopePetIds` besides your three inputs; an **empty** dog list must be seen twice
  before alarms are removed; the streak nudge now carries the dog id.
- 1B/1C: **every** dog (own too) is read at launch and on each return to the app, at most every 15 s.
- 1C: snoozes sit on top of the 48; the routine share shrinks so the total never passes 64; alarms of a dog not yet
  read are kept. Without opening the app, ~7 reminders a day last about 6–7 days.
- Telemetry sends one number, at most hourly.
- 1D: switch placed in Reminders → Settings; "off" also silences that dog's nudges; stored per person per phone.
- 1E: nothing to cancel for vet appointments (the list never armed an alarm).
- Rest day: also fixed the Spanish link to voseo.
- 8: edit/delete follow the author; the owner no longer sees a trash icon that always failed.
- 9: the button is the owner's only, because the server accepts it only from the owner.
- PR6: using a code gives access at once; 3-day life; entry point added to onboarding.
- PR7: a person with no display name shows no line (not "Former member"); no backfill.
- No native change, no Phase 2/3, nothing touching MercadoPago, #187 untouched.

## Device tests for build 33

All in `docs/test-backlog.md`, sections starting "Night run #4": 1A, 1B, 1C, 1D, 1E, item 6, item 7, item 8, item 9,
the caregiver-CTA bug. Do 1A–1E with two phones. The open and draft PRs carry their own sections, which appear there
when merged.

## Could not verify

- Anything on a device or Simulator: layout, real alarms, what iOS actually keeps, Spanish on a small screen.
- Real pending-alarm counts (that is what #763 is for); the 6–7 day figure is arithmetic.
- Migrations on Supabase (proven only on a throwaway Postgres), and the new metric in Grafana.
- Whether messaging apps make the `pawpi://` invite link tappable.
- Whether deleting a post also removes its photo file from storage.

## Also noticed, not fixed

- `GET /api/posts/today-daily-update` answers 403 to members of a shared dog (the Feed falls back, with a retry delay).
- Each return to the app now costs a few requests per dog (routines plus up to four log reads).
- Food, walk, pee, poo, vomit and general checks have no history list, so PR7 has nowhere to show names for them.
- Random test: `single-flight` latency assertion failed twice tonight on CI.
