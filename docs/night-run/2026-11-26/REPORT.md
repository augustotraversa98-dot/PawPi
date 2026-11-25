# Night run #6 — morning report (2026-11-26)

Goal: close the gaps the night run #5 report listed, before build 33 goes to App Review, with the least risk. **No server code,
migration or SQL was written or applied. Nothing was tested on a device or the Simulator.** PRs #187 and #782 were not touched.

## Results

| # | Item | PR | State | CI fix attempts | In build 33? |
|---|---|---|---|---|---|
| 1 | Does bumping `PRIVACY_VERSION` / `TERMS_VERSION` re-prompt anyone? **No: safe to merge #782.** | [#783](https://github.com/augustotraversa98-dot/PawPi/pull/783) | merged (docs) | 0 | n/a |
| 2 | Delete-account failure message says "delete", not "save" (EN + ES) | [#784](https://github.com/augustotraversa98-dot/PawPi/pull/784) | merged (client) | 0 | needs a build that includes it |
| 3 | Caregiver who also owns a dog gets a post button that posts for their own dog | [#785](https://github.com/augustotraversa98-dot/PawPi/pull/785) | merged (client) | 0 | needs a build that includes it |
| 4 | Former members and the delete-my-posts switch: design | [#786](https://github.com/augustotraversa98-dot/PawPi/pull/786) | **draft, not merged** (docs only; also carries this report) | — | no |

"In build 33" depends on whether build 33 was cut before or after #784 / #785 merged. Both are client changes: if build 33 already
started, they go in the next build. No job needed a re-run.

## What needs you (in this order)

1. **Merge #782** (the version constants). Answer and reasons: `docs/consent-version-bump.md`. Then, in Railway (web service),
   make sure `NEXT_PUBLIC_TERMS_VERSION` / `NEXT_PUBLIC_PRIVACY_VERSION` are **unset** (or both `2026-11-25`), or they override the
   new default. I did not read Railway's variables. After the deploy, sign up a throwaway account and run the one SQL query in that doc.
2. **Decide whether build 33 should include #784 and #785.** Both are small, client-only and green; #785 touches the Feed screen's
   post button logic (the riskiest of the three). If build 33 is already cut, they ship in the next build.
3. **Read #786** (design) and say go / no-go on the `GET /api/account/contributions` endpoint. It is server code, so it would be its
   own draft PR; it is not needed for the submission.
4. Still open from before, unchanged: #776, #763, #770/#771, the migration drafts #773/#774/#775, the literal "no blur for owner/family"
   decision (needs a server change).

## Decisions I made on your behalf

1. **Item 1:** answered from the code only; did not read production variables or the Supabase data. Nothing in #782 changes.
2. **Item 2:** used "eliminar" (matches the screen's title and button), a new key `settings.deleteErrorBody`; `common.couldNotSave` is
   untouched because ~15 other flows use it.
3. **Item 3:** server rule checked first and **not widened**. A post on a dog the person owns is allowed by `POST /api/posts` and counts
   for the Feed unlock in `dailyMomentsGate.js`, so the fix is real, not faked. The fallback dog is **own dogs only** (a caregiver who is
   Family on another shared dog but owns none still gets no button). The daily card, the composer and the "already posted" check follow the
   same dog. I also applied it to the dog profile's locked-moments button, which had the same gap.
4. **Item 4:** the brief was cut off after "…and what"; I read it as "and what the app does with the answer". Design only, left as a draft.
   The report file lives in this draft's branch because the session allows one branch name and a draft cannot be merged first; it will
   reach `main` when #786 is merged (or copy it).
5. Process: each PR was merged before the next started from fresh `main` (same branch name restarted, as in run #5).

## Could not verify

- Nothing on a device or Simulator (the small-screen layout of the alert, the composer naming the right dog on iOS).
- That production's Railway variables are unset; that the server reads `NEXT_PUBLIC_*_VERSION` at runtime (read from the Vite config and
  env plugin, not from a production build).
- The former-member endpoint's SQL against a real Postgres (read from the RLS policies; the build PR must prove it).
- That deleting a post removes its image file from storage. Nothing says photos are erased.
- Local mobile install needed `react-native-calendars` left out (its codeload tarball is blocked in this sandbox; `package.json` and the
  lockfile are unchanged). The full suite passed locally (417 suites, 3546 tests) and in CI.

## Device tests (all in `docs/test-backlog.md`, section "Night run #6")

Item 1: post-deploy SQL check; item 2: airplane-mode delete on a throwaway account (EN + ES); item 3: two accounts, caregiver who owns a dog.
