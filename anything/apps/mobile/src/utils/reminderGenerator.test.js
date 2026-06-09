import { generateRemindersFromRoutine } from "./reminderGenerator";
import { ROUTINE_TYPES, ROUTINE_FREQUENCY } from "../data/routinesData";

// Phase A — pure-function tests for the routine generators (mobile, Jest).
//
// Contract being pinned: each scheduled item generates its OWN independent
// reminder. Multiple meals/walks/body-areas/medical-care items each produce
// their own reminder(s) — distinct ids, item-specific identity, nothing merged
// or shared. No DB, no store wiring, no network: the generators are pure
// (routine in, reminder list out), so we feed them already-parsed arrays/objects
// (the post-PR-#19 shape — the toArray() shims were removed) and read the output.
//
// Time is pinned so the day-of-week math and the `scheduledAt >= now` filter
// inside the generators are deterministic.

const NOW = new Date("2026-06-10T08:00:00"); // Wednesday, local time

beforeAll(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
});

afterAll(() => {
  jest.useRealTimers();
});

// Fixture realism: petId is a string (the store stringifies pet_id), owner ids
// are integers. isActive + notificationEnabled true so the routine is not gated
// out before dispatch.
function makeRoutine(overrides) {
  return {
    id: "100",
    petId: "42", // = user_profiles.id, stringified by the store
    isActive: true,
    notificationEnabled: true,
    times: [],
    days: [],
    ...overrides,
  };
}

// A date N days from the pinned NOW, as YYYY-MM-DD (matches routines.* date use).
function dateInDays(n) {
  const d = new Date(NOW);
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
}

const allIdsUnique = (reminders) =>
  new Set(reminders.map((r) => r.id)).size === reminders.length;

describe("generateRemindersFromRoutine — feeding", () => {
  it("emits one independent reminder per meal with the meal's own name", () => {
    const routine = makeRoutine({
      type: ROUTINE_TYPES.FEEDING,
      meals: [
        { id: "meal1", name: "Breakfast", time: "07:00", frequency: ROUTINE_FREQUENCY.DAILY },
        { id: "meal2", name: "Dinner", time: "18:00", frequency: ROUTINE_FREQUENCY.DAILY },
      ],
    });

    const reminders = generateRemindersFromRoutine(routine);

    expect(reminders.every((r) => r.type === "feeding")).toBe(true);
    // Both meals are represented, each by its own name — not collapsed.
    expect(new Set(reminders.map((r) => r.title))).toEqual(
      new Set(["Breakfast", "Dinner"]),
    );
    // Each meal carries its own mealId; both appear independently.
    expect(new Set(reminders.map((r) => r.mealId))).toEqual(
      new Set(["meal1", "meal2"]),
    );
    expect(allIdsUnique(reminders)).toBe(true);
  });
});

describe("generateRemindersFromRoutine — walk", () => {
  it("emits one independent reminder per walk with the walk's own name", () => {
    const routine = makeRoutine({
      type: ROUTINE_TYPES.WALK,
      walks: [
        { name: "Morning Walk", time: "07:30", frequency: ROUTINE_FREQUENCY.DAILY },
        { name: "Evening Walk", time: "19:00", frequency: ROUTINE_FREQUENCY.DAILY },
      ],
    });

    const reminders = generateRemindersFromRoutine(routine);

    expect(reminders.every((r) => r.type === "walk")).toBe(true);
    expect(new Set(reminders.map((r) => r.title))).toEqual(
      new Set(["Morning Walk", "Evening Walk"]),
    );
    // Walk identity is carried through to relatedWalk for the start-walk flow.
    expect(new Set(reminders.map((r) => r.relatedWalk.name))).toEqual(
      new Set(["Morning Walk", "Evening Walk"]),
    );
    expect(allIdsUnique(reminders)).toBe(true);
  });
});

describe("generateRemindersFromRoutine — photo check", () => {
  it("emits a separate per-area reminder for each body area (Paws/Eyes/Ears NOT merged)", () => {
    const routine = makeRoutine({
      type: ROUTINE_TYPES.PHOTO_CHECK,
      photoCheckSchedule: [
        { bodyArea: "paws", frequency: ROUTINE_FREQUENCY.WEEKLY, preferredDay: 0, preferredTime: "10:00" },
        { bodyArea: "eyes", frequency: ROUTINE_FREQUENCY.WEEKLY, preferredDay: 1, preferredTime: "10:00" },
        { bodyArea: "ears", frequency: ROUTINE_FREQUENCY.WEEKLY, preferredDay: 2, preferredTime: "10:00" },
      ],
    });

    const reminders = generateRemindersFromRoutine(routine);

    expect(reminders.every((r) => r.type === "photo_check")).toBe(true);
    // Three distinct per-area reminders — one log per area, not a single generic
    // "photo check" that merges the areas.
    expect(new Set(reminders.map((r) => r.relatedBodyArea))).toEqual(
      new Set(["paws", "eyes", "ears"]),
    );
    expect(new Set(reminders.map((r) => r.title))).toEqual(
      new Set(["PAWS Check", "EYES Check", "EARS Check"]),
    );
    expect(allIdsUnique(reminders)).toBe(true);
  });

  it("supports the legacy single bodyArea field", () => {
    const routine = makeRoutine({
      type: ROUTINE_TYPES.PHOTO_CHECK,
      bodyArea: "teeth",
      frequency: ROUTINE_FREQUENCY.WEEKLY,
      preferredDay: 0,
      times: ["10:00"],
    });

    const reminders = generateRemindersFromRoutine(routine);

    expect(reminders.length).toBeGreaterThan(0);
    expect(reminders.every((r) => r.type === "photo_check")).toBe(true);
    expect(reminders.every((r) => r.title === "TEETH Check")).toBe(true);
    expect(reminders.every((r) => r.relatedBodyArea === "teeth")).toBe(true);
  });
});

describe("generateRemindersFromRoutine — medical care", () => {
  // Confirmation test: the generator reads `medicalCareItems` (the masked PR #19
  // field-name case). N date-based items => exactly N reminders, one per item.
  it("reads medicalCareItems: N date-based items produce N reminders with the right type/title", () => {
    const routine = makeRoutine({
      type: ROUTINE_TYPES.MEDICAL_CARE,
      medicalCareItems: [
        { id: "v1", type: "vaccine", name: "Rabies", nextDue: dateInDays(3) },
        { id: "f1", type: "flea_tick", name: "NexGard", nextDue: dateInDays(5) },
        { id: "d1", type: "deworming", name: "Drontal", nextDue: dateInDays(7) },
      ],
    });

    const reminders = generateRemindersFromRoutine(routine);

    expect(reminders).toHaveLength(3);
    expect(reminders.every((r) => r.type === "medical_care")).toBe(true);
    expect(new Set(reminders.map((r) => r.careType))).toEqual(
      new Set(["vaccine", "flea_tick", "deworming"]),
    );
    expect(new Set(reminders.map((r) => r.title))).toEqual(
      new Set(["Rabies vaccine due", "NexGard due", "Drontal due"]),
    );
    expect(new Set(reminders.map((r) => r.medicalCareItemId))).toEqual(
      new Set(["v1", "f1", "d1"]),
    );
    expect(allIdsUnique(reminders)).toBe(true);
  });

  // Daily-schedule items (medication/supplement) emit a dated series each — but
  // each item's series stays independent: its own careType + medicalCareItemId,
  // never collapsed into the other item.
  it("keeps daily-schedule items independent (each item owns its reminder series)", () => {
    const routine = makeRoutine({
      type: ROUTINE_TYPES.MEDICAL_CARE,
      medicalCareItems: [
        { id: "m1", type: "medication", name: "Insulin", times: ["08:00", "20:00"] },
        { id: "s1", type: "supplement", name: "Omega-3", times: ["09:00"] },
      ],
    });

    const reminders = generateRemindersFromRoutine(routine);

    expect(reminders.every((r) => r.type === "medical_care")).toBe(true);
    // Both items represented, neither merged into the other.
    expect(new Set(reminders.map((r) => r.medicalCareItemId))).toEqual(
      new Set(["m1", "s1"]),
    );
    const m1 = reminders.filter((r) => r.medicalCareItemId === "m1");
    const s1 = reminders.filter((r) => r.medicalCareItemId === "s1");
    expect(m1.length).toBeGreaterThan(0);
    expect(s1.length).toBeGreaterThan(0);
    expect(m1.every((r) => r.careType === "medication" && r.title === "Insulin")).toBe(true);
    expect(s1.every((r) => r.careType === "supplement" && r.title === "Omega-3")).toBe(true);
    expect(allIdsUnique(reminders)).toBe(true);
  });
});

describe("generateRemindersFromRoutine — vet appointment", () => {
  // The generator is one-appointment-per-routine: a single routine.date +
  // routine.times[0], no appointment array. So one routine => one reminder.
  it("emits a single reminder for the routine's appointment", () => {
    const routine = makeRoutine({
      type: ROUTINE_TYPES.VET_APPOINTMENT,
      date: dateInDays(3),
      times: ["14:30"],
      appointmentTitle: "Annual Checkup",
      clinic: "Downtown Vet",
      reason: "Vaccines + exam",
    });

    const reminders = generateRemindersFromRoutine(routine);

    expect(reminders).toHaveLength(1);
    expect(reminders[0].type).toBe("vet_appointment");
    expect(reminders[0].title).toBe("Annual Checkup");
  });
});

// ===========================================================================
// Wellness check — now wired into the dispatcher.
//
// `generateRemindersFromRoutine`'s switch previously had NO
// `case ROUTINE_TYPES.WELLNESS_CHECK`, so `generateWellnessCheckReminders` was
// dead code and a wellness routine fell through to `default → return []` — a
// standing bug since the original Anything import (b761542). The dispatcher case
// is now in place; the field-name read inside the helper was already correct
// (`routine.wellnessCheckItems`). Each item produces its own independent
// reminder, matching how the other per-item types behave.
// ===========================================================================
describe("generateRemindersFromRoutine — wellness check", () => {
  it("reads wellnessCheckItems and emits one independent reminder per item", () => {
    const routine = makeRoutine({
      type: ROUTINE_TYPES.WELLNESS_CHECK,
      wellnessCheckItems: [
        { checkType: "weight", frequency: ROUTINE_FREQUENCY.WEEKLY, preferredDay: 1, preferredTime: "09:00" },
        { checkType: "mobility", frequency: ROUTINE_FREQUENCY.WEEKLY, preferredDay: 2, preferredTime: "09:00" },
      ],
    });

    const reminders = generateRemindersFromRoutine(routine);

    expect(reminders.length).toBeGreaterThan(0);
    expect(reminders.every((r) => r.type === "wellness_check")).toBe(true);
    // Both items represented, read from wellnessCheckItems — not merged.
    expect(new Set(reminders.map((r) => r.checkType))).toEqual(
      new Set(["weight", "mobility"]),
    );
  });
});

// ===========================================================================
// Regression #1 — double-encoded (stringified JSON) schedule fields.
//
// Post-PR-#19 the toArray() shims are gone and the generators guard every list
// with `Array.isArray(x) ? x : []`. So a legacy stringified value is NOT parsed:
// it silently becomes [] (no reminders) — and must never throw. This pins that
// failure mode so a future change can't turn it back into a crash or a hidden
// partial result. The fix for double-encoding lives at the write boundary
// (sql.json, PR #19), not here.
// ===========================================================================
describe("generateRemindersFromRoutine — regression: stringified schedule field", () => {
  it("returns [] (and does not throw) when meals arrive double-encoded", () => {
    const routine = makeRoutine({
      type: ROUTINE_TYPES.FEEDING,
      meals: JSON.stringify([{ id: "meal1", name: "Breakfast", time: "07:00" }]),
    });

    let reminders;
    expect(() => {
      reminders = generateRemindersFromRoutine(routine);
    }).not.toThrow();
    expect(reminders).toEqual([]);
  });

  it("returns [] (and does not throw) when walks arrive double-encoded", () => {
    const routine = makeRoutine({
      type: ROUTINE_TYPES.WALK,
      walks: JSON.stringify([{ name: "Morning Walk", time: "07:30" }]),
    });

    let reminders;
    expect(() => {
      reminders = generateRemindersFromRoutine(routine);
    }).not.toThrow();
    expect(reminders).toEqual([]);
  });

  it("returns [] (and does not throw) when medicalCareItems arrive double-encoded", () => {
    const routine = makeRoutine({
      type: ROUTINE_TYPES.MEDICAL_CARE,
      medicalCareItems: JSON.stringify([{ id: "v1", type: "vaccine", nextDue: dateInDays(3) }]),
    });

    let reminders;
    expect(() => {
      reminders = generateRemindersFromRoutine(routine);
    }).not.toThrow();
    expect(reminders).toEqual([]);
  });
});

describe("generateRemindersFromRoutine — gating", () => {
  it("returns [] when the routine is inactive", () => {
    const routine = makeRoutine({
      type: ROUTINE_TYPES.FEEDING,
      isActive: false,
      meals: [{ id: "meal1", name: "Breakfast", time: "07:00", frequency: ROUTINE_FREQUENCY.DAILY }],
    });
    expect(generateRemindersFromRoutine(routine)).toEqual([]);
  });

  it("returns [] when notifications are disabled", () => {
    const routine = makeRoutine({
      type: ROUTINE_TYPES.FEEDING,
      notificationEnabled: false,
      meals: [{ id: "meal1", name: "Breakfast", time: "07:00", frequency: ROUTINE_FREQUENCY.DAILY }],
    });
    expect(generateRemindersFromRoutine(routine)).toEqual([]);
  });
});
