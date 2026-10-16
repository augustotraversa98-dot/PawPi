# PawPi live-QA — bug report & run-log template

Two things live here:

1. **Run file** — one markdown file per QA run, saved in `docs/qa/runs/` (section A).
2. **Bug entry** — one block per defect, pasted inside that run file (section B).

Rules that apply to both: see `live-qa-rules.md` (test-account protocol, DO-NOT-TOUCH list, design
checks). **Never put the QA account password, tokens, or real personal data in a run file or in
a screenshot that gets committed.**

---

## A. Run file

**File name:** `docs/qa/runs/YYYY-MM-DD_<build>_<device>.md`
e.g. `docs/qa/runs/2026-10-17_1.0.2-b26_macbook-m5.md`. Two runs on the same day add `-2`.

**Screenshots:** keep them outside git unless they are small and contain only QA-account data
(`QA-…` names). If committed, put them in `docs/qa/runs/<run-file-name-without-.md>/` and name them
`<screen-id>_<NN>_<en|es>.png` (e.g. `health-today_03_es.png`). `<screen-id>` = the heading slug from
`screen-and-button-inventory.md`.

```markdown
# QA run — <YYYY-MM-DD>

| Field | Value |
|---|---|
| Date / time (local) | |
| Tester | (Claude session id or human name) |
| App | PawPi — version `1.0.2`, build `26` (read from Info.plist / App Store; do not guess) |
| Source of binary | Mac App Store, "iPhone & iPad Apps" · or iPhone Mirroring |
| Device | e.g. MacBook (Apple M5), macOS 26.4.1 · window size WxH |
| Backend | LIVE production (`pawpi.info`) |
| QA account | `qa-…@…` (password is NOT recorded here) |
| QA dog | `QA-Dog-…` |
| Language(s) tested | EN / ES (device language + in-app language) |
| Appearance | Light / Dark |
| Scope | Which inventory areas were covered |
| Not tested (and why) | Anything skipped, especially DO-NOT-TOUCH flows |

## Summary
- Screens checked: N · PASS: N · FAIL: N · BLOCKED: N · Not reached: N
- Bugs by severity: blocker N · major N · minor N · cosmetic N

## Per-screen results
| Screen ID (inventory heading) | Lang | PASS / FAIL / BLOCKED | Screenshot(s) | Bug IDs | Notes |
|---|---|---|---|---|---|
| feed | EN | PASS | feed_01_en.png | | |

## Bugs
(one block per bug — section B)

## Test data left behind in the live app
List every `QA-…` object created (pets, posts, reminders, logs) so it can be cleaned up.
```

Status meanings: **PASS** = every check in the "Design checks" list passed and every button did its
expected result. **FAIL** = at least one check failed (link a bug). **BLOCKED** = could not reach the
screen (gated, crashed, DO-NOT-TOUCH). **Not reached** = never opened this run.

---

## B. Bug entry

Copy this block once per bug. ID format: `<run date>-NN`, e.g. `2026-10-17-03`.

```markdown
### BUG 2026-10-17-NN — <one-line title: what is wrong, where>

- **Severity:** blocker | major | minor | cosmetic
- **Screen:** <inventory heading> (`route` / `src/...jsx` from the inventory)
- **Language / appearance:** EN | ES · light | dark
- **App build:** 1.0.2 (26) · Mac (Apple M5), macOS 26.4.1
- **Reproducible:** always | sometimes (n of m) | once
- **Regression?:** unknown | worked in build <x>

**Steps to reproduce**
1. Start state (account, tab, data needed, e.g. "QA account, QA-Dog-1, no reminders")
2. …
3. …

**Expected result** (cite the inventory row, e.g. "Health → Today #4")
…

**Actual result**
…

**Evidence**
- Screenshots: `…_01_en.png` (before) · `…_02_en.png` (after)
- Visible error text (copy exactly): "…"

**Design-check failed** (tick any that apply, from live-qa-rules.md):
[ ] cut-off/overlap  [ ] low contrast  [ ] hidden by keyboard/tab bar/safe area  [ ] tap target too small
[ ] EN/ES overflow  [ ] missing empty state / fake data  [ ] technical error text shown  [ ] wrong back navigation
[ ] other: …

**Notes / suspected cause** (optional; code pointer if obvious from the inventory — do not guess)
```

### Severity definitions

| Severity | Meaning | Examples |
|---|---|---|
| **blocker** | App crashes, white-screens, loops, or a core flow cannot be completed; data loss; money/privacy risk. | Crash on launch or on opening a tab; cannot log in; Save does nothing and loses input; a screen shows another user's data. |
| **major** | A feature is broken or badly degraded but the app keeps working and there is a workaround. | Button does nothing; wrong back destination strands the user; keyboard covers the Save button with no way to scroll; wrong pet shown. |
| **minor** | Works, but incorrect or confusing in a way users will notice. | Text clipped in ES but readable by tapping; wrong empty-state wording; inconsistent date format; small tap target. |
| **cosmetic** | Visual polish only, no functional or comprehension impact. | 2 px misalignment; icon off-centre; slightly wrong spacing; a colour not from the brand palette. |

If unsure between two levels, pick the higher and say why in Notes.
