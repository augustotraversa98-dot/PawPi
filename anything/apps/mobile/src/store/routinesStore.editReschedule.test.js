// Edit-reschedule path: changing a wellness item's Early-reminder `reminderTiming`
// on a pre-existing routine must cancel the already-scheduled (no-lead) OS
// notifications for its still-upcoming instances and reschedule them with the
// new lead-time.
//
// Regression guard for the ordering race in routinesStore.updateRoutine /
// toggleRoutineActive: removeFutureRemindersByRoutine is async and clears state
// in a set() that lives past an `await cancelNotification` loop. When the call
// was not awaited, addReminderFromRoutine's id-based dedup ran against the
// not-yet-removed instances, early-returned on each, and the new lead-time was
// never scheduled. updateRoutine now awaits the removal before regenerating.

jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  requestPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  scheduleNotificationAsync: jest.fn(async () => "notif-id"),
  cancelScheduledNotificationAsync: jest.fn(async () => {}),
  AndroidNotificationPriority: { HIGH: "high", DEFAULT: "default" },
}));

// Keep the REAL resolveReminderTiming (it reads the lead-time off the routine);
// spy only the scheduling/cancel side effects.
jest.mock("@/utils/notifications", () => {
  const actual = jest.requireActual("@/utils/notifications");
  return {
    __esModule: true,
    ...actual,
    scheduleReminderNotification: jest.fn(async () => "notif-old"),
    cancelNotification: jest.fn(async () => {}),
  };
});

jest.mock("./socialPetStore", () => ({
  __esModule: true,
  default: {
    getState: () => ({ notifications: [], markNotificationRead: jest.fn() }),
  },
}));

import useRemindersStore from "./remindersStore";
import useRoutinesStore from "./routinesStore";
import { generateRemindersFromRoutine } from "@/utils/reminderGenerator";
import {
  scheduleReminderNotification,
  cancelNotification,
} from "@/utils/notifications";

const NOW = new Date(2026, 5, 10, 12, 0, 0); // local noon

// App-format wellness routine: one daily "general" check at 20:00 (future today),
// reminders enabled. `reminderTiming` is the per-item Early-reminder option.
const appRoutine = (reminderTiming) => ({
  id: "100",
  petId: "2",
  type: "wellness_check",
  isActive: true,
  title: "Wellness",
  description: "",
  wellnessCheckItems: [
    {
      checkType: "general",
      frequency: "daily",
      preferredTime: "20:00",
      reminderEnabled: true,
      reminderTiming,
    },
  ],
  frequency: "daily",
  times: ["20:00"],
  days: [],
  notificationEnabled: true,
  timeSensitive: false,
});

// DB-format row the PUT /api/routines response returns. updateRoutine transforms
// this back into app format and regenerates from it.
const dbRoutine = (reminderTiming) => ({
  id: 100,
  pet_id: 2,
  routine_type: "wellness_check",
  is_active: true,
  title: "Wellness",
  description: "",
  wellness_check_schedule: [
    {
      checkType: "general",
      frequency: "daily",
      preferredTime: "20:00",
      reminderEnabled: true,
      reminderTiming,
    },
  ],
  frequency: "daily",
  preferred_day: null,
  times: ["20:00"],
  days: [],
  notification_enabled: true,
  time_sensitive: false,
  created_at: null,
  updated_at: null,
});

describe("routinesStore.updateRoutine — edit-reschedule of Early reminder", () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
    useRemindersStore.setState({ reminders: [], snoozes: {} });
    useRoutinesStore.setState({ routines: [], initialized: false });
    scheduleReminderNotification.mockClear();
    cancelNotification.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("cancels the old notifications and reschedules upcoming instances with the new lead-time", async () => {
    // Seed: routine with NO early reminder, already-scheduled upcoming instances.
    const original = appRoutine(undefined);
    useRoutinesStore.setState({ routines: [original] });

    const seeded = generateRemindersFromRoutine(original);
    expect(seeded.length).toBeGreaterThan(0); // daily over the horizon
    for (const reminder of seeded) {
      await useRemindersStore.getState().addReminderFromRoutine(reminder);
    }
    // Initial schedule used no lead-time (second arg null), instances stored.
    expect(scheduleReminderNotification).toHaveBeenCalled();
    expect(
      scheduleReminderNotification.mock.calls.every((c) => c[1] == null),
    ).toBe(true);

    scheduleReminderNotification.mockClear();
    cancelNotification.mockClear();
    scheduleReminderNotification.mockResolvedValue("notif-new");

    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ routine: dbRoutine("15m") }),
    }));

    // Edit: turn on "15 min before".
    await useRoutinesStore.getState().updateRoutine("100", {
      wellnessCheckSchedule: dbRoutine("15m").wellness_check_schedule,
    });

    // Old notifications were cancelled...
    expect(cancelNotification).toHaveBeenCalledWith("notif-old");
    // ...and every reschedule passed the new lead-time, reaching the scheduler
    // (not blocked by the dedup early-return).
    expect(scheduleReminderNotification).toHaveBeenCalled();
    expect(
      scheduleReminderNotification.mock.calls.every((c) => c[1] === "15m"),
    ).toBe(true);

    // The upcoming instances survive in the store carrying the new notif id —
    // proof the regenerated set wasn't wiped by a deferred removal set().
    const stored = useRemindersStore
      .getState()
      .reminders.filter((r) => r.routineId === "100");
    expect(stored.length).toBeGreaterThan(0);
    expect(stored.every((r) => r.scheduledNotificationId === "notif-new")).toBe(
      true,
    );
  });

  it("toggling back to 'At time' reschedules upcoming instances at the event time", async () => {
    const withLead = appRoutine("15m");
    useRoutinesStore.setState({ routines: [withLead] });

    const seeded = generateRemindersFromRoutine(withLead);
    for (const reminder of seeded) {
      await useRemindersStore.getState().addReminderFromRoutine(reminder);
    }

    scheduleReminderNotification.mockClear();
    cancelNotification.mockClear();
    scheduleReminderNotification.mockResolvedValue("notif-attime");

    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ routine: dbRoutine("on_time") }),
    }));

    await useRoutinesStore.getState().updateRoutine("100", {
      wellnessCheckSchedule: dbRoutine("on_time").wellness_check_schedule,
    });

    expect(scheduleReminderNotification).toHaveBeenCalled();
    // "on_time" lead resolves to no shift; every call carries it.
    expect(
      scheduleReminderNotification.mock.calls.every((c) => c[1] === "on_time"),
    ).toBe(true);
  });
});
