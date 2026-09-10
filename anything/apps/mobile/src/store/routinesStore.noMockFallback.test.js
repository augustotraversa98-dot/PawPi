// AUDIT_2026-09 A-13: a failed /api/routines load must leave an EMPTY list + error, never the
// sample routines (which would also generate phantom reminders).
jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  requestPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  scheduleNotificationAsync: jest.fn(async () => "notif-id"),
  cancelScheduledNotificationAsync: jest.fn(async () => {}),
  AndroidNotificationPriority: { HIGH: "high", DEFAULT: "default" },
}));
jest.mock("./socialPetStore", () => ({
  __esModule: true,
  default: { getState: () => ({ notifications: [], markNotificationRead: jest.fn(), addNotification: jest.fn() }) },
}));

import useRoutinesStore from "./routinesStore";
import useRemindersStore from "./remindersStore";

test("API failure → routines [] + error, no mock routines and no reminders", async () => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  global.fetch = jest.fn(async () => ({ ok: false, statusText: "Service Unavailable" }));

  const result = await useRoutinesStore.getState().loadRoutines(42);

  expect(result).toEqual([]);
  const state = useRoutinesStore.getState();
  expect(state.routines).toEqual([]);
  expect(state.error).toContain("Service Unavailable");
  expect(state.initialized).toBe(true);
  expect(state.loading).toBe(false);
  expect(useRemindersStore.getState().reminders).toEqual([]);
});
