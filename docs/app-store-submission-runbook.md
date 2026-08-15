# PawPi — App Store submission runbook

The exact, ordered steps to ship PawPi v1 to the App Store. **Claude Code cannot submit** (no Apple
login in its environment), so this is the runbook **Tats** runs with the enrolled Apple Developer
account. Companion docs: `docs/app-store-connect-content.md` (copy/paste metadata), the App Privacy
map (§9 there + `docs/app-store-privacy-data-map.md`), `docs/app-store-readiness.md` (compliance
pass), `docs/guideline-1.2-audit.md` (UGC), and `docs/legal/` (Privacy + Terms).

Everything below is **manual** unless it shows a shell command. Do the prerequisites once, then the
release steps for each build.

---

## 0. One-time prerequisites (do these once)

1. **Apple Developer Program** — enrolled (done). Note your **Apple ID email**, **Team ID**
   (`YHQ4T9T96K`), and the **App Store Connect App ID** (`ascAppId 6785949610`).
2. **App record in App Store Connect** — if not created yet: ASC → **My Apps → + → New App**
   - Platform: iOS · Name: **PawPi** · Primary language: **English (U.S.)** · Bundle ID:
     **com.pawpi.app** · SKU: **PAWPI-IOS-001**.
3. **Push Notifications capability** — Apple Developer → Certificates, Identifiers & Profiles →
   Identifiers → the `com.pawpi.app` App ID → enable **Push Notifications**. **Do not change the
   bundle id.**
4. **EAS CLI** — `npm i -g eas-cli` (or use `npx eas-cli@latest`); `eas login`.
5. **Fill the submit credentials** — in `anything/apps/mobile/eas.json` under
   `submit.production.ios`, set your `appleId` (the placeholder is already there). `ascAppId` and
   `appleTeamId` are already filled.
6. **APNs key (lights up iOS push)** — from `anything/apps/mobile`:
   ```bash
   eas credentials
   ```
   Select **iOS → Push Notifications: Manage your Apple Push Notifications Key** and let EAS
   **create/upload an APNs Key (.p8)**. EAS stores it and links it to the Expo project
   (`projectId e1ab38b2-5f41-4d15-bc18-64c8b0717a3d`). One APNs key covers dev + prod.
   - *(Optional)* For server-side send auth/receipts, create an **`EXPO_ACCESS_TOKEN`** (Expo
     dashboard → Account → Access Tokens) and set it on the **Railway** web service env. Not required
     for basic delivery — the send layer no-ops gracefully without it.
7. **Legal URLs live** — confirm the reviewed Privacy Policy + Terms are published to the hosted
   `pawpi-legal` GitHub Pages repo, and that `EXPO_PUBLIC_PRIVACY_POLICY_URL` / `EXPO_PUBLIC_TERMS_URL`
   (see `anything/apps/mobile/src/constants/legal.js`) point at them. The ASC **Privacy Policy URL**
   must equal the hosted EN Privacy Policy URL.
8. **Demo account for review** — sign up **inside the app** with the credentials in
   `app-store-connect-content.md` §10 (`augustotraversa98+appreview@gmail.com`) and hand-populate one
   dog + a few posts + a couple of reminders + one vet-record entry, so no tab looks empty. (The
   global demo *seed* is deliberately excluded from real users' feeds — see night-run A2a — so this
   review account is a normal, real account you fill in by hand.)

---

## 1. Pre-flight checks (each release)

- `app.json`: `expo.version` (marketing version, `1.0.0` for the first release) and
  `expo.ios.buildNumber`. `eas.json` uses `appVersionSource: remote` + `autoIncrement: true` on the
  production profile, so **EAS manages the build number** — you don't bump it by hand. Bump
  `expo.version` only for a user-facing version change.
- Confirm permission usage strings are present + accurate in `app.json` `ios.infoPlist` (location,
  camera, photo add/library, microphone, calendars). See §5 below re: EN/ES.
- `ITSAppUsesNonExemptEncryption: false` is set (export compliance auto-resolves).
- Run the test gates from the repo root of each app:
  ```bash
  cd anything/apps/mobile && npm test
  cd anything/apps/web && npm test && npm run test:integration
  ```

## 2. Build (production, iOS)

From `anything/apps/mobile`:
```bash
eas build --platform ios --profile production
```
- First run prompts for signing — let EAS manage credentials (distribution cert + provisioning
  profile). The APNs key from step 0.6 is reused.
- When it finishes, EAS holds the `.ipa`. Optionally test via TestFlight first.

## 3. Submit the build to App Store Connect

```bash
eas submit --platform ios --profile production
```
- This uploads the latest production build to ASC using `ascAppId` + `appleId` + `appleTeamId` from
  `eas.json`. It does **not** submit the app *for review* — it just delivers the binary. Final
  "Submit for Review" is a manual button in ASC (step 6).

## 4. Fill the ASC listing (paste from `app-store-connect-content.md`)

In App Store Connect → the PawPi app → the **1.0** version:
1. **App Information**: Subtitle, Category (**Lifestyle**), Content Rights, Age Rating
   (answer the questionnaire per §8 → ~13+).
2. **Privacy Policy URL** (App Information) = hosted EN Privacy Policy URL.
3. **Pricing**: Free.
4. **Version metadata** (per locale — add **English (U.S.)** and **Spanish** — see §5 below):
   Promotional text, Description, Keywords, Support URL, Marketing URL, "What's New".
5. **App Privacy** (App Privacy → Get Started / Edit): declare exactly what
   `app-store-privacy-data-map.md` lists — Contact Info, User Content, Location (precise + coarse),
   Identifiers (User ID + device push token), Purchase History; **no Tracking**, **no third-party
   ads**, Diagnostics = None; **Data deletion = Yes**.

## 5. Screenshots + localized metadata

- **Screenshots (required):** iPhone **6.9"** (1290×2796) and **6.7"** (1284×2778); 3–10 each. v1 is
  iPhone-only (`ios.supportsTablet: false`) so **no iPad assets**. Shoot the 8 hero screens listed in
  `app-store-connect-content.md` §12 on a real device / TestFlight build (simulator screenshots are
  acceptable if status bar is clean).
- **Localization (EN + ES):** the app is bilingual, so add a **Spanish** ASC localization and paste
  the ES metadata from `app-store-connect-content.md` §13. Spanish screenshots are optional; if you
  skip them ASC reuses the English set.
- **Permission strings EN/ES — ✅ DONE (PP2).** `expo.locales` in `app.json` points at
  `anything/apps/mobile/locales/{en,es}.json`, and `ios.infoPlist.CFBundleLocalizations` is
  `["en","es"]`. Prebuild turns each file into an `<locale>.lproj/InfoPlist.strings`, so iOS renders
  the camera / photos / location / microphone / calendar prompts in the user's language. The English
  file mirrors `ios.infoPlist` verbatim (the base fallback); `locales/locales.test.js` pins key
  parity + that mirror in CI. **Verify once on the build:** run a Spanish-language device or
  simulator against the TestFlight build and confirm one prompt (camera is easiest) comes up in
  Spanish. If it doesn't, the cause is almost always the `.lproj` folders missing from the archive —
  re-run `expo prebuild --clean` before `eas build`.

## 6. Submit for review

1. Attach the uploaded build (step 3) to the 1.0 version.
2. **App Review Information**: paste the reviewer notes from `app-store-connect-content.md` §10
   (demo login, external-payments rationale for **Guideline 3.1.3(e)**, account-deletion path
   **5.1.1(v)**, location usage, social-login env-gating, health positioning **1.4.1**, UGC
   moderation **1.2** + contact `augusto@pawpi.info`).
3. **Export compliance**: confirm "No" (uses only exempt encryption).
4. Click **Add for Review → Submit**.

## 7. After submission

- Watch for ASC messages; respond to any Review questions using the notes above.
- On approval, choose **manual release** or auto-release.
- Confirm on a device: push arrives (APNs live), legal links open, delete-account works.

---

## Quick command reference (run by Tats, from `anything/apps/mobile`)
```bash
eas login
eas credentials                                   # one-time: create/upload APNs key
eas build   --platform ios --profile production    # build the .ipa
eas submit  --platform ios --profile production    # deliver to App Store Connect
```

## What Claude Code did NOT do (by design)
- Did not log into Apple, create the App Store Connect record, upload a build, or press Submit.
- Did not create/upload the APNs key (needs the Apple account).
- Prepared: config (`app.json`/`eas.json`), all copy/metadata (EN+ES), the App Privacy map, this
  runbook, and the compliance cross-checks.
