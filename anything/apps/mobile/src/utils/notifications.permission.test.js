// Pure permission-state resolver. scheduleReminderNotification now guards on this
// SILENTLY (startup's initNotifications is the only place that asks), so the rule
// for "may we schedule?" must be correct for every shape getPermissionsAsync /
// requestPermissionsAsync can return — including iOS provisional (status "granted"
// with granted true) and the absent/error case (null ⇒ false).

jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  requestPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  scheduleNotificationAsync: jest.fn(async () => "notif-id"),
  cancelScheduledNotificationAsync: jest.fn(async () => {}),
  AndroidNotificationPriority: { HIGH: "high", DEFAULT: "default" },
}));

import { isNotificationPermissionGranted } from "./notifications";

describe("isNotificationPermissionGranted", () => {
  it("granted boolean true ⇒ true", () => {
    expect(isNotificationPermissionGranted({ granted: true })).toBe(true);
  });

  it('status "granted" ⇒ true', () => {
    expect(isNotificationPermissionGranted({ status: "granted" })).toBe(true);
  });

  it("granted true wins even if status is undefined (iOS provisional shape)", () => {
    expect(
      isNotificationPermissionGranted({ granted: true, status: undefined }),
    ).toBe(true);
  });

  it('status "denied" ⇒ false', () => {
    expect(
      isNotificationPermissionGranted({ status: "denied", granted: false }),
    ).toBe(false);
  });

  it('status "undetermined" ⇒ false', () => {
    expect(isNotificationPermissionGranted({ status: "undetermined" })).toBe(
      false,
    );
  });

  it("null / undefined ⇒ false (error or missing response)", () => {
    expect(isNotificationPermissionGranted(null)).toBe(false);
    expect(isNotificationPermissionGranted(undefined)).toBe(false);
  });
});
