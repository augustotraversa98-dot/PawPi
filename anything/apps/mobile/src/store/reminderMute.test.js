// "Remind me about this dog" (PR5b 1D): local, per person, persisted; off arms nothing and cancels; on re-arms.

const mockPending = [];
jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  scheduleNotificationAsync: jest.fn(async (req) => {
    const i = mockPending.findIndex((p) => p.identifier === req.identifier);
    if (i >= 0) mockPending.splice(i, 1);
    mockPending.push({ identifier: req.identifier ?? `uuid-${mockPending.length}`, content: req.content });
    return req.identifier ?? "uuid";
  }),
  getAllScheduledNotificationsAsync: jest.fn(async () => mockPending.slice()),
  cancelScheduledNotificationAsync: jest.fn(async (id) => {
    const i = mockPending.findIndex((p) => p.identifier === id);
    if (i >= 0) mockPending.splice(i, 1);
  }),
  AndroidNotificationPriority: { HIGH: "high", DEFAULT: "default" },
  SchedulableTriggerInputTypes: { DATE: "date", DAILY: "daily" },
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import useRemindersStore from "./remindersStore";
import useReminderMuteStore, { isDogMuted } from "./reminderMuteStore";
import { useAuthStore } from "@/utils/auth/store";
import { resetPetAccessMemory } from "./petAccessStore";
import { maybeScheduleStreakSave, maybeArmReminderSetupNudge } from "@/utils/engagementNotifications";

const reminder = (petId, hours = 2) => {
  const at = new Date(Date.now() + hours * 3600e3).toISOString();
  return {
    id: `reminder_${petId}_m_${hours}`,
    petId: String(petId),
    type: "feeding",
    title: "Meal",
    scheduledAt: at,
    nextTriggerAt: at,
    status: "upcoming",
    notificationEnabled: true,
  };
};
const ids = () => mockPending.map((p) => p.identifier).sort();
const sync = () => useRemindersStore.getState().syncAlarms();
const mute = (petId, muted = true) => useReminderMuteStore.getState().setDogMuted("1", petId, muted);

beforeEach(() => {
  mockPending.length = 0;
  resetPetAccessMemory();
  useAuthStore.setState({ auth: { jwt: "a", user: { id: 1 } } });
  useReminderMuteStore.setState({ mutedByUser: {} });
  useRemindersStore.setState({ reminders: [reminder(7), reminder(2)], snoozes: {} });
});

it("is on by default: every dog is armed", async () => {
  await sync();
  expect(isDogMuted(7)).toBe(false);
  expect(ids()).toEqual(["reminder_2_m_2", "reminder_7_m_2"]);
});

it("off cancels that dog's alarms (also ones of a dog not read yet, and its nudges) and keeps the others", async () => {
  await sync();
  mockPending.push(
    { identifier: "reminder_unknown_7", content: { data: { reminderId: "reminder_unknown_7", petId: "7" } } },
    { identifier: "nudge", content: { data: { nudge: "reminder_setup", petId: 7 } } },
    { identifier: "pawpi-daily-return", content: { data: { kind: "daily_return" } } },
  );
  mute(7);
  await sync();
  expect(ids()).toEqual(["pawpi-daily-return", "reminder_2_m_2"]);
});

it("off arms nothing, not even a snooze", async () => {
  mute(7);
  await sync();
  await useRemindersStore.getState().snoozeReminder("reminder_7_m_2", { value: 10 });
  expect(ids()).toEqual(["reminder_2_m_2"]);
});

it("Today's list is not affected: the reminders stay in the store", async () => {
  mute(7);
  await sync();
  expect(useRemindersStore.getState().reminders.map((r) => r.petId).sort()).toEqual(["2", "7"]);
});

it("on again re-arms", async () => {
  mute(7);
  await sync();
  mute(7, false);
  await sync();
  expect(ids()).toContain("reminder_7_m_2");
});

it("belongs to the person: another account on this phone is not muted", async () => {
  mute(7);
  useAuthStore.setState({ auth: { jwt: "b", user: { id: 2 } } });
  expect(isDogMuted(7)).toBe(false);
  await sync();
  expect(ids()).toContain("reminder_7_m_2");
});

it("persists across a relaunch", async () => {
  mute(7);
  await new Promise((r) => setImmediate(r));
  const saved = JSON.parse(await AsyncStorage.getItem("pawpi:reminderMutes"));
  expect(saved.state.mutedByUser).toEqual({ 1: ["7"] });
  // relaunch: memory is empty, the stored value is read back
  useReminderMuteStore.setState({ mutedByUser: {} });
  await AsyncStorage.setItem("pawpi:reminderMutes", JSON.stringify(saved));
  await useReminderMuteStore.persist.rehydrate();
  expect(isDogMuted(7)).toBe(true);
});

it("the dog's own nudges are not armed while it is off", async () => {
  mute(7);
  const t = (k) => k;
  await expect(
    maybeScheduleStreakSave({
      t,
      petId: 7,
      streakCount: 3,
      ring: { walkDone: true, momentDone: true, careDone: false },
      now: new Date("2026-08-14T09:00:00"),
    }),
  ).resolves.toBeNull();
  await expect(
    maybeArmReminderSetupNudge({ t, petId: 7, hasReminder: false, permissionGranted: true }),
  ).resolves.toEqual([]);
  expect(mockPending).toEqual([]);
});
