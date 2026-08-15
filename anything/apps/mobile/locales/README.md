# `locales/` — iOS **system prompt** strings (not the app's UI copy)

These two files feed Expo's `expo.locales` config in `app.json`. At prebuild, Expo turns each one
into an `<locale>.lproj/InfoPlist.strings` file inside the iOS project, so the **operating system**
renders permission prompts (camera, photo library, location, microphone, calendar) in the user's
language instead of always in English.

They are deliberately separate from `src/i18n/locales/{en,es}.json`, which is the in-app `t()`
catalog. Different consumer, different key space:

| | `locales/` (this folder) | `src/i18n/locales/` |
|---|---|---|
| Read by | iOS, at permission-prompt time | React, via `t("namespace.key")` |
| Keys | `Info.plist` keys (`NS…UsageDescription`) | dotted app keys (`common.back`) |
| Applied at | `expo prebuild` / EAS build | runtime |

## Rules
- **EN and ES must carry the identical key set** — `locales.test.js` fails the build otherwise.
- Every key here must also exist in `ios.infoPlist` in `app.json`. That copy is the base
  (unlocalized) fallback iOS uses for any language we do not ship; the English file here must match
  it word for word, so `locales.test.js` pins that too.
- Copy has to stay **accurate to why PawPi actually needs the permission** — Apple reads these at
  review, and they must agree with `docs/app-store-privacy-data-map.md`. Adding a permission means
  updating the privacy map in the same change.
- `CFBundleDisplayName` stays "PawPi" in both: it is a brand name, not copy.

## Adding a permission
1. Add the `NS…UsageDescription` key to `ios.infoPlist` in `app.json` (English).
2. Add the same key to **both** files here, with the ES translation in Argentine Spanish (voseo),
   matching the tone of `src/i18n/locales/es.json`.
3. Update `docs/app-store-privacy-data-map.md`.
4. Run `npm test` — `locales.test.js` guards steps 1–2.
