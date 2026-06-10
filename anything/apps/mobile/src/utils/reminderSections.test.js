import {
  sectionTodayReminders,
  DUE_SOON_WINDOW_MS,
  NEXT_UP_WINDOW_MS,
} from "./reminderSections";
import {
  isPastDue,
  selectOverdueReminders,
  buildResolutionIndex,
} from "./reminderResolution";
import { toDateStr } from "./wellnessLog";

// Pure tests for the Today-section classification: ONE boundary (isPastDue) puts
// every instance in EXACTLY ONE section. `classify` mirrors what HealthToday does
// at render: Overdue from the resolution layer, Due Soon / Next Up from the
// sectioner with the Overdue ids excluded — all against one injected clock, so
// "advance the clock and recompute" is exactly what both the per-minute tick and
// pull-to-refresh (refreshNow) do.

const NOW = new Date(2026, 5, 10, 12, 0, 0); // local noon keeps toDateStr stable
const atOffsetMin = (min) =>
  new Date(NOW.getTime() + min * 60 * 1000).toISOString();

const wellness = (overrides = {}) => ({
  id: "w1",
  type: "wellness_check",
  checkType: "body_condition",
  routineId: 100,
  wellnessCheckItemIndex: 0,
  petId: "42",
  timeSensitive: true,
  status: "upcoming",
  scheduledAt: atOffsetMin(30),
  nextTriggerAt: atOffsetMin(30),
  snoozedUntil: null,
  ...overrides,
});

const feeding = (overrides = {}) => ({
  id: "f1",
  type: "feeding",
  petId: "42",
  timeSensitive: true,
  status: "upcoming",
  scheduledAt: atOffsetMin(30),
  nextTriggerAt: atOffsetMin(30),
  snoozedUntil: null,
  ...overrides,
});

function classify(
  reminders,
  {
    now = NOW,
    index = buildResolutionIndex({}),
    dismissedKeys = new Set(),
    snoozes = {},
  } = {},
) {
  const overdue = selectOverdueReminders({
    reminders,
    index,
    dismissedKeys,
    now,
    snoozes,
  });
  const overdueIds = new Set(overdue.map((r) => r.id));
  const { dueSoon, nextUp, snoozed } = sectionTodayReminders({
    reminders,
    overdueIds,
    now,
    snoozes,
    dismissedKeys,
  });
  return { overdue, dueSoon, nextUp, snoozed };
}

const ids = (list) => list.map((r) => r.id);

describe("isPastDue — the single classification boundary", () => {
  it("scheduledAt before now is past due", () => {
    expect(isPastDue({ scheduledAt: atOffsetMin(-1) }, NOW)).toBe(true);
  });

  it("scheduledAt exactly at now is past due (boundary is <=)", () => {
    expect(isPastDue({ scheduledAt: atOffsetMin(0) }, NOW)).toBe(true);
  });

  it("scheduledAt after now is upcoming", () => {
    expect(isPastDue({ scheduledAt: atOffsetMin(1) }, NOW)).toBe(false);
  });

  it("an unparseable time is never past due", () => {
    expect(isPastDue({ scheduledAt: "nonsense" }, NOW)).toBe(false);
  });
});

describe("exactly one section per instance", () => {
  it("a persistent instance just BEFORE now is Overdue only", () => {
    const r = wellness({ scheduledAt: atOffsetMin(-1) });
    const { overdue, dueSoon, nextUp } = classify([r]);
    expect(ids(overdue)).toEqual(["w1"]);
    expect(dueSoon).toEqual([]);
    expect(nextUp).toEqual([]);
  });

  it("a persistent instance just AFTER now is Due Soon only", () => {
    const r = wellness({ scheduledAt: atOffsetMin(1) });
    const { overdue, dueSoon, nextUp } = classify([r]);
    expect(overdue).toEqual([]);
    expect(ids(dueSoon)).toEqual(["w1"]);
    expect(nextUp).toEqual([]);
  });

  it("a persistent instance exactly AT now lands on the Overdue side", () => {
    const r = wellness({ scheduledAt: atOffsetMin(0) });
    const { overdue, dueSoon, nextUp } = classify([r]);
    expect(ids(overdue)).toEqual(["w1"]);
    expect(dueSoon).toEqual([]);
    expect(nextUp).toEqual([]);
  });

  it("a time-sensitive future instance is in Due Soon, never duplicated in Next Up", () => {
    const r = wellness({ scheduledAt: atOffsetMin(30) });
    const { dueSoon, nextUp } = classify([r]);
    expect(ids(dueSoon)).toEqual(["w1"]);
    expect(nextUp).toEqual([]);
  });

  it("a past-due vet appointment is Overdue only, never Due Soon", () => {
    const vet = wellness({
      id: "vet_apt_7",
      type: "vet_appointment",
      scheduledAt: atOffsetMin(-20),
    });
    const { overdue, dueSoon, nextUp } = classify([vet]);
    expect(ids(overdue)).toEqual(["vet_apt_7"]);
    expect(dueSoon).toEqual([]);
    expect(nextUp).toEqual([]);
  });
});

describe("advancing the clock reclassifies (per-minute tick / pull-to-refresh)", () => {
  it("Due Soon → Overdue when now passes the scheduled time", () => {
    const r = wellness({ scheduledAt: atOffsetMin(2) });

    const before = classify([r], { now: NOW });
    expect(ids(before.dueSoon)).toEqual(["w1"]);
    expect(before.overdue).toEqual([]);

    const after = classify([r], {
      now: new Date(NOW.getTime() + 3 * 60 * 1000),
    });
    expect(ids(after.overdue)).toEqual(["w1"]);
    expect(after.dueSoon).toEqual([]);
  });

  it("refresh semantics: recomputing the SAME data with a fresh clock moves a passed item out of Due Soon", () => {
    // Pull-to-refresh does not change the reminder set (the store dedupes by id
    // and keeps stale past instances); reclassification comes purely from the
    // advanced `now`. So a past-due item must reclassify from data alone.
    const r = wellness({ scheduledAt: atOffsetMin(2) });
    const refreshed = classify([r], {
      now: new Date(NOW.getTime() + 10 * 60 * 1000),
    });
    expect(ids(refreshed.overdue)).toEqual(["w1"]);
    expect(refreshed.dueSoon).toEqual([]);
    expect(refreshed.nextUp).toEqual([]);
  });
});

describe("resolved / dismissed instances are excluded from EVERY section", () => {
  const past = wellness({ scheduledAt: atOffsetMin(-60) });

  it("a resolved past instance is in neither Overdue nor Due Soon/Next Up", () => {
    const index = buildResolutionIndex({
      wellnessLogs: [
        {
          routine_id: 100,
          wellness_check_item_index: 0,
          values_json: { scheduledDate: toDateStr(past.scheduledAt) },
        },
      ],
    });
    const { overdue, dueSoon, nextUp } = classify([past], { index });
    expect(overdue).toEqual([]);
    expect(dueSoon).toEqual([]);
    expect(nextUp).toEqual([]);
  });

  it("a dismissed past instance is in neither Overdue nor Due Soon/Next Up", () => {
    const { overdue, dueSoon, nextUp } = classify([past], {
      dismissedKeys: new Set(["w1"]),
    });
    expect(overdue).toEqual([]);
    expect(dueSoon).toEqual([]);
    expect(nextUp).toEqual([]);
  });
});

describe("future windows", () => {
  it("a non-time-sensitive instance within 6 hours goes to Next Up", () => {
    const r = wellness({ timeSensitive: false, scheduledAt: atOffsetMin(120) });
    const { dueSoon, nextUp } = classify([r]);
    expect(dueSoon).toEqual([]);
    expect(ids(nextUp)).toEqual(["w1"]);
  });

  it("a time-sensitive instance beyond the Due Soon window but within 6h goes to Next Up", () => {
    const r = wellness({
      scheduledAt: atOffsetMin(DUE_SOON_WINDOW_MS / 60000 + 30),
    });
    const { dueSoon, nextUp } = classify([r]);
    expect(dueSoon).toEqual([]);
    expect(ids(nextUp)).toEqual(["w1"]);
  });

  it("an instance beyond the Next Up window is in no section", () => {
    const r = wellness({
      timeSensitive: false,
      scheduledAt: atOffsetMin(NEXT_UP_WINDOW_MS / 60000 + 30),
    });
    const { dueSoon, nextUp } = classify([r]);
    expect(dueSoon).toEqual([]);
    expect(nextUp).toEqual([]);
  });

  it("Due Soon and Next Up sort soonest-first", () => {
    const later = wellness({ id: "later", scheduledAt: atOffsetMin(50) });
    const sooner = wellness({ id: "sooner", scheduledAt: atOffsetMin(10) });
    const nuLater = wellness({
      id: "nu-later",
      timeSensitive: false,
      scheduledAt: atOffsetMin(300),
    });
    const nuSooner = wellness({
      id: "nu-sooner",
      timeSensitive: false,
      scheduledAt: atOffsetMin(120),
    });
    const { dueSoon, nextUp } = classify([later, nuLater, sooner, nuSooner]);
    expect(ids(dueSoon)).toEqual(["sooner", "later"]);
    expect(ids(nextUp)).toEqual(["nu-sooner", "nu-later"]);
  });
});

describe("completed / disabled / snoozed", () => {
  it("completed and disabled instances appear in no section", () => {
    const done = wellness({ id: "done", status: "completed" });
    const off = wellness({ id: "off", status: "disabled" });
    const { overdue, dueSoon, nextUp } = classify([done, off]);
    expect(overdue).toEqual([]);
    expect(dueSoon).toEqual([]);
    expect(nextUp).toEqual([]);
  });

  it("an instance snoozed past now leaves Due Soon/Next Up for the Snoozed section", () => {
    const snoozed = feeding({
      scheduledAt: atOffsetMin(10),
      snoozedUntil: atOffsetMin(45),
    });
    const result = sectionTodayReminders({
      reminders: [snoozed],
      now: NOW,
    });
    expect(result.dueSoon).toEqual([]);
    expect(result.nextUp).toEqual([]);
    expect(ids(result.snoozed)).toEqual(["f1"]);
  });
});

describe("snooze lifecycle — exactly one section at every step", () => {
  // The snooze map (store: id → snoozedUntil ISO) is the canonical source; the
  // per-reminder snoozedUntil field is a fallback. Vet reminders only ever have
  // the map entry (they don't live in the reminders store).

  it("snoozing a future Due Soon instance moves it to Snoozed only", () => {
    const r = wellness({ scheduledAt: atOffsetMin(30) });
    const { overdue, dueSoon, nextUp, snoozed } = classify([r], {
      snoozes: { w1: atOffsetMin(90) },
    });
    expect(ids(snoozed)).toEqual(["w1"]);
    expect(overdue).toEqual([]);
    expect(dueSoon).toEqual([]);
    expect(nextUp).toEqual([]);
  });

  it("a map-only snooze works for instances outside the store (vet appointments)", () => {
    const vet = wellness({
      id: "vet_apt_7",
      type: "vet_appointment",
      scheduledAt: atOffsetMin(20),
      snoozedUntil: null, // never set on the query-derived object
    });
    const { snoozed, dueSoon } = classify([vet], {
      snoozes: { vet_apt_7: atOffsetMin(60) },
    });
    expect(ids(snoozed)).toEqual(["vet_apt_7"]);
    expect(dueSoon).toEqual([]);
    // The emitted card carries the map's snoozedUntil so the UI can show it.
    expect(snoozed[0].snoozedUntil).toBe(atOffsetMin(60));
  });

  it("INVARIANT: a snoozed instance whose scheduled time passes mid-snooze stays in Snoozed, never Overdue", () => {
    const r = wellness({ scheduledAt: atOffsetMin(10) });
    const snoozes = { w1: atOffsetMin(60) };
    // 20 min later: scheduled time passed, snooze still active.
    const mid = classify([r], {
      now: new Date(NOW.getTime() + 20 * 60 * 1000),
      snoozes,
    });
    expect(ids(mid.snoozed)).toEqual(["w1"]);
    expect(mid.overdue).toEqual([]);
    expect(mid.dueSoon).toEqual([]);
    expect(mid.nextUp).toEqual([]);
  });

  it("snooze elapses with scheduled time passed → returns to Overdue only (persistent)", () => {
    const r = wellness({ scheduledAt: atOffsetMin(10) });
    const snoozes = { w1: atOffsetMin(60) };
    const after = classify([r], {
      now: new Date(NOW.getTime() + 61 * 60 * 1000),
      snoozes,
    });
    expect(ids(after.overdue)).toEqual(["w1"]);
    expect(after.snoozed).toEqual([]);
    expect(after.dueSoon).toEqual([]);
  });

  it("snooze elapses with scheduled time still in the future → returns to Due Soon", () => {
    const r = wellness({ scheduledAt: atOffsetMin(90) });
    const snoozes = { w1: atOffsetMin(45) };
    const after = classify([r], {
      now: new Date(NOW.getTime() + 50 * 60 * 1000),
      snoozes,
    });
    expect(ids(after.dueSoon)).toEqual(["w1"]);
    expect(after.snoozed).toEqual([]);
    expect(after.overdue).toEqual([]);
  });

  it("snooze elapses on a past-due transient (feeding) → returns to its Due Soon countdown home", () => {
    const r = feeding({ scheduledAt: atOffsetMin(10) });
    const snoozes = { f1: atOffsetMin(30) };
    const after = classify([r], {
      now: new Date(NOW.getTime() + 40 * 60 * 1000),
      snoozes,
    });
    expect(ids(after.dueSoon)).toEqual(["f1"]);
    expect(after.snoozed).toEqual([]);
  });

  it("logging during the snooze (resolved in DB) removes it from every section once the snooze ends", () => {
    const r = wellness({ scheduledAt: atOffsetMin(10) });
    const index = buildResolutionIndex({
      wellnessLogs: [
        {
          routine_id: 100,
          wellness_check_item_index: 0,
          values_json: { scheduledDate: toDateStr(r.scheduledAt) },
        },
      ],
    });
    const after = classify([r], {
      now: new Date(NOW.getTime() + 61 * 60 * 1000),
      snoozes: { w1: atOffsetMin(60) },
      index,
    });
    expect(after.overdue).toEqual([]);
    expect(after.snoozed).toEqual([]);
    expect(after.dueSoon).toEqual([]);
    expect(after.nextUp).toEqual([]);
  });

  it("a completed store instance never shows in Snoozed even with a live snooze entry", () => {
    const r = wellness({ status: "completed" });
    const { snoozed } = classify([r], { snoozes: { w1: atOffsetMin(60) } });
    expect(snoozed).toEqual([]);
  });

  it("skipping (dismissing) while snoozed removes it from every section, now and after the snooze", () => {
    const r = wellness({ scheduledAt: atOffsetMin(10) });
    const dismissedKeys = new Set(["w1"]);
    const snoozes = { w1: atOffsetMin(60) };

    const during = classify([r], { snoozes, dismissedKeys });
    expect(during.snoozed).toEqual([]);
    expect(during.overdue).toEqual([]);

    const after = classify([r], {
      now: new Date(NOW.getTime() + 90 * 60 * 1000),
      snoozes,
      dismissedKeys,
    });
    expect(after.overdue).toEqual([]);
    expect(after.dueSoon).toEqual([]);
    expect(after.snoozed).toEqual([]);
  });

  it("a dismissed transient (feeding) is excluded from Due Soon too — uniform 'dismissed means gone'", () => {
    const r = feeding({ scheduledAt: atOffsetMin(-30) });
    const { dueSoon, snoozed } = classify([r], {
      dismissedKeys: new Set(["f1"]),
    });
    expect(dueSoon).toEqual([]);
    expect(snoozed).toEqual([]);
  });

  it("Snoozed sorts soonest-to-return first", () => {
    const a = wellness({ id: "a", scheduledAt: atOffsetMin(10) });
    const b = wellness({ id: "b", scheduledAt: atOffsetMin(20) });
    const { snoozed } = classify([a, b], {
      snoozes: { a: atOffsetMin(120), b: atOffsetMin(60) },
    });
    expect(ids(snoozed)).toEqual(["b", "a"]);
  });
});

describe("transient types (feeding/walk) — interim behavior until the today-only Overdue PR", () => {
  it("a past-due feeding keeps its Due Soon countdown home (it has no Overdue home yet)", () => {
    const r = feeding({ scheduledAt: atOffsetMin(-30) });
    const { overdue, dueSoon } = classify([r]);
    expect(overdue).toEqual([]); // transient: not enumerated by the Overdue layer
    expect(ids(dueSoon)).toEqual(["f1"]);
  });

  it("a future feeding within the window is Due Soon like any other type", () => {
    const r = feeding({ scheduledAt: atOffsetMin(30) });
    const { dueSoon, nextUp } = classify([r]);
    expect(ids(dueSoon)).toEqual(["f1"]);
    expect(nextUp).toEqual([]);
  });
});
