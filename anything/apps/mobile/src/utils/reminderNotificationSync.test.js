// Flow audit F1-09/F1-10: the 60 s reminder→bell sync must not re-create a row the owner already
// read, and the unread badge must not drift below the truth.

jest.mock("@/data/remindersData", () => ({
  REMINDER_STATUS: { COMPLETED: "completed", DISABLED: "disabled", DUE_SOON: "due_soon", DUE_NOW: "due_now", OVERDUE: "overdue", UPCOMING: "upcoming", SNOOZED: "snoozed" },
  getReminderStatus: () => "overdue",
}));
jest.mock("expo-notifications", () => ({}));

import useRemindersStore from "@/store/remindersStore";
import useSocialPetStore from "@/store/socialPetStore";
import { syncRemindersToNotifications } from "./reminderNotificationSync";

jest.mock("@/store/remindersStore", () => {
  const state = { reminders: [] };
  const hook = { getState: () => state, setState: (p) => Object.assign(state, p) };
  return { __esModule: true, default: hook };
});

const reminder = { id: "reminder_1_a", type: "feeding", title: "Breakfast", status: "upcoming", nextTriggerAt: new Date().toISOString() };

beforeEach(() => {
  useRemindersStore.setState({ reminders: [reminder] });
  useSocialPetStore.setState({ notifications: [], unreadNotificationCount: 0 });
});

describe("reminder → bell sync", () => {
  it("creates one row for an overdue reminder, and not another on the next tick", () => {
    syncRemindersToNotifications();
    syncRemindersToNotifications();
    expect(useSocialPetStore.getState().notifications).toHaveLength(1);
    expect(useSocialPetStore.getState().unreadNotificationCount).toBe(1);
  });

  it("does NOT bring the badge back after the owner read the row", () => {
    syncRemindersToNotifications();
    const [row] = useSocialPetStore.getState().notifications;
    useSocialPetStore.getState().markNotificationRead(row.id);
    expect(useSocialPetStore.getState().unreadNotificationCount).toBe(0);
    syncRemindersToNotifications(); // next 60 s tick
    expect(useSocialPetStore.getState().notifications).toHaveLength(1);
    expect(useSocialPetStore.getState().unreadNotificationCount).toBe(0);
  });
});

describe("unread counter (F1-10)", () => {
  it("marking an already-read row again does not decrement", () => {
    const s = useSocialPetStore.getState();
    s.addNotification({ id: "a", type: "x", message: "A" });
    s.addNotification({ id: "b", type: "x", message: "B" });
    expect(useSocialPetStore.getState().unreadNotificationCount).toBe(2);
    s.markNotificationRead("a");
    s.markNotificationRead("a"); // e.g. completing the reminder after opening its row
    expect(useSocialPetStore.getState().unreadNotificationCount).toBe(1);
  });
});
