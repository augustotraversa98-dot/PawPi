// Identity-change cleanup (docs: utils/auth/sessionCleanup.js). Everything on the device that
// belongs to the user going away is removed: every locally scheduled notification, the push-token
// association (sent with the OLD jwt), the in-memory routines/reminders, and in-flight work.

const mockCancelAll = jest.fn(async () => {});
const mockCancelDaily = jest.fn(async () => {});
const mockCancelOne = jest.fn(async () => {});
const mockSchedule = jest.fn(async () => "os-id");
jest.mock("@/utils/notifications", () => ({
  cancelAllNotifications: (...a) => mockCancelAll(...a),
  cancelDailyReturnReminder: (...a) => mockCancelDaily(...a),
  cancelNotification: (...a) => mockCancelOne(...a),
  scheduleReminderNotification: (...a) => mockSchedule(...a),
  resolveReminderTiming: () => null,
}));

const mockUnregister = jest.fn(async () => true);
const mockResetRegistration = jest.fn();
jest.mock("@/utils/registerPushToken", () => ({
  unregisterPushTokenAsync: (...a) => mockUnregister(...a),
  resetPushTokenRegistration: (...a) => mockResetRegistration(...a),
}));

import {
  cleanUpAfterIdentityChange,
  identityKey,
  isIdentityChange,
} from "./sessionCleanup";
import { getSessionEpoch, markSessionExpired } from "./sessionEpoch";
import useRoutinesStore from "@/store/routinesStore";
import useRemindersStore from "@/store/remindersStore";
import useSocialPetStore from "@/store/socialPetStore";

const A = { jwt: "jwt-A", user: { id: 1 } };
const B = { jwt: "jwt-B", user: { id: 2 } };

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "warn").mockImplementation(() => {});
  useRoutinesStore.setState({ routines: [{ id: "r1", petId: "5" }], initialized: true, loading: false, error: null });
  useRemindersStore.setState({
    reminders: [{ id: "reminder_r1_x", scheduledNotificationId: "os-1" }],
    snoozes: { reminder_r1_x: "2099-01-01T00:00:00.000Z" },
  });
  useSocialPetStore.setState({
    notifications: [{ id: "n1", reminderId: "reminder_r1_x", read: false }],
    unreadNotificationCount: 1,
  });
});

describe("identity change detection", () => {
  it("keys on auth_users.id, falling back to the jwt", () => {
    expect(identityKey(A)).toBe("u:1");
    expect(identityKey({ jwt: "x" })).toBe("j:x");
    expect(identityKey(null)).toBeNull();
  });

  it("logout and switching user are identity changes; first login and a same-user refresh are not", () => {
    expect(isIdentityChange(A, null)).toBe(true);
    expect(isIdentityChange(A, B)).toBe(true);
    expect(isIdentityChange(null, A)).toBe(false);
    expect(isIdentityChange(A, { jwt: "jwt-A2", user: { id: 1 } })).toBe(false);
  });
});

describe("cleanUpAfterIdentityChange", () => {
  it("cancels every scheduled notification and the daily-return reminder", async () => {
    await cleanUpAfterIdentityChange(A);
    expect(mockCancelAll).toHaveBeenCalledTimes(1);
    expect(mockCancelDaily).toHaveBeenCalledTimes(1);
  });

  it("unregisters the push token with the OLD jwt and resets the once-per-session memo", async () => {
    await cleanUpAfterIdentityChange(A);
    expect(mockResetRegistration).toHaveBeenCalledTimes(1);
    expect(mockUnregister).toHaveBeenCalledWith({ jwt: "jwt-A" });
  });

  it("skips the server call (but still resets) when the session already expired (401)", async () => {
    markSessionExpired();
    await cleanUpAfterIdentityChange(A);
    expect(mockUnregister).not.toHaveBeenCalled();
    expect(mockResetRegistration).toHaveBeenCalledTimes(1);
    expect(mockCancelAll).toHaveBeenCalledTimes(1);
    // one-shot: the next logout unregisters again
    await cleanUpAfterIdentityChange(B);
    expect(mockUnregister).toHaveBeenCalledWith({ jwt: "jwt-B" });
  });

  it("empties the in-memory routines and reminders (incl. snoozes) so the next user starts clean", async () => {
    await cleanUpAfterIdentityChange(A);
    expect(useRoutinesStore.getState().routines).toEqual([]);
    expect(useRoutinesStore.getState().initialized).toBe(false);
    expect(useRemindersStore.getState().reminders).toEqual([]);
    expect(useRemindersStore.getState().snoozes).toEqual({});
  });

  it("clears the local reminder rows in the in-app notification centre", async () => {
    await cleanUpAfterIdentityChange(A);
    expect(useSocialPetStore.getState().notifications).toEqual([]);
    expect(useSocialPetStore.getState().unreadNotificationCount).toBe(0);
  });

  it("bumps the session epoch so in-flight work for the old user is abandoned", async () => {
    const before = getSessionEpoch();
    await cleanUpAfterIdentityChange(A);
    expect(getSessionEpoch()).toBe(before + 1);
  });

  it("never throws and a failing step does not block the others", async () => {
    mockCancelAll.mockRejectedValueOnce(new Error("boom"));
    mockUnregister.mockRejectedValueOnce(new Error("offline"));
    await expect(cleanUpAfterIdentityChange(A)).resolves.toBeUndefined();
    expect(mockCancelDaily).toHaveBeenCalled();
    expect(useRemindersStore.getState().reminders).toEqual([]);
  });
});
