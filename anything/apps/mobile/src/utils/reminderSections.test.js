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
  { now = NOW, index = buildResolutionIndex({}), dismissedKeys = new Set() } = {},
) {
  const overdue = selectOverdueReminders({ reminders, index, dismissedKeys, now });
  const overdueIds = new Set(overdue.map((r) => r.id));
  const { dueSoon, nextUp } = sectionTodayReminders({
    reminders,
    overdueIds,
    now,
  });
  return { overdue, dueSoon, nextUp };
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

  it("an instance snoozed past now is hidden from Due Soon/Next Up", () => {
    const snoozed = feeding({
      scheduledAt: atOffsetMin(10),
      snoozedUntil: atOffsetMin(45),
    });
    const { dueSoon, nextUp } = sectionTodayReminders({
      reminders: [snoozed],
      now: NOW,
    });
    expect(dueSoon).toEqual([]);
    expect(nextUp).toEqual([]);
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
