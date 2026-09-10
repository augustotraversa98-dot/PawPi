// AUDIT_2026-09 A-08: notification taps must route somewhere real, exactly once.

let responseListener;
const mockGetLast = jest.fn(async () => null);
jest.mock("expo-notifications", () => ({
  addNotificationResponseReceivedListener: jest.fn((cb) => {
    responseListener = cb;
    return { remove: jest.fn() };
  }),
  getLastNotificationResponseAsync: (...a) => mockGetLast(...a),
}));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({ router: { push: (...a) => mockPush(...a) } }));

import {
  reminderTapRoute,
  pushTapRoute,
  registerNotificationTapRouting,
  markNavigationReady,
  __resetNotificationDeepLinkForTests,
} from "./notificationDeepLink";

const response = (id, data) => ({ notification: { request: { identifier: id, content: { data } } } });
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  __resetNotificationDeepLinkForTests();
  mockPush.mockClear();
  mockGetLast.mockReset().mockResolvedValue(null);
});

describe("reminderTapRoute", () => {
  test("vaccine / vet appointment reminders open the Vet Record section", () => {
    expect(reminderTapRoute({ type: "vaccine" })).toEqual({
      pathname: "/(tabs)/health",
      params: { section: "vet-record" },
    });
    expect(reminderTapRoute({ type: "vet_appointment" }).params.section).toBe("vet-record");
  });

  test("every other reminder opens Today, where the reminder is listed", () => {
    for (const type of ["feeding", "walk", "medication", "photo_check", "weight_check", undefined]) {
      expect(reminderTapRoute({ type })).toEqual({
        pathname: "/(tabs)/health",
        params: { section: "today" },
      });
    }
  });
});

describe("pushTapRoute", () => {
  test("local reminder data routes to Health", () => {
    expect(pushTapRoute({ reminderId: "r1", type: "medication" }).pathname).toBe("/(tabs)/health");
  });

  test("server pushes and unknown payloads open the in-app inbox", () => {
    expect(pushTapRoute({ type: "booking_confirmed", subjectRef: "b:1" })).toEqual({ pathname: "/notifications" });
    expect(pushTapRoute(undefined)).toEqual({ pathname: "/notifications" });
    expect(pushTapRoute("junk")).toEqual({ pathname: "/notifications" });
  });
});

describe("registerNotificationTapRouting", () => {
  test("a tap while running navigates immediately once navigation is ready", async () => {
    registerNotificationTapRouting();
    markNavigationReady();

    responseListener(response("n1", { type: "walk_request_targeted" }));

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/notifications" });
  });

  test("the launch tap is parked until the EntryPoint marks navigation ready", async () => {
    mockGetLast.mockResolvedValue(response("launch", { reminderId: "r1", type: "vaccine" }));

    registerNotificationTapRouting();
    await flush();
    expect(mockPush).not.toHaveBeenCalled();

    markNavigationReady();
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/(tabs)/health", params: { section: "vet-record" } });
  });

  test("the same response delivered through both paths navigates once", async () => {
    mockGetLast.mockResolvedValue(response("dup", { type: "x" }));
    registerNotificationTapRouting();
    markNavigationReady();
    await flush();

    responseListener(response("dup", { type: "x" }));

    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  test("unsubscribes", () => {
    const off = registerNotificationTapRouting();
    expect(typeof off).toBe("function");
    off();
  });
});
