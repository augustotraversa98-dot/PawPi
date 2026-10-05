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
  unregisterPushTokenAsync,
  resetPushTokenRegistration,
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

// ── Logout: remove this device's association for the signing-out user ──────────────────────
describe("unregisterPushTokenAsync (logout)", () => {
  it("DELETEs the registered token with the OLD user's jwt passed explicitly", async () => {
    const postImpl = jest.fn(async () => ({ ok: true }));
    await registerPushTokenAsync(postImpl);

    const del = jest.fn(async () => ({ ok: true }));
    expect(await unregisterPushTokenAsync({ jwt: "jwt-A", fetchImpl: del })).toBe(true);

    expect(del).toHaveBeenCalledTimes(1);
    const [url, init] = del.mock.calls[0];
    expect(url).toBe("/api/push-tokens");
    expect(init.method).toBe("DELETE");
    // The stored jwt is deleted in the same tick as the logout, so it must ride on the request.
    expect(init.headers.Authorization).toBe("Bearer jwt-A");
    expect(JSON.parse(init.body)).toEqual({ token: "ExponentPushToken[xyz]" });
  });

  it("resolves the token itself when this process never registered (registered in an earlier launch)", async () => {
    const del = jest.fn(async () => ({ ok: true }));
    expect(await unregisterPushTokenAsync({ jwt: "jwt-A", fetchImpl: del })).toBe(true);
    expect(JSON.parse(del.mock.calls[0][1].body)).toEqual({ token: "ExponentPushToken[xyz]" });
  });

  it("no-ops without a jwt (nobody to authenticate as), on a simulator, and when permission was declined", async () => {
    const del = jest.fn();
    expect(await unregisterPushTokenAsync({ fetchImpl: del })).toBe(false);

    setIsDevice(false);
    expect(await unregisterPushTokenAsync({ jwt: "jwt-A", fetchImpl: del })).toBe(false);

    setIsDevice(true);
    Notifications.getPermissionsAsync.mockResolvedValueOnce({ status: "denied", granted: false });
    expect(await unregisterPushTokenAsync({ jwt: "jwt-A", fetchImpl: del })).toBe(false);
    expect(del).not.toHaveBeenCalled();
  });

  it("never throws on a network failure", async () => {
    const del = jest.fn(async () => {
      throw new Error("offline");
    });
    expect(await unregisterPushTokenAsync({ jwt: "jwt-A", fetchImpl: del })).toBe(false);
  });
});

describe("resetPushTokenRegistration (next user on the same device)", () => {
  it("lets the NEXT signed-in user register again instead of reusing the previous user's memo", async () => {
    const fetchImpl = jest.fn(async () => ({ ok: true }));
    await registerPushTokenAsync(fetchImpl); // user A
    await registerPushTokenAsync(fetchImpl); // still A: memoized
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    resetPushTokenRegistration(); // A logged out

    await registerPushTokenAsync(fetchImpl); // user B
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
