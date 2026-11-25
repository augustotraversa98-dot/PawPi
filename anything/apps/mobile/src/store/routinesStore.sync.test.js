// Re-reading a dog's routines (pet select, app foreground, newly shared dog) must bring the reminders and the OS alarms
// in step with what the household did on other phones, without duplicating anything or losing this phone's own state.

const mockPending = [];
const mockScheduleCalls = [];
jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  scheduleNotificationAsync: jest.fn(async (req) => {
    mockScheduleCalls.push(req);
    const i = mockPending.findIndex((p) => p.identifier === req.identifier);
    if (i >= 0) mockPending.splice(i, 1);
    mockPending.push({ identifier: req.identifier, content: req.content, trigger: req.trigger });
    return req.identifier;
  }),
  getAllScheduledNotificationsAsync: jest.fn(async () => mockPending.slice()),
  cancelScheduledNotificationAsync: jest.fn(async (id) => {
    const i = mockPending.findIndex((p) => p.identifier === id);
    if (i >= 0) mockPending.splice(i, 1);
  }),
  AndroidNotificationPriority: { HIGH: "high", DEFAULT: "default" },
  SchedulableTriggerInputTypes: { DATE: "date", DAILY: "daily" },
}));

import useRoutinesStore from "./routinesStore";
import useRemindersStore from "./remindersStore";
import { resetPetAccessMemory } from "./petAccessStore";
import { queryClient } from "@/utils/queryClient";

const NOW = new Date(2026, 5, 10, 12, 0, 0);
const row = (id, petId, time = "20:00", extra = {}) => ({
  id,
  pet_id: petId,
  routine_type: "feeding",
  is_active: true,
  title: "Meals",
  frequency: "daily",
  times: [time],
  days: [],
  notification_enabled: true,
  feeding_schedule: [{ id: `m${id}`, name: "Dinner", time, frequency: "daily", reminderEnabled: true }],
  ...extra,
});
const serve = (byPet) => {
  global.fetch = jest.fn(async (url) => {
    const petId = new URL(String(url), "http://x").searchParams.get("petId");
    return { ok: true, json: async () => ({ routines: byPet[petId] ?? [] }) };
  });
};
const load = (petId, opts) => useRoutinesStore.getState().loadRoutines(petId, opts);
const reminders = () => useRemindersStore.getState().reminders;
const today = "reminder_5_m5_2026-06-10";
const alarm = (id) => mockPending.find((p) => p.identifier === id);

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] }).setSystemTime(NOW);
  mockPending.length = 0;
  mockScheduleCalls.length = 0;
  queryClient.clear();
  resetPetAccessMemory();
  useRoutinesStore.setState({ routines: [], initialized: false, loading: false, error: null });
  useRemindersStore.setState({ reminders: [], snoozes: {} });
});
afterEach(() => jest.useRealTimers());

it("a second read with nothing changed schedules nothing and duplicates nothing", async () => {
  serve({ 7: [row(5, 7)] });
  await load(7);
  const count = reminders().length;
  expect(mockPending).toHaveLength(count);
  mockScheduleCalls.length = 0;
  await load(7);
  expect(reminders()).toHaveLength(count);
  expect(mockScheduleCalls).toHaveLength(0);
});

it("two reads at the same time still store each reminder once", async () => {
  serve({ 7: [row(5, 7)] });
  await Promise.all([load(7), load(7)]);
  const ids = reminders().map((r) => r.id);
  expect(new Set(ids).size).toBe(ids.length);
});

it("an automatic read joins the one already on its way", async () => {
  serve({ 7: [row(5, 7)] });
  await Promise.all([load(7, { coalesce: true }), load(7, { coalesce: true })]);
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

it("a time changed on another phone moves the alarm", async () => {
  serve({ 7: [row(5, 7, "20:00")] });
  await load(7);
  serve({ 7: [row(5, 7, "21:30")] });
  await load(7);
  expect(new Date(alarm(today).trigger.date).getHours()).toBe(21);
  expect(new Date(reminders().find((r) => r.id === today).scheduledAt).getMinutes()).toBe(30);
});

it("a routine deleted on another phone leaves no reminder and no alarm", async () => {
  serve({ 7: [row(5, 7), row(6, 7, "19:00")] });
  await load(7);
  serve({ 7: [row(5, 7)] });
  await load(7);
  expect(reminders().every((r) => r.routineId === "5")).toBe(true);
  expect(mockPending.every((p) => p.identifier.startsWith("reminder_5_"))).toBe(true);
});

it("an alarm the system lost is re-armed", async () => {
  serve({ 7: [row(5, 7)] });
  await load(7);
  mockPending.length = 0;
  await load(7);
  expect(alarm(today)).toBeTruthy();
});

it("done stays done and is not re-armed", async () => {
  serve({ 7: [row(5, 7)] });
  await load(7);
  useRemindersStore.getState().completeReminder(today);
  await load(7);
  expect(reminders().find((r) => r.id === today).status).toBe("completed");
  expect(alarm(today)).toBeUndefined();
});

it("a snooze keeps its own time, also when the alarm has to be re-armed", async () => {
  serve({ 7: [row(5, 7)] });
  await load(7);
  await useRemindersStore.getState().snoozeReminder(today, { value: 600 });
  mockPending.length = 0;
  await load(7);
  expect(new Date(alarm(today).trigger.date).getTime()).toBe(NOW.getTime() + 600 * 60 * 1000);
});

it("paused and then active again re-arms", async () => {
  serve({ 7: [row(5, 7)] });
  await load(7);
  await useRemindersStore.getState().disableFutureRemindersByRoutine("5");
  await load(7);
  expect(alarm(today)).toBeTruthy();
});

describe("another dog", () => {
  it("a background read arms it and leaves the dog on screen alone", async () => {
    serve({ 1: [row(9, 1)], 7: [row(5, 7)] });
    await load(1);
    await load(7, { background: true });
    expect(useRoutinesStore.getState().routines.map((r) => r.id)).toEqual(["9"]);
    expect(alarm(today)).toBeTruthy();
    expect(reminders().some((r) => r.petId === "1")).toBe(true);
    expect(reminders().some((r) => r.petId === "7")).toBe(true);
  });

  it("a failed background read reports null and changes nothing", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => {});
    serve({ 1: [row(9, 1)] });
    await load(1);
    global.fetch = jest.fn(async () => ({ ok: false, statusText: "offline" }));
    await expect(load(7, { background: true })).resolves.toBeNull();
    expect(useRoutinesStore.getState().error).toBeNull();
    expect(useRoutinesStore.getState().routines.map((r) => r.id)).toEqual(["9"]);
  });

  it("a slower answer about the previous dog does not replace the dog now selected", async () => {
    let release;
    global.fetch = jest.fn((url) =>
      String(url).includes("petId=1")
        ? new Promise((resolve) => {
            release = () => resolve({ ok: true, json: async () => ({ routines: [row(9, 1)] }) });
          })
        : Promise.resolve({ ok: true, json: async () => ({ routines: [row(5, 7)] }) }),
    );
    const slow = load(1);
    await load(7);
    release();
    await slow;
    expect(useRoutinesStore.getState().routines.map((r) => r.id)).toEqual(["5"]);
  });
});

it("a failed foreground refresh keeps the routines on screen", async () => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  serve({ 7: [row(5, 7)] });
  await load(7);
  global.fetch = jest.fn(async () => ({ ok: false, statusText: "offline" }));
  await load(7, { silent: true });
  expect(useRoutinesStore.getState().routines.map((r) => r.id)).toEqual(["5"]);
  expect(useRoutinesStore.getState().error).toBeNull();
});
