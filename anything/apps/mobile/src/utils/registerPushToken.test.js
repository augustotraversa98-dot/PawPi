// BN2 PR1 — device push-token registration. Verifies: it reuses the already-granted
// permission (no cold prompt), no-ops on a simulator / when permission is denied,
// and POSTs the resolved token to /api/push-tokens. Never throws.

jest.mock("expo-notifications", () => ({
  __esModule: true,
  getPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  getExpoPushTokenAsync: jest.fn(async () => ({ data: "ExponentPushToken[xyz]" })),
  requestPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  setNotificationHandler: jest.fn(),
  AndroidImportance: { HIGH: "high" },
  setNotificationChannelAsync: jest.fn(async () => {}),
}));
jest.mock("expo-device", () => ({ __esModule: true, isDevice: true }));
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: { eas: { projectId: "proj-123" } } } },
}));

import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import {
  registerPushTokenAsync,
  __resetRegisterPushTokenForTests,
} from "./registerPushToken";

const setIsDevice = (v) =>
  Object.defineProperty(Device, "isDevice", { value: v, configurable: true });

beforeEach(() => {
  jest.clearAllMocks();
  __resetRegisterPushTokenForTests();
  setIsDevice(true);
  Notifications.getPermissionsAsync.mockResolvedValue({ status: "granted" });
  Notifications.getExpoPushTokenAsync.mockResolvedValue({ data: "ExponentPushToken[xyz]" });
  jest.spyOn(console, "log").mockImplementation(() => {});
});

it("registers the token and POSTs it to /api/push-tokens (permission already granted)", async () => {
  const fetchImpl = jest.fn(async () => ({ ok: true, json: async () => ({ ok: true }) }));
  const token = await registerPushTokenAsync(fetchImpl);

  expect(token).toBe("ExponentPushToken[xyz]");
  expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: "proj-123" });

  expect(fetchImpl).toHaveBeenCalledTimes(1);
  const [url, init] = fetchImpl.mock.calls[0];
  expect(url).toBe("/api/push-tokens");
  expect(init.method).toBe("POST");
  expect(JSON.parse(init.body)).toMatchObject({ token: "ExponentPushToken[xyz]" });
});

it("no-ops on a simulator (Device.isDevice false)", async () => {
  setIsDevice(false);
  const fetchImpl = jest.fn();
  expect(await registerPushTokenAsync(fetchImpl)).toBeNull();
  expect(fetchImpl).not.toHaveBeenCalled();
});

it("no-ops (no prompt, no POST) when permission is not granted", async () => {
  Notifications.getPermissionsAsync.mockResolvedValueOnce({ status: "denied", granted: false });
  const fetchImpl = jest.fn();
  expect(await registerPushTokenAsync(fetchImpl)).toBeNull();
  expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  expect(fetchImpl).not.toHaveBeenCalled();
});

it("is memoized — a second call does not re-fetch or re-POST", async () => {
  const fetchImpl = jest.fn(async () => ({ ok: true }));
  await registerPushTokenAsync(fetchImpl);
  await registerPushTokenAsync(fetchImpl);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

it("never throws when the token fetch fails", async () => {
  Notifications.getExpoPushTokenAsync.mockRejectedValueOnce(new Error("no APNs"));
  const fetchImpl = jest.fn();
  expect(await registerPushTokenAsync(fetchImpl)).toBeNull();
  expect(fetchImpl).not.toHaveBeenCalled();
});
