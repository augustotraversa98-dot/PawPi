// Access to a shared dog is lost: this phone must stop ringing for it, and keep ringing for every other dog.
// Real routines / reminders / social stores and the real notification layer; only the OS is faked.

const mockPending = [];
jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  scheduleNotificationAsync: jest.fn(async (req) => req.identifier),
  getAllScheduledNotificationsAsync: jest.fn(async () => mockPending.slice()),
  cancelScheduledNotificationAsync: jest.fn(async (id) => {
    const i = mockPending.findIndex((p) => p.identifier === id);
    if (i >= 0) mockPending.splice(i, 1);
  }),
  AndroidNotificationPriority: { HIGH: "high", DEFAULT: "default" },
  SchedulableTriggerInputTypes: { DATE: "date", DAILY: "daily" },
}));

import useRoutinesStore from "@/store/routinesStore";
import useRemindersStore from "@/store/remindersStore";
import useSocialPetStore from "@/store/socialPetStore";
import { reconcileSharedPets, resetPetAccessMemory, isPetLost } from "@/store/petAccessStore";
import {
  purgePetReminders,
  purgeUnlistedPetReminders,
  resetUnlistedPetMemory,
} from "./petReminderCleanup";

const LOST = 7;
const KEPT = 1;
const pend = (identifier, data) => ({ identifier, content: { data } });
const routineAlarm = (rid, petId) => pend(rid, { reminderId: rid, petId });
const reminder = (id, routineId, petId) => ({ id, routineId, petId: String(petId), status: "upcoming" });
const ids = () => mockPending.map((p) => p.identifier);

const seed = () => {
  mockPending.length = 0;
  mockPending.push(
    routineAlarm("reminder_5_m_d1", String(LOST)),
    routineAlarm("reminder_5_m_d2", String(LOST)),
    routineAlarm("reminder_9_m_d1", String(KEPT)),
    pend("streak-lost", { category: "streak", petId: LOST }),
    pend("pawpi-daily-return", { kind: "daily_return" }),
    pend("telehealth_2_1", { reminderId: "telehealth_2_1", petId: null }),
  );
  useRoutinesStore.setState({
    routines: [
      { id: "5", petId: String(LOST), isActive: true },
      { id: "9", petId: String(KEPT), isActive: true },
    ],
  });
  const later = new Date(Date.now() + 3600e3).toISOString();
  useRemindersStore.setState({
    reminders: [reminder("reminder_5_m_d1", "5", LOST), reminder("reminder_9_m_d1", "9", KEPT)],
    snoozes: { reminder_5_m_d0: later, reminder_9_m_d0: later, vet_apt_3: later },
  });
  useSocialPetStore.setState({
    notifications: [
      { id: "notif_reminder_5_m_d1", reminderId: "reminder_5_m_d1", read: false },
      { id: "notif_reminder_9_m_d1", reminderId: "reminder_9_m_d1", read: false },
    ],
    unreadNotificationCount: 2,
  });
};

beforeEach(() => {
  resetPetAccessMemory();
  resetUnlistedPetMemory();
  seed();
});

describe("purgePetReminders", () => {
  it("cancels only that dog's alarms; the other dog, the daily nudge and a consult reminder stay", async () => {
    await expect(purgePetReminders([LOST])).resolves.toBe(3);
    expect(ids()).toEqual(["reminder_9_m_d1", "pawpi-daily-return", "telehealth_2_1"]);
  });

  it("removes that dog's routines, reminders, snoozes and in-app reminder rows only", async () => {
    await purgePetReminders([LOST]);
    expect(useRoutinesStore.getState().routines.map((r) => r.id)).toEqual(["9"]);
    expect(useRemindersStore.getState().reminders.map((r) => r.id)).toEqual(["reminder_9_m_d1"]);
    expect(Object.keys(useRemindersStore.getState().snoozes)).toEqual(["reminder_9_m_d0", "vet_apt_3"]);
    expect(useSocialPetStore.getState().notifications.map((n) => n.reminderId)).toEqual(["reminder_9_m_d1"]);
    expect(useSocialPetStore.getState().unreadNotificationCount).toBe(1);
  });

  it("cancels an old build's alarm that carries no petId, through the reminder id the store knows", async () => {
    mockPending.push(pend("UUID-OLD", { reminderId: "reminder_5_m_d1" }));
    await purgePetReminders([LOST]);
    expect(ids()).not.toContain("UUID-OLD");
  });

  it("does nothing without a pet id", async () => {
    await expect(purgePetReminders([null, undefined])).resolves.toBe(0);
    expect(mockPending).toHaveLength(6);
  });
});

describe("purgeUnlistedPetReminders (the loss happened while the app was closed)", () => {
  const relaunch = () => {
    useRoutinesStore.setState({ routines: [] });
    useRemindersStore.setState({ reminders: [], snoozes: {} });
  };

  it("cancels what is still armed for a dog the list no longer has, with empty stores", async () => {
    relaunch();
    await purgeUnlistedPetReminders([{ id: KEPT }]);
    expect(ids()).toEqual(["reminder_9_m_d1", "pawpi-daily-return", "telehealth_2_1"]);
  });

  it("forgets the snooze behind a cancelled alarm", async () => {
    relaunch();
    const later = new Date(Date.now() + 3600e3).toISOString();
    useRemindersStore.setState({ snoozes: { reminder_5_m_d1: later, reminder_9_m_d1: later } });
    await purgeUnlistedPetReminders([{ id: KEPT }]);
    expect(Object.keys(useRemindersStore.getState().snoozes)).toEqual(["reminder_9_m_d1"]);
  });

  it("touches nothing when every armed dog is listed", async () => {
    await expect(purgeUnlistedPetReminders([{ id: KEPT }, { id: LOST }])).resolves.toBe(0);
    expect(mockPending).toHaveLength(6);
  });

  it("a ONE-OFF empty list silences nothing; a second empty answer in a row does", async () => {
    await expect(purgeUnlistedPetReminders([])).resolves.toBe(0);
    expect(mockPending).toHaveLength(6);
    await purgeUnlistedPetReminders([]);
    expect(ids()).toEqual(["pawpi-daily-return", "telehealth_2_1"]);
  });

  it("an empty answer followed by a real one starts over", async () => {
    await purgeUnlistedPetReminders([]);
    await purgeUnlistedPetReminders([{ id: KEPT }, { id: LOST }]);
    await purgeUnlistedPetReminders([]);
    expect(mockPending).toHaveLength(6);
  });

  it("ignores a junk answer", async () => {
    await expect(purgeUnlistedPetReminders(undefined)).resolves.toBe(0);
    expect(mockPending).toHaveLength(6);
  });
});

describe("a re-invited dog is not lost any more", () => {
  it("clears the mark as soon as the list has it again", async () => {
    const { handleAccessLost } = require("./petAccess");
    const { QueryClient } = require("@tanstack/react-query");
    await handleAccessLost(new QueryClient(), { id: LOST, name: "Luna" });
    expect(isPetLost(LOST)).toBe(true);
    reconcileSharedPets([{ id: LOST, is_shared: true, name: "Luna" }]);
    expect(isPetLost(LOST)).toBe(false);
  });
});
