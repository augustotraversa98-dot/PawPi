# PawPi — Bilingual (ES/EN) Night Run Prompt

Give the block below to Claude Code as a single overnight task. It is written to be
run unattended: it commits frequently to a dedicated branch, never touches DB /
persistence logic, and leaves a report for morning review.

---

```
ROLE
You are doing an autonomous overnight run to make PawPi fully bilingual (Spanish +
English) across BOTH the app and the web, with Argentine formatting for dates and
time. Work carefully, commit often, and leave a clear morning report.

FULLY AUTONOMOUS — NEVER STOP TO ASK
- I am asleep. Do NOT ask me any questions, do NOT wait for confirmation, and do NOT
  pause for approval at any point — not at the start, not mid-run, not before finishing.
- For EVERY decision (ambiguous wording, unclear scope, tooling choice, whether a word
  is "universal", how to structure a key, etc.): pick the option you judge best, apply
  it, keep going, and record the decision in the morning report. A reasonable choice
  made and logged is always better than stopping.
- The ONLY reason to halt early is if continuing would be destructive or unsafe (e.g.
  you cannot create the branch, or a change would break another team's work). In that
  case: stop touching things, revert your uncommitted change, and write what happened
  in the report — do not try to "ask" and wait.

PARALLEL WORK — STAY OUT OF THE WAY (IMPORTANT)
- Another developer (Claude Code) is working IN PARALLEL on payment-options
  enhancements. You must not collide with, overwrite, or depend on their work.
- Do ALL of your work on an isolated branch (see branch rules below). Do NOT merge,
  rebase onto, deploy, or push to main/production. Deployment happens later, by a human,
  only after review.
- AVOID editing payment-related code. Treat these as off-limits except for pure,
  self-contained string/date swaps that touch nothing else: anything payments, billing,
  checkout, Stripe, in-app purchase (iap), subscriptions, and the rxf (pharmacy
  delivery) / ins (insurance) pay flows. If a payment file has user-facing strings you
  want to translate, PREFER to skip it and list it in the report under "Deferred —
  payment area (parallel work in progress)" rather than risk a conflict. Only localize
  such a file if the change is trivially isolated to a visible label and cannot affect
  payment logic — and note it explicitly in the report.
- If you ever hit a git conflict, an unexpected local change you did not make, or a file
  that changed under you: do NOT resolve by overwriting. Leave that file as-is, skip it,
  and record it in the report so the human can reconcile it with the payment branch.

REPO LAYOUT (already verified — do not re-discover from scratch)
- App (iOS/Android + web build): anything/apps/mobile   → Expo / React Native, mostly .jsx/.js
    - i18n is ALREADY scaffolded here: i18next + react-i18next + expo-localization
    - Config: anything/apps/mobile/src/i18n/index.js
    - Language preference (persisted): anything/apps/mobile/src/i18n/localePreference.js
    - Strings: anything/apps/mobile/src/i18n/locales/en.json  and  es.json
    - Settings language switcher: anything/apps/mobile/src/app/(tabs)/more/settings.jsx
    - Only ~29 of ~280 component files currently use t(); the rest are hardcoded English.
    - date-fns 4.x is installed.
- Web: anything/apps/web   → React Router 7 (SSR) + Vite + bun, ~40 real pages, Chakra UI
    - NO i18n exists yet. Nothing installed, zero usage.
    - date-fns 4.x is installed.

TOP-LEVEL GOAL
1. Every user-facing string in BOTH apps is translatable and has correct EN + ES text.
2. The app auto-selects language: use the device/browser language; if it is not
   English or Spanish, FALL BACK TO SPANISH (we launch in Argentina first). A manual
   override in Settings always wins and persists.
3. All dates render Argentine-style: day-month-year (dd/MM/yyyy) and 24-hour time
   (HH:mm). Month/day names localized; calendars/date-pickers start the week on Monday.
4. Spanish is neutral Latin-American Spanish using "tú" (NOT Argentine voseo). Be
   consistent: also convert the existing voseo strings in mobile es.json (e.g.
   "Intentá", "Elegí", "Compartí", "Toca"→already tú, etc.) to consistent "tú" forms.

HARD RULES
- SCOPE = language + date/time only. Do NOT change numbers, decimal separators, units
  (kg/cm), or currency formatting in this run. Leave those exactly as they are.
- Do NOT touch database schema, queries, persistence, auth, IDs, or business logic.
  This is a presentation-layer localization pass only. If a string is built from data,
  translate the surrounding labels, not the data.
- NO fake/placeholder data. Respect the project's empty-state rules — translate the
  existing empty states ("No upcoming appointments", etc.), never invent content.
- "Universal" words STAY IN ENGLISH. Keep the English word when it is a widely-used
  loanword or brand/product term, specifically: match, chat, PawPi, and the product
  coinages already in the app (e.g. "paws", "barks", "daily"/"dailies" as the feature
  name). When unsure whether a word is "universal", KEEP ENGLISH and add it to the
  report's "Needs human decision" list rather than guessing a translation.
- Keep the SAME translation key structure across app and web so keys stay in sync
  (namespace.key, e.g. "health.vetRecord"). Reuse existing mobile keys/namespaces.
- Missing key MUST fall back to English, never show a raw key on screen. (Mobile
  already does this via returnEmptyString:false + fallbackLng:"en" — replicate on web.)
- Preserve all existing interpolation ({{insurer}}, {{pet}}, etc.) and any i18next
  plural forms. Add plurals where Spanish needs them.
- BRANCH ISOLATION (do this first, before any edits):
    * Note the current branch and its HEAD commit; record both in the report. The repo
      may currently be checked out on a payment branch (e.g.
      `booking-payments-phase3-mobile`) — do NOT branch off that. Another agent is
      working there in parallel.
    * Base your work on `main`. Create branch `feat/i18n-es-ar` FROM `main`
      (`git fetch` first if a remote exists, then branch off the latest local main),
      NOT off whatever is currently checked out.
    * Create it as a SEPARATE GIT WORKTREE so you never disturb the other agent's
      working directory. Use a sibling path, e.g.:
        git worktree add ../pawpi-i18n-es-ar -b feat/i18n-es-ar main
      Then do ALL of your work inside that worktree directory. Do not `git checkout` a
      different branch in the original working directory — leave it exactly as you found
      it so the parallel payment work is untouched.
    * Commit in small, logical batches (per screen or feature area) with clear messages
      so each is easy to review or revert.
    * NEVER force-push. NEVER commit to or merge into main/production. Do NOT open a PR
      and do NOT deploy anything. Leave the branch ready for a human to review and merge
      later, only if everything is OK and nothing was overwritten.
    * Do not modify anything outside anything/apps/mobile and anything/apps/web except
      the report/doc files this task asks for.

WEB i18n SETUP (build from scratch, SSR-safe)
- Add i18next + react-i18next to anything/apps/web (match the mobile major versions
  where reasonable). Create a client + server init that is SSR-safe for React Router 7:
    - Detect language on the server from a cookie `pawpi_locale` first, else the
      Accept-Language header; if neither yields en/es, default to Spanish.
    - Pass the resolved language into the app so the FIRST server render already uses
      it — no hydration mismatch, no English flash.
    - Persist the manual choice in the `pawpi_locale` cookie (1 year), mirroring the
      mobile localePreference behavior ("system" | "en" | "es").
- Add a language switcher to the web (in account/settings and/or header, wherever a
  settings surface exists) with the same three options as mobile.
- Create anything/apps/web locales: en.json + es.json using the SAME namespaces/keys
  as mobile so the two stay aligned. Where the same string exists in both apps, copy
  the mobile value so wording matches.

STRING EXTRACTION (both apps)
- Go area by area. For each screen/component:
    1. Find hardcoded user-facing strings (JSX text, button labels, placeholders,
       to::/alert/toast messages, accessibility labels, headers, empty states,
       validation messages).
    2. Replace with t("namespace.key"); add the key to BOTH en.json and es.json for
       that app.
    3. Do NOT translate: code identifiers, log messages, test fixtures, analytics event
       names, API field names, or anything not shown to the user.
- Prioritize by user visibility, in this order:
    App (mobile): (tabs) Feed, Health (Today/Track/Insights/Vet Record and all
    Health/* subfolders), Training, Community/Forum, Services, More (My Dog, Dog
    Profile, Reminders & Routines, Pet Services/Veterinary, Settings), Auth/onboarding,
    Map, SocialWalks, Providers, moderation, shared ui components.
    Web: auth (signin/signup/forgot/reset), account, card/tag pages, layout/nav,
    errors, and all remaining pages.
- Keep the mobile en.json as the canonical wording source; when the web needs a string
  that already exists in mobile, reuse the exact same key and English text.

ARGENTINE DATE & TIME (both apps)
- Create ONE shared date/time helper per app (e.g. mobile src/utils/datetime.js and a
  web equivalent) built on date-fns with the `es` locale when language is Spanish and
  default/`enUS` when English. Expose: formatDate (dd/MM/yyyy), formatDateLong
  (e.g. "5 de agosto de 2026" / "August 5, 2026"), formatTime (HH:mm, 24-hour),
  formatDateTime, and formatRelative (localized "hace 2 h" / "2h ago").
- Replace ad-hoc formatting: audit every toLocaleDateString / toLocaleTimeString /
  hardcoded "MM/DD" or "h:mm a" / manual date string building in both apps (~27 spots
  in mobile, a couple in web) and route them through the helper.
- Any date-picker / calendar component (react-native-calendars, react-day-picker,
  DateTimePicker): set locale to Spanish when active and weekStartsOn = Monday.
- Do NOT convert or shift stored timestamps — only change DISPLAY formatting. User
  timezone is America/Buenos_Aires; render in local time as the app already does.

DELIVERABLES (leave these in the repo for the morning)
- Fully populated en.json + es.json for BOTH apps, keys aligned.
- Working web i18n infrastructure + language switcher (SSR-safe, cookie-persisted).
- Shared date/time helper in each app, wired everywhere dates/times are shown.
- A report file at anything/I18N_NIGHT_RUN_REPORT.md containing:
    * What was done per area, with commit hashes.
    * Coverage: count of files touched, strings extracted, and any user-facing strings
      you could NOT safely migrate (list file + line).
    * "Needs human decision" list: words you were unsure whether to keep English, and
      any Spanish phrasing you want me to sanity-check.
    * Anything you skipped and why.
- A short doc at anything/docs/I18N.md explaining the system and "how to add a new
  string" for both apps (so future work stays consistent).

VERIFICATION (must pass before you finish — this is part of the job)
- Write/adjust a small script or grep pass that flags remaining hardcoded user-facing
  strings in both apps; drive it as close to zero as reasonable and list the residue.
- Run the existing test suites and fix anything you broke:
    mobile:  npm test        (from anything/apps/mobile)
    web:     bun run test  +  bun run typecheck  +  bun run build   (from anything/apps/web)
- Confirm both languages actually render: switch to ES and to EN, and verify no raw
  keys appear and no English leaks in ES (and vice-versa) on the main screens.
- Confirm dates show dd/MM/yyyy and times show HH:mm in both languages, and that
  first-open with an es-* device/browser lands in Spanish while an unsupported locale
  also lands in Spanish, and en-* lands in English.
- Verify the existing mobile es.json voseo strings are now consistent "tú".
- Keep the app buildable at every commit; if a change is risky, isolate it.

DEFINITION OF DONE
[ ] Web has working, SSR-safe ES/EN i18n + persisted language switcher.
[ ] App + web: all prioritized user-facing strings translated (EN + neutral-tú ES).
[ ] Universal words (match, chat, brand/product terms) kept in English.
[ ] Dates day-month-year, times 24h, week starts Monday, Spanish month/day names.
[ ] Auto-language: device/browser → fallback Spanish; manual override persists.
[ ] es.json voseo normalized to tú; keys aligned across both apps.
[ ] Tests, typecheck, and web build pass; report + I18N.md written; work committed to
    feat/i18n-es-ar.
[ ] Branched from main, in a separate git worktree; the original working directory /
    payment branch was left untouched.
[ ] ALL work is on feat/i18n-es-ar only. Nothing merged, pushed to main, or deployed.
    No payment/billing/checkout logic changed; any payment-area strings were deferred
    and listed. No files outside your scope were overwritten; any conflicts are logged.
[ ] Report records the base branch + HEAD commit you branched from, and a "Deferred —
    payment area" list, so it's easy to confirm nothing collided with the parallel work.
```

---

### Notes for you (not part of the prompt)

- The app already had the i18n *engine* wired but almost nothing was using it, so most
  of the mobile work is extraction, not setup. The web is the bigger lift because i18n
  is being added from zero (and SSR needs care to avoid an English flash / hydration
  mismatch).
- I told it to keep numbers/units/currency untouched this run (your choice). When
  you're ready, a follow-up run can add `es-AR` number formatting (1.234,5), ARS
  currency, and metric unit labels — it's a clean, separate pass.
- If you'd rather one shared locale file feed both apps instead of two aligned copies,
  that's a small architecture change; say the word and I'll adjust the prompt.
