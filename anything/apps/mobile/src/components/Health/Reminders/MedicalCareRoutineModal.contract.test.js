import {
  MED_CADENCE_OPTIONS,
  defaultItemFor,
} from "./MedicalCareRoutineModal";
import { scheduleFromItem } from "./ScheduleBlock";
import { generateRemindersFromRoutine } from "@/utils/reminderGenerator";
import { resolveReminderTiming } from "@/utils/notifications";
import {
  ROUTINE_TYPES,
  ROUTINE_FREQUENCY,
  MEDICAL_CARE_SUBTYPES,
} from "@/data/routinesData";

// MedicalCare adopts the shared ScheduleBlock for the DOSE-COURSE subtypes
// (medication / supplement) only. These tests pin the same contract the wellness
// and photo modals pin, adapted to the verbatim-JSONB persistence of
// medicalCareItems: (a) the canonical ScheduleBlock fields round-trip through an
// item and drive the generator on the right days/times, (b) Once is never offered
// for these subtypes (the dose-course branch has no Once handling), and (c) the
// notification layer resolves the dose-course lead-time but not vaccine/preventive.

const NOW = new Date(2026, 5, 10, 8, 0, 0); // Wed 2026-06-10 08:00 local
const TODAY = "2026-06-10";
const TODAY_DOW = (NOW.getDay() + 6) % 7; // Wed → 2

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
});

afterEach(() => {
  jest.useRealTimers();
});

const monday0 = (iso) => (new Date(iso).getDay() + 6) % 7;
const hhmm = (iso) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes(),
  ).padStart(2, "0")}`;
};

// One medical-care routine carrying a single verbatim item (items persist as-is
// into medicalCareItems — the item shape IS the save shape).
function medicalRoutine(item) {
  return {
    id: "100",
    petId: "42",
    isActive: true,
    notificationEnabled: true,
    type: ROUTINE_TYPES.MEDICAL_CARE,
    createdAt: "2026-01-01T00:00:00.000Z",
    medicalCareItems: [item],
  };
}

describe("cadence options exclude Once for dose-course subtypes", () => {
  it("MED_CADENCE_OPTIONS is the full list minus Once", () => {
    expect(MED_CADENCE_OPTIONS).not.toContain(ROUTINE_FREQUENCY.ONCE);
    expect(MED_CADENCE_OPTIONS).toEqual(
      expect.arrayContaining([
        ROUTINE_FREQUENCY.HOURLY,
        ROUTINE_FREQUENCY.DAILY,
        ROUTINE_FREQUENCY.WEEKLY,
        ROUTINE_FREQUENCY.BIWEEKLY,
        ROUTINE_FREQUENCY.MONTHLY,
        ROUTINE_FREQUENCY.CUSTOM,
      ]),
    );
  });
});

describe("defaultItemFor seeds canonical schedule fields for dose-course only", () => {
  it("medication seeds daily/today/on-time + empty day chips + interval", () => {
    const med = defaultItemFor(MEDICAL_CARE_SUBTYPES.MEDICATION);
    expect(med.frequency).toBe(ROUTINE_FREQUENCY.DAILY);
    expect(med.startDate).toBe(TODAY);
    expect(med.reminderTiming).toBe("on_time");
    expect(med.days).toEqual([]);
    expect(med.intervalHours).toBe(4);
  });

  it("supplement seeds the same canonical defaults", () => {
    const sup = defaultItemFor(MEDICAL_CARE_SUBTYPES.SUPPLEMENT);
    expect(sup.frequency).toBe(ROUTINE_FREQUENCY.DAILY);
    expect(sup.reminderTiming).toBe("on_time");
    expect(sup.intervalHours).toBe(4);
  });

  it("vaccine keeps the legacy '1w' lead and no ScheduleBlock fields", () => {
    const vac = defaultItemFor(MEDICAL_CARE_SUBTYPES.VACCINE);
    expect(vac.reminderTiming).toBe("1w");
    expect(vac.intervalHours).toBeUndefined();
  });
});

describe("canonical fields round-trip through an item and drive the generator", () => {
  it("scheduleFromItem preserves a medication item's canonical fields", () => {
    const item = {
      id: "med1",
      type: "medication",
      frequency: ROUTINE_FREQUENCY.BIWEEKLY,
      startDate: TODAY,
      days: [2, 4],
      intervalHours: 8,
      reminderTiming: "1h",
    };
    const sched = scheduleFromItem(item);
    expect(sched.frequency).toBe(ROUTINE_FREQUENCY.BIWEEKLY);
    expect(sched.startDate).toBe(TODAY);
    expect(sched.days).toEqual([2, 4]);
    expect(sched.intervalHours).toBe(8);
    expect(sched.reminderTiming).toBe("1h");
  });

  it("Medication, every 2 weeks on Wed+Fri, two dose times → right days/times", () => {
    const item = {
      id: "med1",
      type: "medication",
      name: "Apoquel",
      times: ["09:00", "21:00"],
      frequency: ROUTINE_FREQUENCY.BIWEEKLY,
      startDate: TODAY, // Wed → startDate week is "on"
      days: [2, 4], // Wed, Fri
      reminderTiming: "1h",
      reminderEnabled: true,
    };
    const routine = medicalRoutine(item);
    const reminders = generateRemindersFromRoutine(routine, 14);

    expect(reminders.every((r) => r.type === "medical_care")).toBe(true);
    // Only Wed/Fri in on-weeks: 06-10, 06-12 (week 06-08) and 06-24 (week 06-22).
    expect(reminders.every((r) => [2, 4].includes(monday0(r.scheduledAt)))).toBe(
      true,
    );
    const times = new Set(reminders.map((r) => hhmm(r.scheduledAt)));
    expect(times).toEqual(new Set(["09:00", "21:00"]));

    // The 1h early reminder is a notification lead-time, not an instance shift.
    expect(resolveReminderTiming(reminders[0], routine)).toBe("1h");
  });

  it("Medication, Hourly interval 8h from 08:00 → 08:00/16:00/00:00 series", () => {
    const item = {
      id: "med1",
      type: "medication",
      name: "Apoquel",
      frequency: ROUTINE_FREQUENCY.HOURLY,
      startDate: TODAY,
      intervalHours: 8,
      // The single start-time field writes preferredTime (the hourly anchor).
      preferredTime: "08:00",
      times: ["08:00"],
      reminderEnabled: true,
    };
    const reminders = generateRemindersFromRoutine(medicalRoutine(item), 1);
    const hours = reminders.map((r) => new Date(r.scheduledAt).getHours());
    expect(hours).toEqual(expect.arrayContaining([8, 16, 0]));
    expect(new Set(reminders.map((r) => r.id)).size).toBe(reminders.length);
  });

  it("Supplement with a custom-time cadence round-trips and fires on its days", () => {
    const item = {
      id: "sup1",
      type: "supplement",
      name: "Omega-3",
      dose: "1 chew",
      timingMode: "time",
      linkedMeal: "breakfast",
      times: ["07:30"],
      frequency: ROUTINE_FREQUENCY.CUSTOM,
      startDate: TODAY,
      days: [0, 2, 4], // Mon, Wed, Fri
      intervalHours: 4,
      reminderTiming: "on_time",
      reminderEnabled: true,
      timeSensitive: false,
    };

    // Round-trip: the canonical fields survive load via scheduleFromItem.
    const sched = scheduleFromItem(item);
    expect(sched.frequency).toBe(ROUTINE_FREQUENCY.CUSTOM);
    expect(sched.days).toEqual([0, 2, 4]);
    expect(sched.startDate).toBe(TODAY);

    const reminders = generateRemindersFromRoutine(medicalRoutine(item), 7);
    expect(reminders.length).toBeGreaterThanOrEqual(3);
    expect(reminders.every((r) => [0, 2, 4].includes(monday0(r.scheduledAt)))).toBe(
      true,
    );
    expect(reminders.every((r) => hhmm(r.scheduledAt) === "07:30")).toBe(true);
  });
});

describe("notification lead-time resolves for dose-course, not vaccine/preventive", () => {
  it("returns the medication item's reminderTiming", () => {
    const item = {
      id: "med1",
      type: "medication",
      frequency: ROUTINE_FREQUENCY.DAILY,
      startDate: TODAY,
      times: ["09:00"],
      reminderTiming: "30m",
      reminderEnabled: true,
    };
    const routine = medicalRoutine(item);
    const reminder = generateRemindersFromRoutine(routine, 2)[0];
    expect(resolveReminderTiming(reminder, routine)).toBe("30m");
  });

  it("returns null for a vaccine item (it owns its own due-offset)", () => {
    const reminder = { type: ROUTINE_TYPES.MEDICAL_CARE, medicalCareItemId: "vac1" };
    const routine = medicalRoutine({
      id: "vac1",
      type: "vaccine",
      reminderTiming: "1w",
      nextDue: "2026-07-01",
    });
    expect(resolveReminderTiming(reminder, routine)).toBeNull();
  });
});
