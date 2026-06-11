# Reminder Cadence Support Matrix

Status of every cadence on every cadence-driven routine type in the mobile
reminder generator (`anything/apps/mobile/src/utils/reminderGenerator.js`), after
the P1b generator-cadence track. The redesign's goal: the shared `ScheduleBlock`
can offer **any cadence on any routine type** and it will actually fire — the UI
must never expose a schedule that silently won't generate.

Legend: ✅ generated · ⊘ N/A (cadence is meaningless for this type, justified
below) · `—` no overdue path for this type (transient/today-only by design).

## Forward (`generateRemindersFromRoutine`)

| Path | Hourly | Daily | Weekly | Biweekly | Monthly | 3-Mo | 6-Mo | Yearly | Once | wkday/wkend/custom |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| wellness (`WELLNESS_CHECK`) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| photo (`PHOTO_CHECK`) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| feeding (`FEEDING`) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| walk (`WALK`) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| medical-care (`MEDICAL_CARE`) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| vet-appointment (`VET_APPOINTMENT`) | ⊘ | ⊘ | ⊘ | ⊘ | ⊘ | ⊘ | ⊘ | ⊘ | ✅ | ⊘ |

## Overdue (`generateOverdueInstances`)

| Path | Hourly | Daily | Weekly | Biweekly | Monthly | 3-Mo | 6-Mo | Yearly | Once | wkday/wkend/custom |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| wellness | ✅* | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| photo | ✅* | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| feeding | — | — | — | — | — | — | — | — | — | — |
| walk | — | — | — | — | — | — | — | — | — | — |
| medical-care | ✅* | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| vet-appointment | — | — | — | — | — | — | — | — | — | — |

\* Hourly overdue is capped to **today only** (never the lookback window): a dose
missed earlier today is actionable; one missed weeks ago would flood the list.

## N/A justifications (⊘ and —)

- **vet-appointment — all recurring + hourly (⊘).** A vet appointment is a single
  dated event (`routine.date` + `routine.times[0]`); only ONCE is meaningful. The
  dev-time guard (`CADENCE_SUPPORT`/`assertCadenceHonored`) throws in `__DEV__` if
  a vet appointment is ever given a recurring/hourly cadence, so the UI can't ship
  one that silently never fires.
- **feeding / walk — overdue (—).** These are transient, today-only reminder types
  and are intentionally not enumerated as persistent overdue instances (only
  wellness, medical-care, and photo carry overdue across days/restarts). Forward
  generation honors every cadence.

## Invariants held across all paths

- **Instance ids byte-for-byte** for every non-hourly cadence (the durable
  `reminder_dismissals.instance_key`); the back-compat (absent-frequency) paths
  reproduce their legacy ids exactly. **Hourly** keeps its `_HHMM` suffix — the
  only cadence with same-day siblings.
- **Overdue clamps** to `max(windowStart, routine.createdAt, item.startDate)`;
  hourly overdue additionally caps to today.
- **Timezone-robust**: recurring occurrences anchor on local-parsed dates; the
  generator suites pass under UTC, UTC+5:30, and UTC-8.
- Dates are never derived from ids (the UTC-in-id latent bug stays backlogged).

## Out of scope

The legacy single-purpose routine types — `MEDICATION`, `GENERAL_CHECK`,
`WEIGHT_CHECK`, `PREVENTIVE`, `VACCINE` — keep their existing narrower handling
and are **not** exposed by the redesigned `ScheduleBlock`, so they are absent from
`CADENCE_SUPPORT` and left unchecked by the guard. Medication/vaccine/preventive
needs are served through the `MEDICAL_CARE` path.
