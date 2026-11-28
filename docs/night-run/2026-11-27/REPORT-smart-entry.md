# Night run — Smart Entry parts 1 and 2 — report (2026-11-27)

**Nothing was built.** The brief arrived without its two task prompts: both slots still held the placeholder line asking for the
"Part 1" and "Part 2" prompt body to be pasted there. I searched for the text in tracked files on `main`, local text and Markdown
files in the project, its parent folder, Desktop, Downloads and Documents, and other Claude Code session transcripts, and found none.
Per rule 9 this run is blocked early: below are a read-only inventory and what is needed to start.

**No SQL, no migration, no app code, no flag, no EAS build, no store setting. No other open PR or branch was touched.**

## Results

| Step | What | PR | State | CI fix attempts | Left over |
|---|---|---|---|---|---|
| 1 | Part 1 backend: parse route, typical-interval table, `canUseSmartEntry`, tests | none | **not started** (no task text) | 0 | all of it |
| 2 | Part 1 mobile: Quick add, review, save, tests (EN/ES) | none | **not started** (no task text; needs 1) | 0 | all of it |
| 3 | Part 2 voice capture: mic, device recognition, EN/ES switch, consent, permission strings | none | **not started** (no task text; needs 2) | 0 | all of it |
| 4 | Part 2 transcribe proxy, Pro gating shape, upgrade card | none | **not started** (no task text; needs 1, 2) | 0 | all of it |
| 5 | Privacy policy and data-map wording (draft only) | none | **not written** | 0 | all of it |
| 6 | This report, roadmap and test backlog | this PR | docs-only, merged when the three checks are green | 0 | — |

## What changes in app behaviour

Nothing.

## Inventory for the next run

Read from the code at `1ce432fd` (`main`). Nothing was run, and request fields and permissions were not reviewed route by route.

### Record types and their add routes

The rule 9 example blocker (a core record type with no add route) was not found for the types below. The task text may define
"core" differently.

| Record | Add route (`POST /api/...`) | Table |
|---|---|---|
| Vaccine | `pet-vaccinations` (also written by `health/medical-care-logs`) | `pet_vaccinations` |
| Medication | `health/medications` | `pet_medications` |
| Preventive treatment | `health/preventive-treatments` | `pet_preventive_treatments` |
| Vet visit | `vet-appointments` | `vet_appointments` |
| Procedure | `vet-record/surgeries` | `pet_surgeries` |
| Allergy, condition, lab result, note, document | `vet-record/{allergies,conditions,lab-results,notes,documents}` | `pet_allergies`, `pet_conditions`, `pet_lab_results`, `vet_notes`, `vet_documents` |
| Weight, wellness, general check | `health/{weight-logs,wellness-logs,general-checks}` | matching `health_*` tables |
| Food, walk, poo, pee, vomit | `health/{food,walk,poo,pee,vomit}-logs` | matching `health_*` tables |
| Routine | `routines` | `routines` |

Grooming sessions are the exception seen: the owner route (`pets/[id]/groom-sessions`) only reads; the write route is the business's.

### Findings that affect the design

1. **Health → Today is built from routines and vet appointments** (`HealthToday.jsx`, `useTodayReminders.js`). I found no path from a
   vaccine's expiry date or a preventive treatment's next due date to Today. If "review and save, then see the reminder in Today" is
   meant to cover vaccines or treatments, saving must also create a routine or appointment, or Today needs a new source.
2. **Speech modules are left out of the native build.** `anything/apps/mobile/package.json` lists `expo-speech` and
   `expo-speech-recognition` under `expo.autolinking.exclude` (#253: Apple rejected an upload that had no speech-recognition
   permission string). Voice needs: `expo-speech-recognition` off that list and added as a direct dependency (a patch for 3.0.1
   already exists), `NSSpeechRecognitionUsageDescription` in `app.json` and the EN/ES locale files, and a new EAS build. Installed
   builds, including 37, do not have the module, so the JavaScript must cope with it being absent.
3. **The current microphone permission text covers only telehealth video** (`app.json`, `locales/en.json`, `locales/es.json`). It needs
   to cover voice entry too.
4. **`ANTHROPIC_API_KEY` is recorded as already set on production** (`docs/app-store-privacy-data-map.md`, on the owner's statement;
   Railway was not read). So a missing key will not keep Smart Entry off: `SMART_ENTRY_ENABLED` has to gate it by itself.
   The existing model call to reuse as a pattern is `utils/enrichment/petRecords.js` (config in `utils/enrichment/config.js`).
5. **No ElevenLabs integration code was found.** The only mentions in `anything/` and `docs/` are about reverting the temporary legal
   identity after the grant answer.
6. **No Pro-style gating for pet owners was found** by searching for the usual names. `utils/iap/useInAppPurchase.js` exists, but I
   found nothing outside that folder using it. An upgrade card would have nothing to sell yet, which is also worth weighing for App
   Review.
7. **Consent storage:** the existing AI consent (`utils/aiDocConsent.js`) uses AsyncStorage, per user, removed on sign-out. Rule 6
   asks for secure storage, so voice consent would differ from it unless you prefer to match.
8. **Rate limits** already have a shared helper (`utils/rateLimit.js`: `RATE_LIMITS`, `withRateLimit`).
9. **`docs/legal/TEMP-company-identity-revert.md` is on `main`.** So part 2's instruction about recording added privacy lines in it
   applies; the instruction itself was in the missing text.
10. **CI timing:** the mobile jest job has `timeout-minutes: 15` and its comment puts the suite at about 2 minutes. A run of 30+
    minutes would now fail rather than finish. All three jobs skip their tests on docs-only changes.

## Decisions I made that you may want to change

1. **Did not build from the step list alone.** The rules name the pieces but not the record types, the parse contract, the limits, the
   screens or the consent text, and merging to `main` deploys the server.
2. **Did not write the privacy draft.** Rule 7 lets it be written any time, but it must describe what is sent to whom and kept for how
   long, and that is defined in the missing text.
3. **Merged this report** under rule 9.

## Human steps in the morning

### 1. Unblock the run

Send the full brief again with both prompt bodies in place, each starting at `TASK:`. The rules can stay as they are.

### 2. Railway keys and flags

**Nothing to set today:** no code reads a Smart Entry flag yet. Suggested order once steps 1 to 5 are done (check the names against
what gets built):

1. Review and merge the privacy wording draft.
2. Confirm `ANTHROPIC_API_KEY` is present.
3. Add `ELEVENLABS_API_KEY`.
4. Ship a new app build and test it.
5. Set `SMART_ENTRY_ENABLED` last.

### 3. Phone checklist (for later; nothing to test yet)

- [ ] Microphone permission denied: the app explains and typing still works.
- [ ] Microphone permission granted.
- [ ] One entry in Spanish, one in English.
- [ ] One sentence mixing both languages.
- [ ] Review screen, edit, save.
- [ ] The reminder shows in Health → Today (see finding 1).

### 4. Parked decisions

| Decision | Note |
|---|---|
| Free uses per month | needed for the Pro gating shape |
| Who reviews the typical-interval table | needed before the flag is turned on |
| Server-side consent record | voice consent is to be stored on the device only for now (rule 6); would need a table and SQL |
| In-app purchase | no purchase path found (finding 6) |
| Vaccine and treatment due dates in Today | new, from finding 1 |

## Stopped on

| What | Why |
|---|---|
| Steps 1 to 4 | the Part 1 and Part 2 task text was not in the message |
| Step 5 | depends on the same text for the data flows and the TEMP-document instructions |
