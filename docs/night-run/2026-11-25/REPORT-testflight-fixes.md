# Night run 2026-11-25: TestFlight fixes and AI consent (morning report)

(The file `REPORT.md` next to this one belongs to an earlier run.)

**Update 2026-11-26:** database change 0146 (finder flow) was applied to production and `supabase/verify_0146.sql` returned 19 of 19 PASS. There is no database step left to do.

## 1. Summary

1. All five items were worked on. Five pull requests are merged, each with all four automatic checks green.
2. Fixed: the keyboard closing or covering text fields, slow emergency card, cut-off notification labels, QR sharing, "back" from More.
3. The pet tag and vet link web pages are now in Spanish and English, and are **live**.
4. The app now asks permission before AI reads a vet document. The server rule that enforces it waits as a draft.
5. "Compartir" in the vet record can now give a vet access, but only one fixed read-only bundle. **Please confirm that is acceptable** (decision A).
6. The finder / emergency flow (#804): its database change (0146) is applied and verified (2026-11-26). Merging it deploys the website; the app changes need build 34.
7. All app changes reach phones only with the **next app build (34)**.
8. Tested with automated tests and, for the main screens, the iOS Simulator. Nothing was tested on a physical phone or Android.
9. The run itself applied no database change (0146 was applied afterwards, on 2026-11-26). No dependency, version or build number changed.
10. Build 33, in App Store review, was not touched.

## 2. Items

| Item | Status | Pull requests | Merged |
|---|---|---|---|
| 01 Keyboard and text fields | Done | [#799](https://github.com/augustotraversa98-dot/PawPi/pull/799) | Yes |
| 02 App interface fixes | Done | [#800](https://github.com/augustotraversa98-dot/PawPi/pull/800) | Yes |
| 02 Spanish public pages | Done and live | [#801](https://github.com/augustotraversa98-dot/PawPi/pull/801) | Yes |
| 03 AI consent, app | Done | [#803](https://github.com/augustotraversa98-dot/PawPi/pull/803) | Yes |
| 03 AI consent, server | **Draft. Wait until build 34 is on the App Store** | [#802](https://github.com/augustotraversa98-dot/PawPi/pull/802) | No |
| 04 Finder flow, owner contact, urgent notification | Database change 0146 applied and verified 2026-11-26 | [#804](https://github.com/augustotraversa98-dot/PawPi/pull/804) | Not at the time of this update |
| 05 Share with your vet | Done, with limits | [#805](https://github.com/augustotraversa98-dot/PawPi/pull/805) | Yes |

Production checks after the web changes went live:
- Tag and vet pages in Spanish and English: **PASS**, but only for an inactive tag and a dead link. A page for a real tag was **not checked** on production.
- `/api/*` headers unchanged and `cf-cache-status: DYNAMIC`: **PASS** (after #801 and after #805).

## 3. Your to-do list, in order

### Step 1. Before building
- Answer **decision A** below. If you do not want the vet sharing sheet yet, revert #805 before the build.
- Optional, possible today: open your own dog's tag link (not the demo account) and check the page in Spanish.

### Step 2. Database change (finder flow): done
Migration 0146 was applied to production on 2026-11-26 and `supabase/verify_0146.sql` returned **19 of 19 PASS**. Nothing to run.

### Step 3. Merge #804 (this updates the website)
1. [#804](https://github.com/augustotraversa98-dot/PawPi/pull/804): ready for review, green checks, squash and merge.
2. Wait for the Railway deploy to finish.
3. On your own dog's tag link, in "relay" mode: the page shows name, phone and email fields; sending shows thanks and the notification appears in your app.
4. Publish the finder privacy wording at the same time. The exact English and Spanish text is in the local file `NIGHT_RUN_2026-11-25/STATE.md`, section "Item 04".

### Step 4. Make build 34 (only after Step 3)
- A build made before #804 is merged will not contain the urgent notification or the new notification card.
- From a clean copy of `main`, in `anything/apps/mobile`:

```bash
eas build --platform ios --profile production
```

- Run this first one interactively and sign in to Apple if asked. #804 adds one iOS permission ("Time Sensitive Notifications") to `app.json`.
- If it fails saying the provisioning profile does not support that capability: run `eas credentials`, choose iOS, production, remove the provisioning profile (**keep the certificate**), and build again.
- Check that `eas credentials`, iOS, shows a **Push Notifications key**. Without it no push reaches any iPhone. This was not checked.

### Step 5. Test build 34 on your iPhone (TestFlight)

**Keyboard (01)**
- Edit medical profile, vet summary (all three questions), emergency card contact, Quick Check, dog profile edit: the keyboard stays open, the field is visible, Save is reachable.
- Also try what was **not** driven in the Simulator: routines, other trackers, booking forms, post composer, chats, the Stores and Vets map search, onboarding. Automatic scrolling to a field now works for the first time, so watch for odd jumps.

**Interface (02)**
- Emergency card buttons respond at once.
- Share QR (button and long press): send it by Mail and WhatsApp and check that both the picture and the link arrive. Copy link.
- Notification labels are complete in Spanish, also with large text.
- More, Mi Centro, back: the More menu reopens.

**AI consent (03)**
- Add a vet document: the permission question appears. "Not now" saves the file without reading it.
- Settings, "Let PawPi read my documents": turn off and on. With it on, upload a test document and check the review screen.

**Finder flow (04)**
- Turn on a Focus (Do Not Disturb), send a message from the tag page on another phone: the banner should break through. iOS or a Focus setting can block it (Settings, PawPi, Notifications).
- In notifications, **Llamar** and **Enviar email** open the phone and mail apps.
- Emergency card on "Phone": the number shows on the tag page and vet link. On "Relay" or "None": no number on the tag page.

**Share with your vet (05)**
- Health, vet record, **Compartir**: read the list, pick a vet you have a booking with, tick consent, give access, then revoke. Without such a booking you see an empty state.
- In the vet's web panel, check the record appears and disappears after revoking.

### Step 6. Submit build 34, then finish the consent work
When build 34 is "Ready for Sale", tell Claude Code: **"build 34 is live"**. The steps are:
1. Confirm the status in App Store Connect. People who have not updated lose AI document reading after the merge, so wait a few days if that matters.
2. Bring #802 up to date with `main`, mark it ready, wait for green checks, squash and merge.
3. Wait for the deploy, then check on your own account: a read request without consent is refused (412); with consent it works.
4. Publish the new privacy wording (local `STATE.md`, section "Item 03").

### Decisions needed

**A. Vet sharing (#805).** You asked to choose which sections to share, set an expiry and invite a vet by email, phone or link. The server cannot do any of that today. What shipped: one read-only permission (medical profile including emergency contact and insurance, all vet notes, vaccines, and a private file only through its exact link), until you revoke it, only for vets with a booking for that dog, and the vet is not notified. The sheet lists this honestly. The item file meant "merge" for a server that already supports choosing sections; it was merged on a looser reading (offer only what really exists). Keep it, or revert before the build? Which missing part comes first? Design: [`docs/vet-sharing-design.md`](../../vet-sharing-design.md).

**B. "Compartir con una vet" (item 02).** It was taken to be the emergency card section with that name. It still allows one choice each for scope and duration, because the server accepts only one. Is that the screen you meant?

**C. Back button.** Back from any More-menu screen now reopens the menu. Keep?

**D. AI consent.**
- Build 33 keeps sending documents without asking until build 34 and #802. If Apple objects earlier, the options (turn reading off for everyone, or merge #802 early) both stop reading for build 33 users.
- The screen says PawPi sends documents to Anthropic only to suggest records, instead of promising they are "not used for anything else". OK?
- The privacy policy still calls the reading automatic (fix with Step 6). Also confirm the vendor data-use sentence in section 8 and the App Store Connect privacy answers.
- The choice is stored on the phone only and asked again after signing out. A server record needs a database change.

**E. Finder flow.**
- Should the medical profile's "emergency contact" also show on the public tag? Today it does not.
- A full vet link still shows that contact even when finder contact is "Relay" or "None". OK?
- On "Phone" or "Email" with nothing saved, the page offers no way to reach you. Add the message form as a fallback?
- Finder details are kept until the owner deletes their account. Delete automatically after some time?
- Only the owner is notified, not family members. Change?
- Accept the remaining abuse risk of an anonymous urgent notification (see the local notes and #804), or tighten first?

**F. Wording.** Older vet record text promises more control over sharing than exists. Reword?

**G. Code check tool.** The keyboard rule you asked for as a "lint rule" needs new development dependencies, which this run was not allowed to add. A test covers the text-field cases instead. Add the tool?

### Only verifiable on a physical device
Real push delivery and Focus break-through; tap to call and email; keyboard behaviour on a real iPhone, small screens, hardware, Spanish and emoji keyboards; QR sharing into real apps; a real AI document read; VoiceOver; Android; the native build itself.

## 4. What was not done, and why
- **Lint rule** for nested components: needs new dependencies. Some screens without text fields still have the old pattern (listed in #799).
- **Multiple selection** on the emergency card vet link: the server accepts one value.
- **Vet sharing:** section choice, expiry, invitations, vets without a booking, notifying the vet: need server work.
- **Found, not fixed:** giving access while that vet's own request is still pending causes a server error. The new sheet avoids it; the booking summary's "Share medical records" button can still hit it. That screen's text also leaves out that emergency contact and insurance are opened.
- **Keyboard checks** covered the screens you reported, not every field of every form.
- One of your screenshots (IMG_4839) was not found; that part was done from the code.
- Further technical follow-ups are kept in the local notes only, because this repository is public.

Local evidence (screenshots, not committed): `docs/night-run/2026-11-25/` on your Mac. Full working notes: `NIGHT_RUN_2026-11-25/STATE.md`.
