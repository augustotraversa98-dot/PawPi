# PawPi — PROMPT 1 of 2: Spanish/English Localization (night run)

Paste the block below into a fresh Claude Code conversation. It runs unattended on its
own branch off `main` (now that the payment work is merged), never asks questions, and
does not deploy.

---

```
ROLE
You are doing an autonomous run to make PawPi fully bilingual (Spanish + English)
across BOTH the app and the web, with Argentine formatting for dates and time. Work
carefully, commit often, and leave a clear morning report.

FULLY AUTONOMOUS — NEVER STOP TO ASK
- Do NOT ask me any questions, do NOT wait for confirmation, do NOT pause for approval
  at any point — not at the start, not mid-run, not before finishing.
- For EVERY decision (ambiguous wording, unclear scope, whether a word is "universal",
  key naming, etc.): pick the option you judge best, apply it, keep going, and log the
  decision in the report. A reasonable choice made and logged beats stopping.
- Only halt early if continuing would be destructive/unsafe; if so, revert your
  uncommitted change and write what happened in the report — do not wait for me.

BRANCH & SAFETY (do this first)
- The payment branch has just been merged, so base your work on the latest `main`:
  if a remote exists, `git fetch` and branch off the newest local `main`.
- Create and work on a dedicated branch: `feat/i18n-es-ar`. If other sessions share
  this working directory, create it as a separate git worktree
  (`git worktree add ../pawpi-i18n-es-ar -b feat/i18n-es-ar main`) and work there so
  you never disturb another session's checkout.
- Commit in small, logical batches (per screen/feature) with clear messages.
- NEVER force-push, NEVER merge into main, do NOT open a PR, do NOT deploy. Leave the
  branch ready for a human to review and merge later only if everything is OK.
- Record the base branch + HEAD commit you branched from in the report.

REPO LAYOUT (already verified — don't re-discover)
- App (iOS/Android + web build): anything/apps/mobile → Expo / React Native (.jsx/.js)
    - i18n ALREADY scaffolded: i18next + react-i18next + expo-localization
    - Config: src/i18n/index.js   Preference (persisted): src/i18n/localePreference.js
    - Strings: src/i18n/locales/en.json  and  es.json
    - Language switcher: src/app/(tabs)/more/settings.jsx
    - Only ~29 of ~280 component files use t() today; the rest are hardcoded English.
    - date-fns 4.x installed.
- Web: anything/apps/web → React Router 7 (SSR) + Vite + bun, ~40 pages, Chakra UI
    - NO i18n exists yet. Nothing installed, zero usage. date-fns 4.x installed.

GOAL
1. Every user-facing string in BOTH apps is translatable with correct EN + ES text.
2. Auto-language: use the device/browser language; if it is NOT en or es, fall back to
   SPANISH (we launch in Argentina first). A manual override in Settings always wins
   and persists.
3. Argentine dates/time everywhere: day-month-year (dd/MM/yyyy) and 24-hour time
   (HH:mm); localized month/day names; calendars/date-pickers start the week on Monday.
4. Spanish = neutral Latin-American Spanish using "tú" (NOT voseo). Be consistent, and
   convert the existing voseo strings in mobile es.json ("Intentá", "Elegí",
   "Compartí", etc.) to consistent "tú" forms.

HARD RULES
- SCOPE = language + date/time ONLY. Do NOT change numbers, decimal separators, units
  (kg/cm), or currency in this run. Leave those exactly as they are.
- Do NOT touch database schema, queries, persistence, auth, IDs, or business logic.
  This is a presentation-layer pass. If a string is built from data, translate the
  surrounding labels, not the data.
- NO fake/placeholder data. Translate existing empty states; never invent content.
- "Universal" words STAY IN ENGLISH: match, chat, PawPi, and existing product coinages
  (e.g. "paws", "barks", "daily"/"dailies" as feature names). When unsure whether a
  word is universal, KEEP ENGLISH and add it to the report's "Needs human decision"
  list rather than guessing.
- Keep the SAME key structure across app and web (namespace.key, e.g.
  "health.vetRecord"). Reuse existing mobile keys/namespaces; mobile en.json is the
  canonical wording source — when web needs a string mobile already has, reuse the
  exact key + English text.
- Missing key MUST fall back to English, never show a raw key. (Mobile already does
  this via returnEmptyString:false + fallbackLng:"en" — replicate on web.)
- Preserve all interpolation ({{insurer}}, {{pet}}, …) and i18next plurals; add plurals
  where Spanish needs them.

WEB i18n SETUP (from scratch, SSR-safe)
- Add i18next + react-i18next to anything/apps/web (match mobile major versions where
  reasonable). SSR-safe init for React Router 7:
    * Resolve language on the SERVER from cookie `pawpi_locale` first, else the
      Accept-Language header; if neither yields en/es, default to Spanish.
    * Pass the resolved language into the first server render — no hydration mismatch,
      no English flash.
    * Persist manual choice in cookie `pawpi_locale` (1 year), mirroring mobile's
      preference model ("system" | "en" | "es").
- Add a web language switcher (account/settings and/or header) with the same 3 options
  as mobile.
- Create anything/apps/web locales en.json + es.json using the SAME namespaces/keys as
  mobile; copy mobile values where the same string exists.

STRING EXTRACTION (both apps)
- Area by area. For each screen/component: find hardcoded user-facing strings (JSX text,
  buttons, placeholders, toast/alert messages, a11y labels, headers, empty states,
  validation), replace with t("namespace.key"), add the key to BOTH en.json and es.json.
- Do NOT translate code identifiers, log messages, test fixtures, analytics event
  names, or API field names.
- Priority order:
    App: (tabs) Feed, Health (Today/Track/Insights/Vet Record + all Health/* subfolders),
    Training, Community/Forum, Services + service/* screens, More (My Dog, Dog Profile,
    Reminders & Routines, Pet Services/Veterinary, Settings, data-access), Auth/onboarding,
    Map, SocialWalks, Providers, moderation, shared ui.
    Web: auth (signin/signup/forgot/reset), account, card/tag pages, layout/nav, errors,
    then all remaining pages.

ARGENTINE DATE & TIME (both apps)
- Create ONE shared date/time helper per app (mobile src/utils/datetime.js + a web
  equivalent) built on date-fns, using the `es` locale when language is Spanish and
  enUS when English. Expose: formatDate (dd/MM/yyyy), formatDateLong
  ("5 de agosto de 2026" / "August 5, 2026"), formatTime (HH:mm, 24h), formatDateTime,
  formatRelative (localized "hace 2 h" / "2h ago").
- Route EVERY existing toLocaleDateString / toLocaleTimeString / hardcoded "MM/DD" /
  "h:mm a" / manual date building through the helper (~27 spots in mobile, a couple in
  web).
- Any date-picker/calendar (react-native-calendars, react-day-picker, DateTimePicker):
  Spanish locale when active, weekStartsOn = Monday.
- Do NOT convert/shift stored timestamps — DISPLAY formatting only. Timezone is
  America/Buenos_Aires; render in local time as the app already does.

DELIVERABLES
- Fully populated en.json + es.json for BOTH apps, keys aligned.
- Working web i18n infra + SSR-safe, cookie-persisted language switcher.
- Shared date/time helper in each app, wired everywhere dates/times show.
- Report at anything/I18N_NIGHT_RUN_REPORT.md: what was done per area with commit
  hashes; coverage (files touched, strings extracted, any user-facing strings you could
  NOT safely migrate with file:line); "Needs human decision" list; base branch + HEAD
  commit; anything skipped and why.
- Doc at anything/docs/I18N.md: how the system works + "how to add a new string" for
  both apps.

VERIFICATION (part of the job — must pass before finishing)
- Grep/script pass flagging remaining hardcoded user-facing strings in both apps; drive
  it near zero and list the residue.
- Run and fix: mobile `npm test`; web `bun run test` + `bun run typecheck` +
  `bun run build`.
- Confirm both languages render with no raw keys and no EN leaking into ES (or vice
  versa) on main screens; dates show dd/MM/yyyy and times HH:mm in both; es-* device →
  Spanish, unsupported locale → Spanish, en-* → English; es.json voseo normalized to tú.
- Keep the app buildable at every commit.

DEFINITION OF DONE
[ ] Branched from latest main on feat/i18n-es-ar (worktree if folder shared); nothing
    merged, pushed to main, or deployed.
[ ] App + web: all prioritized user-facing strings translated (EN + neutral-tú ES).
[ ] Universal words kept in English.
[ ] Dates dd/MM/yyyy, times 24h, week starts Monday, Spanish month/day names.
[ ] Auto-language device/browser → fallback Spanish; manual override persists.
[ ] es.json voseo normalized to tú; keys aligned across both apps.
[ ] Web has SSR-safe ES/EN i18n + persisted switcher.
[ ] Tests, typecheck, web build pass; report + I18N.md written.
```
