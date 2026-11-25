// End to end on the stores: another member logged a persistent task → this phone drops its alarm at the next read.

const mockPending = [];
jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  scheduleNotificationAsync: jest.fn(async (req) => {
    const i = mockPending.findIndex((p) => p.identifier === req.identifier);
    if (i >= 0) mockPending.splice(i, 1);
    mockPending.push({ identifier: req.identifier, content: req.content });
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
const routines = [
  {
    id: 100,
    pet_id: 7,
    routine_type: "wellness_check",
    is_active: true,
    title: "Wellness",
    notification_enabled: true,
    wellness_check_schedule: [
      { checkType: "general", frequency: "daily", preferredTime: "20:00", reminderEnabled: true },
    ],
  },
  {
    id: 200,
    pet_id: 7,
    routine_type: "feeding",
    is_active: true,
    title: "Meals",
    notification_enabled: true,
    feeding_schedule: [{ id: "m", name: "Dinner", time: "20:00", frequency: "daily", reminderEnabled: true }],
  },
];
let wellnessLogs;
let failLogs;
const done = {
  routine_id: 100,
  wellness_check_item_index: 0,
  values_json: { scheduledDate: "2026-06-10" },
};
const TODAY_CHECK = () =>
  useRemindersStore.getState().reminders.find((r) => r.type === "wellness_check").id;
const ids = () => mockPending.map((p) => p.identifier);
const load = () => useRoutinesStore.getState().loadRoutines(7);

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] }).setSystemTime(NOW);
  jest.spyOn(console, "warn").mockImplementation(() => {});
  mockPending.length = 0;
  wellnessLogs = [];
  failLogs = false;
  queryClient.clear();
  resetPetAccessMemory();
  useRoutinesStore.setState({ routines: [] });
  useRemindersStore.setState({ reminders: [], snoozes: {}, resolvedByPet: {} });
  global.fetch = jest.fn(async (url) => {
    const u = String(url);
    if (u.startsWith("/api/routines")) return { ok: true, json: async () => ({ routines }) };
    if (failLogs) return { ok: false, status: 500 };
    return { ok: true, json: async () => ({ logs: u.includes("wellness-logs") ? wellnessLogs : [] }) };
  });
});
afterEach(() => jest.useRealTimers());

it("cancels the alarm of the instance someone else logged, and only that one", async () => {
  await load();
  const check = TODAY_CHECK();
  expect(ids()).toContain(check);
  const before = ids().length;
  wellnessLogs = [done];
  await load();
  expect(ids()).not.toContain(check);
  expect(ids()).toHaveLength(before - 1); // the feeding alarms are untouched
});

it("does not arm it again on the next read, also while the logs cannot be read", async () => {
  wellnessLogs = [done];
  await load();
  const check = TODAY_CHECK();
  failLogs = true;
  await load();
  expect(ids()).not.toContain(check);
});

it("a deleted log (undo) arms it again", async () => {
  wellnessLogs = [done];
  await load();
  const check = TODAY_CHECK();
  wellnessLogs = [];
  await load();
  expect(ids()).toContain(check);
});

it("the reminder itself stays in the store (the Today list decides on its own)", async () => {
  wellnessLogs = [done];
  await load();
  expect(TODAY_CHECK()).toBeTruthy();
});
