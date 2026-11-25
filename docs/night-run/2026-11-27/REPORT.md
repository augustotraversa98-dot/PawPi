# Night run #7 — morning report (2026-11-27)

Goal: the leftovers of night run #6 (items 5-7 were cut off): make the flaky tests deterministic, measure the requests on app return,
find out why shared-dog members get "Forbidden" on the today's-moment check, and write down the parked decisions.
**No SQL was applied, no migration was written, nothing was tested on a device or the Simulator.** PRs #187 and #782 were not touched
(#782 is already on `main`, commit `5e27bf3`; #786 is still an open draft and was not touched either).

## Results

| # | Item | PR | State | CI fix attempts | Root cause | In build 33? |
|---|---|---|---|---|---|---|
| 1 | Flaky tests, test-only (4 tests; a, b, c below) | [#787](https://github.com/augustotraversa98-dot/PawPi/pull/787) | **merged** (test-only) | 0 (no re-run needed) | see "Flaky tests" | n/a (no app code) |
| 2 | Requests on app return: measured; guard for muted dogs | [#788](https://github.com/augustotraversa98-dot/PawPi/pull/788) | **merged** (client-only) | 0 | muted dogs were read on every return for nothing | only if build 33 was cut after 2026-11-25 21:15 UTC; otherwise the next build |
| 3 | "Forbidden" on the today's-moment check for shared-dog members | **DRAFT, NOT merged** (opened last; its number is in the message that came with this report) | **draft, server code** | 0 | real permission gap: the route is owner-only | no: server change, needs your approval and a deploy; no client change needed |
| 4 | Docs: `todo-future.md`, 0143-0145 recorded as applied, build 33 checklist | [#789](https://github.com/augustotraversa98-dot/PawPi/pull/789) | **merged** (docs-only) | 0 | n/a | n/a |
| — | This report | this PR | merged (docs-only) | 0 | n/a | n/a |

Order note: the brief put item 3 before item 4. The session allows one branch name and a draft cannot be merged, so the draft went
last (otherwise nothing after it could have been pushed). Each merged PR restarted the same branch from fresh `main`.

## Flaky tests (item 1)

Each was reproduced first; none was "fixed" by a longer timeout or a retry.

- **a) the timing-based integration test = `single-flight` "a cache MISS costs one extra flight"** (failed at random on main: 380 ms vs
  a 342 ms budget, i.e. 3 flights where 2 are allowed). Cause: porsager prepares a statement once **per pooled connection** and hands
  connections out **round-robin**; the old warm-up visited exactly 3 connections and "let the COMMIT finish" was a **fixed 180 ms sleep**
  a loaded runner outruns, so the measured request landed on a connection that had not prepared the statements (one extra Parse
  flight). Reproduced on purpose with a 6-connection pool (743 ms, fails); fixed by waiting for the wire to go quiet and warming every
  open connection; the same repro passes.
- **b) `usePetProfile.shared`** (failed once under load) **and `index.deadSession`** (failed once on main after #784). Cause: with an
  empty Jest cache the first test takes 3.6-4.3 s and fails; the code under test lazily `require`s `@/utils/notifications` →
  expo-notifications (3.4 s cold), inside a 1 s `waitFor`. Both reproduce with `npx jest --no-cache <file>` and now pass. Also removed
  two real-clock waits in `usePetProfile.shared`.
- **c) "4 day-card tests flake 21:00-24:00 Argentina"**: that was a UTC-date bug already fixed in #753 (the line is not in
  `docs/roadmap.md` on `main`; I found it in a commit message). The test still only covered "UTC date ≠ local date" during the hours it
  happened to run in. It now always puts the users in a zone whose date differs from UTC's; with a UTC "today" the same 4 tests fail
  at any hour, so the window is covered all day.
- **Not a flake, found on the way:** `sharing-lifecycle` "many simultaneous accepts" failed on 6 of the night's main runs (2-6
  notifications instead of 1). It was a **real race** (two simultaneous taps both saw "pending"), fixed by #776, which is on `main`
  (`7d63cf0`; the night run #6 report still listed #776 as open). Passes 8/8 here.
- Full mobile suite with an empty Jest cache: 417 suites / 3548 tests pass before the last item-2 change, 418 / 3558 after.

## Requests on app return (item 2)

Measured with the real hook and stores and a counting `fetch` (pinned in `useReminderReconcile.requests.test.jsx`):

| Case | Requests |
|---|---|
| per dog per read, only feeding routines | 1 (`/api/routines`) |
| per dog per read, worst case (wellness + weight + medical care + photo checks) | 5 (routines + 4 log reads) |
| launch | the selected dog + every other dog, once |
| each return after a real trip to the background | every dog again (15 s minimum gap already exists; closer returns send 0) |
| 3 dogs, worst case | 15 at launch, 15 per return |
| same, one dog switched OFF and not on screen | **10** (was 15) |

Only the muted-dog part was "clearly wasteful", so that is the only guard added (client-only; alarm budget, the 15 s gap and everything
the person sees unchanged; the dog on screen is always read; switching a dog back ON already reads it). The real-world number depends
on how many dogs and routine types a person has: I did not measure production.

## "Forbidden" for shared-dog members (item 3)

- **Answer: a real server permission gap, not an expected denial the app retries.** `GET /api/posts/today-daily-update?pet_id=` only
  accepted the pet's **owner** (it checked `pets.owner_user_id`). The Feed legitimately asks about the active dog, which for a Family
  member (and for a caregiver who owns no dog) is the shared one, so every Feed open, focus and refetch got a 403, and React Query's
  one retry (1.5 s later) doubled it. The Feed worked only because it falls back to the posts it already has.
- **Draft fix (server, ~15 lines in one route):** the owner is unchanged; an active, unexpired grantee (family or caregiver) is now
  accepted through `resolvePetLogOwner` (the same gate as the other shared-dog routes, `app_user_has_pet_access` underneath); anyone
  else, a revoked/left member and an expired grant still get 403. A grantee gets back **only their own moment of today** (or null), so
  nothing is exposed that they could not read before; it is also the right question for them (one moment per author per day, 0103).
- No migration, no SQL, no client change. Integration test against real Postgres (owner unchanged, family, caregiver, outsider, left,
  expired, unknown dog, signed out, own dog): 2 of the 6 tests fail on the old route, all pass on the new one.

## What needs you (in this order)

1. **Review the item 3 draft** (server code that runs in production; nothing to apply to Supabase). If you approve: merge it, Railway
   deploys, and the 403s from members stop. Old builds only look at `response.ok`, so nothing breaks for them.
2. **Build 33:** decide whether it includes #788 (client, merged 2026-11-25 21:15 UTC). It is small and green; if build 33 is already
   cut, it ships in the next build. The device checks for it are in `docs/test-backlog.md` ("Night run #7 / item 2").
3. **Watch the next few `main` runs.** If `single-flight`, `day-card`, `usePetProfile.shared` or `index.deadSession` fail again, send
   me the run link: after tonight that would be a real signal.
4. **Carried over from run #6 (unchanged):** #782 is on `main`, so in Railway (web service) make sure `NEXT_PUBLIC_TERMS_VERSION` /
   `NEXT_PUBLIC_PRIVACY_VERSION` are unset (or both `2026-11-25`), sign up a throwaway account and run the query in
   `docs/consent-version-bump.md` §4. Draft #786 (former-member design) still needs your go / no-go; the endpoint is recorded as a
   later task in `docs/todo-future.md`. Also still open from run #6's list, not checked tonight: #763, #770/#771, #773/#774/#775 (the migrations of
   the last three are recorded as applied and verified on your word; I did not look at those PRs' state).
5. **Rule 3b** stays a parked product decision (`docs/todo-future.md` §1): needs your decision and a server change; not for build 33.

## Decisions I made on your behalf

1. Treated "the timing-based integration test" as `single-flight` (the only timing-based test that failed at random on main); the
   `sharing-lifecycle` failures were a real race already fixed by #776, so I left that test alone.
2. Item 1 stayed test-only: where the cause was in the test's setup or a lazily loaded module, I stubbed or warmed it in the test and
   changed no app code. I stubbed the notification housekeeping in two mobile tests because it has its own tests.
3. Item 2: "clearly wasteful" = only the muted-dog case; nothing else guarded, the 15 s gap not raised (that would change freshness).
4. Item 3: classified as a server gap, not a client retry bug; chose the **narrowest** fix (a grantee only gets their own moment back)
   rather than giving them the owner's view, even though both read data they can already see through the day card and the Feed. I did
   not change the client's retry behaviour.
5. Item 4: wrote "0143-0145 applied and verified" from your word; I did not query Supabase. Rule 3b's text describes today's behaviour
   (#780) and the open question; the decision itself is yours. The former-member design lives only in draft #786, so
   `todo-future.md` points to it as "in draft PR #786".
6. Process: a force-with-lease push of the restarted branch was denied by the environment, so I did not retry it; the squash merge had
   deleted the remote branch, so a plain push of the fresh branch worked. The report is its own docs PR (merged) so it is on `main`, unlike run #6's.

## Could not verify

- Anything on a device or the Simulator (the muted-dog guard against real alarms, the Feed for a Family member after the server fix).
- Supabase: nothing was read or applied; 0143-0145 "applied and verified" is as you told me.
- The integration suite was run locally only as a non-root user (the embedded Postgres refuses root); CI is the authority and #787's
  integration job passed. I scanned only the tests you named for time-of-day assumptions, not all ~140 integration files.
- The request numbers are from tests with stubbed storage and a counting `fetch`, not production traffic.
- That no other client path calls `today-daily-update` for a shared dog beyond `useTodayDailyUpdate` (I found no other caller).
- Local mobile install needed `react-native-calendars` left out (its codeload tarball is blocked in this sandbox); `package.json` and
  the lockfile are unchanged.

## Device tests (all in `docs/test-backlog.md`)

- "Night run #7 / item 2": two dogs, mute one, background/foreground, unmute, select the muted dog, relaunch.
- The Build 33 checklist now also carries the three checks from night run #4 whose migrations are applied: invite code with a Hide My
  Email partner (0143), who logged it (0144), owner deleting any moment (0145).
- Items 1 and 4: nothing on a phone. Item 3 (draft): its checklist is added in the draft PR, to be run after a deploy.
