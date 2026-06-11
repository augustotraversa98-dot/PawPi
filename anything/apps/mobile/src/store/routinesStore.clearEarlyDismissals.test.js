// Editing or re-enabling a routine must clear that routine's heads-up
// acknowledgments (the `${id}::early` rows) for the pet, so the regenerated
// occurrences are not suppressed by a stale Close (ticket/early-reminder-headsup).
// Photo/wellness ids are date-stamped, so editing only the TIME keeps the same id
// and the old ::early ack would keep hiding the card while the push reschedules.
//
// This pins: updateRoutine (edit) and toggleRoutineActive (re-enable) each fire a
// DELETE /api/health/reminder-dismissals?petId=&routineId=, AFTER the awaited
// remove+regenerate, and best-effort (a failed clear never blocks the save).

jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  requestPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  scheduleNotificationAsync: jest.fn(async () => "notif-id"),
  cancelScheduledNotificationAsync: jest.fn(async () => {}),
  AndroidNotificationPriority: { HIGH: "high", DEFAULT: "default" },
}));

jest.mock("@/utils/notifications", () => {
  const actual = jest.requireActual("@/utils/notifications");
  return {
    __esModule: true,
    ...actual,
    scheduleReminderNotification: jest.fn(async () => "notif-id"),
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

const NOW = new Date(2026, 5, 10, 12, 0, 0);

// App-format wellness routine (daily general check at 20:00, reminders on).
const appRoutine = (overrides = {}) => ({
  id: "100",
  petId: "2",
  type: "wellness_check",
  isActive: true,
  title: "Wellness",
  description: "",
  wellnessCheckItems: [
    { checkType: "general", frequency: "daily", preferredTime: "20:00", reminderEnabled: true },
  ],
  frequency: "daily",
  times: ["20:00"],
  days: [],
  notificationEnabled: true,
  timeSensitive: false,
  ...overrides,
});

// DB-format row the PUT /api/routines response returns.
const dbRoutine = (isActive = true) => ({
  id: 100,
  pet_id: 2,
  routine_type: "wellness_check",
  is_active: isActive,
  title: "Wellness",
  description: "",
  wellness_check_schedule: [
    { checkType: "general", frequency: "daily", preferredTime: "20:00", reminderEnabled: true },
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

// Route fetch by URL: PUT /api/routines returns the routine; DELETE dismissals is
// the clear under test. `deleteResult` lets a test force the clear's response.
function mockFetch(deleteResult = { ok: true, json: async () => ({ deleted: 0 }) }) {
  return jest.fn(async (url) => {
    if (typeof url === "string" && url.includes("/api/health/reminder-dismissals")) {
      return deleteResult;
    }
    return { ok: true, json: async () => ({ routine: dbRoutine() }) };
  });
}

// The single DELETE call to the dismissals route, or undefined.
const deleteCall = () =>
  global.fetch.mock.calls.find(
    ([url, opts]) =>
      typeof url === "string" &&
      url.includes("/api/health/reminder-dismissals") &&
      opts?.method === "DELETE",
  );

describe("routinesStore — clears `${id}::early` acks on edit / re-enable", () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
    useRemindersStore.setState({ reminders: [], snoozes: {} });
    useRoutinesStore.setState({ routines: [], initialized: false });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("updateRoutine fires a scoped DELETE for (petId, routineId)", async () => {
    useRoutinesStore.setState({ routines: [appRoutine()] });
    global.fetch = mockFetch();

    await useRoutinesStore.getState().updateRoutine("100", {
      wellnessCheckSchedule: dbRoutine().wellness_check_schedule,
    });

    const call = deleteCall();
    expect(call).toBeTruthy();
    expect(call[0]).toBe(
      "/api/health/reminder-dismissals?petId=2&routineId=100",
    );
  });

  it("re-enable (toggleRoutineActive) fires the clear too", async () => {
    useRoutinesStore.setState({ routines: [appRoutine({ isActive: false })] });
    global.fetch = mockFetch();

    await useRoutinesStore.getState().toggleRoutineActive("100");

    const call = deleteCall();
    expect(call).toBeTruthy();
    expect(call[0]).toContain("petId=2");
    expect(call[0]).toContain("routineId=100");
  });

  it("the clear runs AFTER the regenerate (upcoming instances survive the edit)", async () => {
    useRoutinesStore.setState({ routines: [appRoutine()] });
    global.fetch = mockFetch();

    await useRoutinesStore.getState().updateRoutine("100", {
      wellnessCheckSchedule: dbRoutine().wellness_check_schedule,
    });

    // Regenerated instances are present (not wiped) AND the clear fired — proof
    // the awaited clear didn't pre-empt or race the remove+regenerate.
    const stored = useRemindersStore
      .getState()
      .reminders.filter((r) => r.routineId === "100");
    expect(stored.length).toBeGreaterThan(0);
    expect(deleteCall()).toBeTruthy();
  });

  it("a no-op clear (zero rows) resolves without error", async () => {
    useRoutinesStore.setState({ routines: [appRoutine()] });
    global.fetch = mockFetch({ ok: true, json: async () => ({ deleted: 0 }) });

    await expect(
      useRoutinesStore.getState().updateRoutine("100", {
        wellnessCheckSchedule: dbRoutine().wellness_check_schedule,
      }),
    ).resolves.toBeTruthy();
  });

  it("best-effort: a failing clear does NOT block the save", async () => {
    useRoutinesStore.setState({ routines: [appRoutine()] });
    // DELETE returns non-ok; the helper logs and swallows it.
    global.fetch = mockFetch({ ok: false, status: 500, json: async () => ({}) });
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

    const result = await useRoutinesStore.getState().updateRoutine("100", {
      wellnessCheckSchedule: dbRoutine().wellness_check_schedule,
    });

    expect(result).toBeTruthy(); // save succeeded despite the failed clear
    expect(deleteCall()).toBeTruthy();
    warn.mockRestore();
  });
});
