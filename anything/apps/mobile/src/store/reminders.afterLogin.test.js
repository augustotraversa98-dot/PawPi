// After a logout and a DIFFERENT user logging in on the same device, only the new user's reminders
// are scheduled — built from their own routines — and nothing the previous user had armed
// survives or gets re-armed (including work that was still in flight when they logged out).
// Real routines/reminders stores + the real auth store; only the OS/notification layer is a spy.

const mockSchedule = jest.fn(async (reminder) => `os-${reminder.id}`);
const mockCancelOne = jest.fn(async () => {});
const mockCancelAll = jest.fn(async () => {});
jest.mock("@/utils/notifications", () => ({
  ...jest.requireActual("@/utils/notifications"),
  scheduleReminderNotification: (...a) => mockSchedule(...a),
  cancelNotification: (...a) => mockCancelOne(...a),
  cancelAllNotifications: (...a) => mockCancelAll(...a),
  cancelDailyReturnReminder: jest.fn(async () => {}),
}));
jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  SchedulableTriggerInputTypes: { DATE: "date", DAILY: "daily" },
}));
jest.mock("@/utils/registerPushToken", () => ({
  unregisterPushTokenAsync: jest.fn(async () => true),
  resetPushTokenRegistration: jest.fn(),
}));
jest.mock("expo-secure-store", () => ({
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: "afu",
}));
jest.mock("@/utils/queryClient", () => ({ queryClient: { clear: jest.fn() } }));

import useRoutinesStore from "./routinesStore";
import useRemindersStore from "./remindersStore";
import { useAuthStore } from "@/utils/auth/store";

const USER_A = { jwt: "jwt-A", user: { id: 1 } };
const USER_B = { jwt: "jwt-B", user: { id: 2 } };

// A feeding routine row exactly as GET /api/routines returns it.
const routineRow = (id, petId, title) => ({
  id,
  pet_id: petId,
  routine_type: "feeding",
  is_active: true,
  title,
  frequency: "daily",
  times: ["08:00"],
  days: [],
  notification_enabled: true,
  feeding_schedule: [{ id: `m${id}`, name: title, time: "08:00", frequency: "daily", reminderEnabled: true }],
});
const routinesResponse = (rows) => ({ ok: true, status: 200, json: async () => ({ routines: rows }) });

const scheduledRoutineIds = () => new Set(mockSchedule.mock.calls.map(([r]) => r.routineId));

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "warn").mockImplementation(() => {});
  useAuthStore.setState({ auth: USER_A, isReady: true });
  useRoutinesStore.setState({ routines: [], initialized: false, loading: false, error: null });
  useRemindersStore.setState({ reminders: [], snoozes: {} });
});

test("user B only gets reminders from B's own routines after A logged out", async () => {
  global.fetch = jest.fn(async () => routinesResponse([routineRow(101, 5, "A breakfast")]));
  await useRoutinesStore.getState().loadRoutines(5);
  expect(scheduledRoutineIds()).toEqual(new Set(["101"]));
  expect(useRemindersStore.getState().reminders.length).toBeGreaterThan(0);

  // A logs out: everything cancelled, nothing of A left in memory.
  useAuthStore.getState().setAuth(null);
  await new Promise((r) => setImmediate(r));
  expect(mockCancelAll).toHaveBeenCalledTimes(1);
  expect(useRoutinesStore.getState().routines).toEqual([]);
  expect(useRemindersStore.getState().reminders).toEqual([]);

  // B logs in and the app loads B's pet's routines.
  mockSchedule.mockClear();
  useAuthStore.getState().setAuth(USER_B);
  global.fetch = jest.fn(async () => routinesResponse([routineRow(202, 9, "B dinner")]));
  await useRoutinesStore.getState().loadRoutines(9);

  expect(scheduledRoutineIds()).toEqual(new Set(["202"])); // never 101
  const reminders = useRemindersStore.getState().reminders;
  expect(reminders.length).toBeGreaterThan(0);
  expect(reminders.every((r) => r.routineId === "202" && r.petId === "9")).toBe(true);
  expect(useRoutinesStore.getState().routines.map((r) => r.id)).toEqual(["202"]);
});

test("switching straight from A to B (no logout in between) does not carry A's reminders over", async () => {
  global.fetch = jest.fn(async () => routinesResponse([routineRow(101, 5, "A breakfast")]));
  await useRoutinesStore.getState().loadRoutines(5);

  useAuthStore.getState().setAuth(USER_B);
  await new Promise((r) => setImmediate(r));
  expect(mockCancelAll).toHaveBeenCalledTimes(1);
  expect(useRemindersStore.getState().reminders).toEqual([]);
  expect(useRoutinesStore.getState().routines).toEqual([]);
});

test("a routines load still in flight when the user logs out is dropped — nothing is scheduled for them", async () => {
  let release;
  global.fetch = jest.fn(
    () => new Promise((resolve) => {
      release = () => resolve(routinesResponse([routineRow(101, 5, "A breakfast")]));
    }),
  );
  const pending = useRoutinesStore.getState().loadRoutines(5);

  useAuthStore.getState().setAuth(null); // A logs out while the request is outstanding
  release();
  expect(await pending).toEqual([]);

  expect(mockSchedule).not.toHaveBeenCalled();
  expect(useRoutinesStore.getState().routines).toEqual([]);
  expect(useRemindersStore.getState().reminders).toEqual([]);
});

test("reminders being armed when the user logs out are un-armed again", async () => {
  let releaseSchedule;
  mockSchedule.mockImplementationOnce(
    (reminder) => new Promise((resolve) => {
      releaseSchedule = () => resolve(`os-${reminder.id}`);
    }),
  );
  global.fetch = jest.fn(async () => routinesResponse([routineRow(101, 5, "A breakfast")]));
  const pending = useRoutinesStore.getState().loadRoutines(5);
  await new Promise((r) => setImmediate(r)); // the first reminder is now awaiting the OS scheduler

  useAuthStore.getState().setAuth(null);
  releaseSchedule();
  await pending;

  expect(mockCancelOne).toHaveBeenCalled(); // the alert that was just armed for A is cancelled
  expect(useRemindersStore.getState().reminders).toEqual([]);
});
