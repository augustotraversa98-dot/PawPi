// The notification sweep after a routines load: it must also run when the load generates NOTHING (the dog's last routine
// was removed on another phone), and it must not kill a running snooze or touch another dog.

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
import { markPetLost, resetPetAccessMemory } from "./petAccessStore";
import { queryClient } from "@/utils/queryClient";

const row = (id, petId, extra = {}) => ({
  id,
  pet_id: petId,
  routine_type: "feeding",
  is_active: true,
  title: "Meals",
  frequency: "daily",
  times: ["08:00"],
  days: [],
  notification_enabled: true,
  feeding_schedule: [{ id: `m${id}`, name: "Breakfast", time: "23:59", frequency: "daily", reminderEnabled: true }],
  ...extra,
});
const answer = (routines) => {
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ routines }) }));
};
const arm = (rid, petId) => mockPending.push({ identifier: rid, content: { data: { reminderId: rid, petId } } });
const ids = () => mockPending.map((p) => p.identifier);
const later = () => new Date(Date.now() + 3600e3).toISOString();

beforeEach(() => {
  mockPending.length = 0;
  queryClient.clear();
  resetPetAccessMemory();
  useRoutinesStore.setState({ routines: [], initialized: false });
  useRemindersStore.setState({ reminders: [], snoozes: {} });
  arm("reminder_5_m5_2026-01-01", "7");
  arm("reminder_9_m9_2026-01-01", "1");
});

describe("loadRoutines sweep", () => {
  it("removing the LAST routine cancels the dog's orphan alarms; the other dog is untouched", async () => {
    answer([]);
    await useRoutinesStore.getState().loadRoutines(7);
    expect(ids()).toEqual(["reminder_9_m9_2026-01-01"]);
  });

  it("a paused last routine (nothing generated) also cancels", async () => {
    answer([row(5, 7, { is_active: false })]);
    await useRoutinesStore.getState().loadRoutines(7);
    expect(ids()).toEqual(["reminder_9_m9_2026-01-01"]);
  });

  it("keeps a running snooze of a routine that is still active, drops the one of a removed routine", async () => {
    arm("reminder_6_m6_2026-01-01", "7");
    useRemindersStore.setState({
      snoozes: { "reminder_5_m5_2026-01-01": later(), "reminder_6_m6_2026-01-01": later() },
    });
    answer([row(5, 7)]);
    await useRoutinesStore.getState().loadRoutines(7);
    expect(ids()).toContain("reminder_5_m5_2026-01-01");
    expect(ids()).not.toContain("reminder_6_m6_2026-01-01");
  });

  it("a failed load cancels nothing", async () => {
    global.fetch = jest.fn(async () => ({ ok: false, statusText: "boom", json: async () => ({}) }));
    jest.spyOn(console, "error").mockImplementation(() => {});
    await useRoutinesStore.getState().loadRoutines(7);
    expect(mockPending).toHaveLength(2);
  });

  it("a load that finishes after access to the dog was lost neither stores nor arms anything", async () => {
    mockPending.length = 0;
    answer([row(5, 7)]);
    const load = useRoutinesStore.getState().loadRoutines(7);
    markPetLost(7);
    await load;
    expect(useRoutinesStore.getState().routines).toEqual([]);
    expect(useRemindersStore.getState().reminders).toEqual([]);
    expect(mockPending).toEqual([]);
  });
});
