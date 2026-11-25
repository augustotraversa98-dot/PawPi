# Night run #5 — morning report (2026-11-25)

Goal: make account-deletion wording accurate before build 33 goes to App Review (guideline 5.1.1(v)), using **Option B**
of [`docs/delete-account-contributions-options.md`](../../delete-account-contributions-options.md), plus two small caregiver
Feed-lock fixes. **No server, migration or SQL change. Nothing applied to Supabase. Nothing was tested on a device or the
Simulator.** PRs #187, #763, #770, #771, #773, #774, #775, #776 were not touched.

## Results

| Item | PR | State | Fix attempts (CI) | Root cause | In build 33? |
|---|---|---|---|---|---|
| 1 Delete-account screen, Option B | [#778](https://github.com/augustotraversa98-dot/PawPi/pull/778) | merged | 0 | the copy was written before migration 0142 ("all your … data"), and a member had no way to choose what happens to their posts | **Yes** (app) |
| 2 Privacy §9/§11, Terms §10, support FAQ (EN + ES) | [#779](https://github.com/augustotraversa98-dot/PawPi/pull/779) | merged | **1** (my own: CI ignores `docs/`, my new test reads `docs/legal/`; added a path rule in `scripts/ci/changed-areas.mjs`) | the documents only talked about "the data you own" | n/a: website text, live on the next web deploy (not tied to a build) |
| 3a Locked Feed blurred the person's OWN dog's older posts | [#780](https://github.com/augustotraversa98-dot/PawPi/pull/780) | merged | 0 | `LockedFeedOverlay` rendered every post as locked; the server already exempts the household (`dailyMomentsGate.js`) | **Yes** (app) |
| 3b Lock only for caregivers | [#780](https://github.com/augustotraversa98-dot/PawPi/pull/780) | verified, **not changed** (see "What needs you" 2) | 0 | the rule as written cannot be built app-only | n/a |
| 4 Build 33 device checks | this PR | docs only | — | — | n/a |
| Follow-up: bump `PRIVACY_VERSION` / `TERMS_VERSION` to 2026-11-25 | opened last, **left OPEN** (title "chore(legal): bump PRIVACY_VERSION / TERMS_VERSION…") | draft, not merged (the file is read by the consent API route = server code) | — | the documents' "Last updated" moved, the constants did not | n/a |

## What needs you (in this order)

1. **Read the new legal wording.** It is already on `main` and the website auto-deploys `main`, so `/privacy`, `/terms`
   and `/support` show it as soon as Railway deploys. Files to review (EN + ES): see "Files changed in legal and support docs" below.
   Not legal advice; the sentences are the doc's Option B + owner sentences verbatim.
2. **Decide about the literal 3b rule.** The brief says owner and family "never see a lock or a blur anywhere on the Feed,
   including on other people's posts". I did not build that: it removes the "post to unlock" mechanic for everyone but
   caregivers, and the server withholds that media (`image_url` / `caption` are `null`), so the phone cannot un-blur it. It
   needs a server change and a product decision. What I did build: the lock never covers your own household's dogs.
3. **Merge the constants PR** (`PRIVACY_VERSION` / `TERMS_VERSION`) once you are happy with the wording. Until then new
   signups' consent rows are stamped `2026-10-16` while the documents say November 25, 2026.
4. **Former members cannot get the switch.** The app only knows current grants (the pets list). Someone who already left, or
   was removed from, a dog before deleting their account is not recognised as a member, so they do not see "Also delete my
   posts…"; their posts stay as "Former member". Fixing it needs the server to say "this person has contributed to a dog they no
   longer have" (a read endpoint), which I was not allowed to build.
5. **Caregiver who also owns a dog.** If their active dog is the shared one, the locked Feed says "opens when {dog} posts"
   and offers no post button, although posting for their own dog would unlock the Feed. Fix = choose which dog the composer
   posts for; not done.
6. Still open from the last run, unchanged by me: merge #776 first (random red on `main`), #763 before building 33,
   #771/#770, and the three migration drafts #773/#774/#775.

## Decisions I made on your behalf

1. **Switch visibility** = `is_shared` + a family/caregiver role in `GET /api/pets?include_shared=1`. If that list cannot be read, the
   switch is hidden (not guessed) and deletion still works.
2. **Owner sentence** appears only when an owned dog has an **active, unexpired** member (`GET /api/pet-caregivers?petId=`); a
   pending invite added nothing, so it does not count. Read only when the person taps "Delete account", never on app return. If that
   read fails for a dog, no sentence for that dog. Several shared dogs: "Rex, Luna and Mia are shared with others. Deleting your
   account also deletes them for those people, with everything they added." (single dog = the doc sentence verbatim).
3. **Wording the doc did not give**, so I wrote the smallest safe text: second confirmation ("Are you absolutely sure? This cannot
   be undone." / "¿Estás completamente seguro? No se puede deshacer.") and the Settings row hint ("Permanently delete your account,
   your dogs and their records." / ES). The old ones over-promised ("all data").
4. **Failure message** = "Could not save. Please try again." (`common.couldNotSave`) as you asked, even though "save" is an odd
   verb for a deletion; the server's own message is never shown.
5. **Legal text** added as a separate paragraph (not a rewrite); the doc's first sentence was already in each document in equivalent
   words. "Last updated" bumped to November 25, 2026 in privacy and terms; the constants were left for a separate open PR.
6. **Household** for the Feed = every dog in the viewer's pets list (owned + active family/caregiver), matching what the server
   never withholds. This also un-blurs older posts of a dog shared with them, not only their own dog.
7. **Branch**: the session mandated one branch name, so each PR was merged before the next was started from fresh `main`, and the
   branch restarted under the same name (the last restart needed no force push: GitHub had deleted the merged branch).
8. `docs/app-store-privacy-data-map.md` was **not** changed: it has no retention text for these records.

## Files changed in the legal and support docs (for your wording review)

Website source (what the pages render) → mirror in `docs/legal/`:

| Document | EN | ES |
|---|---|---|
| Privacy Policy §9 + §11 | `anything/apps/web/src/content/legal/privacy.en.md` · `docs/legal/privacy-policy.md` | `anything/apps/web/src/content/legal/privacy.es.md` · `docs/legal/privacy-policy.es.md` |
| Terms of Service §10 | `anything/apps/web/src/content/legal/terms.en.md` · `docs/legal/terms-of-service.md` | `anything/apps/web/src/content/legal/terms.es.md` · `docs/legal/terms-of-service.es.md` |
| Support "How do I delete my account?" | `anything/apps/web/src/content/legal/support.en.md` · `docs/legal/support.md` · `docs/legal/support.html` | `anything/apps/web/src/content/legal/support.es.md` (no ES mirror exists) |

In-app wording: `anything/apps/mobile/src/i18n/locales/en.json` and `es.json`, keys `settings.deleteAccountBody`,
`deleteContributionsLabel/HintOff/HintOn`, `deleteAccountOwnerShared(Many)`, `deleteAccountAnd`, `deletePermanentBody`, `deleteAccountHint`.

Guard added: `anything/apps/web/src/app/legal-deleteAccountWording.test.jsx` (the sentences are in the markdown, the mirrors and the
rendered pages in both languages; web file and mirror agree).

## Device tests needed on build 33 (all in `docs/test-backlog.md`)

- **"Build 33 — Night run #5 checklist"** at the top of the backlog is the single list; it points to the three detailed entries:
  item 1 (delete-account switch, owner sentence, Spanish on a small screen, airplane-mode error), item 2 (read the three pages in
  ES + EN), item 3 (Feed lock per role).
- Use **throwaway** accounts for the two real deletions (switch OFF, switch ON).

## Could not verify

- **Nothing on a device or Simulator**, so layout (small screen, Spanish), the Switch rendering and the modal on iOS are only
  covered by jest.
- That deleting a post deletes its **image file** in storage. Nothing in the app or the legal text says photos are erased.
- That "Former member" shows exactly as expected on the owner's phone after each deletion (server behaviour from 0142 was read, not run).
- The real `GET /api/pet-caregivers?petId=` payload on production: I read the route (status `active`, `is_expired`) and tested the app
  against that shape.
- A local full install was impossible (`codeload.github.com` is blocked for the unused `react-native-calendars` fork); I ran the
  mobile suite with that one package left out (nothing imports it). CI, with the full install, was green on #778 and #780.
- One mobile test (`usePetProfile.shared.test.jsx`) failed once under load locally and passed alone and in CI: a timing flake.
