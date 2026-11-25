// The single arming pass over the real store: all dogs share the budget, the soonest ring, snoozes and the nudge stay.

const mockPending = [];
const mockSchedules = [];
jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  scheduleNotificationAsync: jest.fn(async (req) => {
    mockSchedules.push(req.identifier);
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

import useRemindersStore from "./remindersStore";
import { resetPetAccessMemory } from "./petAccessStore";

const NOW = new Date(2026, 5, 10, 12, 0, 0);
const HOUR = 3600e3;
const reminder = (petId, hours) => {
  const at = new Date(NOW.getTime() + hours * HOUR).toISOString();
  return {
    id: `reminder_${petId}_m_${hours}`,
    routineId: String(petId),
    petId: String(petId),
    type: "feeding",
    title: "Meal",
    scheduledAt: at,
    nextTriggerAt: at,
    status: "upcoming",
    notificationEnabled: true,
  };
};
const ids = () => mockPending.map((p) => p.identifier);
const sync = () => useRemindersStore.getState().syncAlarms();

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] }).setSystemTime(NOW);
  mockPending.length = 0;
  mockSchedules.length = 0;
  resetPetAccessMemory();
  useRemindersStore.setState({ reminders: [], snoozes: {} });
});
afterEach(() => jest.useRealTimers());

it("arms the 48 soonest across two dogs", async () => {
  const reminders = [];
  for (let h = 1; h <= 40; h += 1) reminders.push(reminder(1, h * 2), reminder(7, h * 2 + 1));
  useRemindersStore.setState({ reminders });
  await sync();
  expect(mockPending).toHaveLength(48);
  const latest = Math.max(...mockPending.map((p) => new Date(p.trigger.date).getTime()));
  expect(latest).toBe(NOW.getTime() + 49 * HOUR); // hours 2..49 inclusive
  expect(ids().filter((i) => i.startsWith("reminder_1_")).length).toBe(24);
});

it("a second pass with nothing changed schedules nothing", async () => {
  useRemindersStore.setState({ reminders: [reminder(1, 1), reminder(1, 2)] });
  await sync();
  mockSchedules.length = 0;
  await sync();
  expect(mockSchedules).toEqual([]);
});

it("when time passes, the next pass tops the budget up", async () => {
  useRemindersStore.setState({ reminders: Array.from({ length: 60 }, (_, i) => reminder(1, i + 1)) });
  await sync();
  expect(ids()).not.toContain("reminder_1_m_55");
  jest.setSystemTime(new Date(NOW.getTime() + 10.5 * HOUR));
  mockPending.splice(0, 10); // the first ten fired
  await sync();
  expect(mockPending).toHaveLength(48);
  expect(ids()).toContain("reminder_1_m_55");
});

it("a snooze far in the future and the daily nudge survive a full budget", async () => {
  mockPending.push({ identifier: "pawpi-daily-return", content: { data: { kind: "daily_return" } } });
  useRemindersStore.setState({ reminders: Array.from({ length: 80 }, (_, i) => reminder(1, i + 1)) });
  await useRemindersStore.getState().snoozeReminder("reminder_1_m_1", { value: 100 * 60 });
  expect(ids()).toContain("pawpi-daily-return");
  expect(ids()).toContain("reminder_1_m_1");
  expect(mockPending.length).toBeLessThanOrEqual(64);
});

it("a reminder pushed out by sooner ones loses its alarm", async () => {
  useRemindersStore.setState({ reminders: Array.from({ length: 48 }, (_, i) => reminder(1, i + 10)) });
  await sync();
  useRemindersStore.setState((s) => ({ reminders: [...s.reminders, reminder(7, 1)] }));
  await sync();
  expect(mockPending).toHaveLength(48);
  expect(ids()).toContain("reminder_7_m_1");
  expect(ids()).not.toContain("reminder_1_m_57");
});

it("concurrent requests do not schedule anything twice", async () => {
  useRemindersStore.setState({ reminders: [reminder(1, 1), reminder(1, 2)] });
  await Promise.all([sync(), sync(), sync()]);
  expect(mockSchedules.sort()).toEqual(["reminder_1_m_1", "reminder_1_m_2"]);
});
