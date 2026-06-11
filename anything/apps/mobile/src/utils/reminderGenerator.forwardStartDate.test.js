import { generateRemindersFromRoutine } from "./reminderGenerator";
import { ROUTINE_TYPES, ROUTINE_FREQUENCY } from "../data/routinesData";

// Forward twin of the #61 overdue clamp: the FORWARD generators must not emit an
// occurrence before the schedule/item startDate. First occurrence = max(now,
// startDate). Covers photo + wellness, daily / weekly / weekday cadences. The
// ONCE / month-multiple cadences already anchor on startDate (separate suites)
// and the hourly paths already floor via getScheduleAnchor — untouched here.
//
// Time is pinned (jest globalSetup pins Europe/Rome) so day-of-week math and the
// local-day startDate parse are deterministic.

const NOW = new Date(2026, 5, 10, 8, 0, 0); // Wed 2026-06-10 08:00 local

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
});

afterEach(() => {
  jest.useRealTimers();
});

function makeRoutine(overrides) {
  return {
    id: "100",
    petId: "42",
    isActive: true,
    notificationEnabled: true,
    times: [],
    days: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const photoRoutine = (schedule) =>
  makeRoutine({ type: ROUTINE_TYPES.PHOTO_CHECK, photoCheckSchedule: [schedule] });
const wellnessRoutine = (item) =>
  makeRoutine({ type: ROUTINE_TYPES.WELLNESS_CHECK, wellnessCheckItems: [item] });

const idDate = (y, m, d) => new Date(y, m - 1, d).toISOString().split("T")[0];
const at = (y, m, d, hh, mm) => new Date(y, m - 1, d, hh, mm, 0).toISOString();
const onDay = (rs, y, m, d) =>
  rs.filter((r) => r.scheduledAt.startsWith(idDate(y, m, d)));

// ── (a) Daily, startDate = tomorrow ⇒ no occurrence today; first = tomorrow ──
describe("daily, startDate tomorrow — no pre-start (today) occurrence", () => {
  it("photo check (date-only startDate): first occurrence is tomorrow, none today", () => {
    const reminders = generateRemindersFromRoutine(
      photoRoutine({
        bodyArea: "paws",
        frequency: ROUTINE_FREQUENCY.DAILY,
        preferredTime: "21:32",
        startDate: "2026-06-11", // tomorrow, date-only
      }),
      3, // 06-10..06-13
    );

    expect(onDay(reminders, 2026, 6, 10)).toHaveLength(0); // none TODAY
    expect(reminders[0].scheduledAt).toBe(at(2026, 6, 11, 21, 32));
    expect(reminders[0].id).toBe(`reminder_100_paws_${idDate(2026, 6, 11)}`);
  });

  it("photo check (datetime startDate, device repro 21:32): none today, first tomorrow 21:32", () => {
    const reminders = generateRemindersFromRoutine(
      photoRoutine({
        bodyArea: "paws",
        frequency: ROUTINE_FREQUENCY.DAILY,
        preferredTime: "21:32",
        startDate: new Date(2026, 5, 11, 21, 32, 0).toISOString(),
      }),
      3,
    );

    expect(onDay(reminders, 2026, 6, 10)).toHaveLength(0);
    expect(reminders[0].scheduledAt).toBe(at(2026, 6, 11, 21, 32));
  });

  it("wellness check: first occurrence is tomorrow, none today", () => {
    const reminders = generateRemindersFromRoutine(
      wellnessRoutine({
        checkType: "general",
        frequency: ROUTINE_FREQUENCY.DAILY,
        preferredTime: "21:32",
        startDate: "2026-06-11",
      }),
      3,
    );

    expect(onDay(reminders, 2026, 6, 10)).toHaveLength(0);
    expect(reminders[0].scheduledAt).toBe(at(2026, 6, 11, 21, 32));
    expect(reminders[0].id).toBe(`reminder_100_general_0_${idDate(2026, 6, 11)}`);
  });
});

// ── (b) Weekly / weekday cadence whose matching weekday precedes startDate ──
describe("weekly/weekday cadence — pre-startDate matching day is not emitted", () => {
  it("photo weekly(Wed): today's Wed (06-10) precedes a 06-15 startDate, first emitted is 06-17", () => {
    const reminders = generateRemindersFromRoutine(
      photoRoutine({
        bodyArea: "paws",
        frequency: ROUTINE_FREQUENCY.WEEKLY,
        preferredDay: 2, // Wednesday
        preferredTime: "10:00",
        startDate: "2026-06-15", // Monday after today's Wed
      }),
      21, // 06-10..07-01
    );

    expect(onDay(reminders, 2026, 6, 10)).toHaveLength(0); // pre-start Wed dropped
    expect(reminders[0].scheduledAt).toBe(at(2026, 6, 17, 10, 0)); // first on/after start
  });

  it("photo WEEKDAYS: Wed/Thu before a Fri 06-12 startDate dropped, first is Fri 06-12", () => {
    const reminders = generateRemindersFromRoutine(
      photoRoutine({
        bodyArea: "paws",
        frequency: ROUTINE_FREQUENCY.WEEKDAYS,
        preferredTime: "10:00",
        startDate: "2026-06-12", // Friday
      }),
      7,
    );

    expect(onDay(reminders, 2026, 6, 10)).toHaveLength(0);
    expect(onDay(reminders, 2026, 6, 11)).toHaveLength(0);
    expect(reminders[0].scheduledAt).toBe(at(2026, 6, 12, 10, 0));
  });

  it("wellness weekly(Wed): pre-start Wed dropped, first emitted is 06-17", () => {
    const reminders = generateRemindersFromRoutine(
      wellnessRoutine({
        checkType: "general",
        frequency: ROUTINE_FREQUENCY.WEEKLY,
        preferredDay: 2,
        preferredTime: "10:00",
        startDate: "2026-06-15",
      }),
      21,
    );

    expect(onDay(reminders, 2026, 6, 10)).toHaveLength(0);
    expect(reminders[0].scheduledAt).toBe(at(2026, 6, 17, 10, 0));
  });
});

// ── (c) No startDate / past startDate ⇒ byte-for-byte as before (pinned) ──
describe("back-compat — no startDate / past startDate unchanged", () => {
  const PHOTO_IDS = [
    `reminder_100_paws_${idDate(2026, 6, 10)}`,
    `reminder_100_paws_${idDate(2026, 6, 11)}`,
    `reminder_100_paws_${idDate(2026, 6, 12)}`,
  ];
  const PHOTO_TIMES = [
    at(2026, 6, 10, 10, 0),
    at(2026, 6, 11, 10, 0),
    at(2026, 6, 12, 10, 0),
  ];
  const WELLNESS_IDS = [
    `reminder_100_general_0_${idDate(2026, 6, 10)}`,
    `reminder_100_general_0_${idDate(2026, 6, 11)}`,
    `reminder_100_general_0_${idDate(2026, 6, 12)}`,
  ];

  it("photo daily, NO startDate — pinned ids/scheduledAt (today included)", () => {
    const reminders = generateRemindersFromRoutine(
      photoRoutine({
        bodyArea: "paws",
        frequency: ROUTINE_FREQUENCY.DAILY,
        preferredTime: "10:00",
      }),
      2, // 06-10..06-12
    );
    expect(reminders.map((r) => r.id)).toEqual(PHOTO_IDS);
    expect(reminders.map((r) => r.scheduledAt)).toEqual(PHOTO_TIMES);
  });

  it("photo daily, PAST startDate — identical to the no-startDate output", () => {
    const reminders = generateRemindersFromRoutine(
      photoRoutine({
        bodyArea: "paws",
        frequency: ROUTINE_FREQUENCY.DAILY,
        preferredTime: "10:00",
        startDate: "2026-06-01", // in the past → floor stays at now
      }),
      2,
    );
    expect(reminders.map((r) => r.id)).toEqual(PHOTO_IDS);
    expect(reminders.map((r) => r.scheduledAt)).toEqual(PHOTO_TIMES);
  });

  it("wellness daily, NO startDate — pinned ids/scheduledAt (today included)", () => {
    const reminders = generateRemindersFromRoutine(
      wellnessRoutine({
        checkType: "general",
        frequency: ROUTINE_FREQUENCY.DAILY,
        preferredTime: "10:00",
      }),
      2,
    );
    expect(reminders.map((r) => r.id)).toEqual(WELLNESS_IDS);
    expect(reminders.map((r) => r.scheduledAt)).toEqual(PHOTO_TIMES);
  });

  it("wellness daily, PAST startDate — identical to the no-startDate output", () => {
    const reminders = generateRemindersFromRoutine(
      wellnessRoutine({
        checkType: "general",
        frequency: ROUTINE_FREQUENCY.DAILY,
        preferredTime: "10:00",
        startDate: "2026-06-01",
      }),
      2,
    );
    expect(reminders.map((r) => r.id)).toEqual(WELLNESS_IDS);
    expect(reminders.map((r) => r.scheduledAt)).toEqual(PHOTO_TIMES);
  });
});
