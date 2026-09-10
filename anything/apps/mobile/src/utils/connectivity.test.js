// AUDIT_2026-09 A-06 / A-16: React-Query must learn about offline + background from RN.

let netInfoListener;
jest.mock("@react-native-community/netinfo", () => ({
  __esModule: true,
  default: {
    addEventListener: jest.fn((cb) => {
      netInfoListener = cb;
      return () => {
        netInfoListener = null;
      };
    }),
  },
}));

import { AppState } from "react-native";
import { focusManager, onlineManager } from "@tanstack/react-query";
import { wireQueryConnectivity, __resetConnectivityForTests } from "./connectivity";

let appStateListener;

beforeEach(() => {
  __resetConnectivityForTests();
  jest
    .spyOn(AppState, "addEventListener")
    .mockImplementation((_type, cb) => {
      appStateListener = cb;
      return { remove: jest.fn() };
    });
  wireQueryConnectivity();
});

afterEach(() => {
  jest.restoreAllMocks();
  onlineManager.setOnline(true);
  focusManager.setFocused(undefined);
});

test("NetInfo drives onlineManager (unknown is treated as online)", () => {
  expect(onlineManager.isOnline()).toBe(true);

  netInfoListener({ isConnected: false, isInternetReachable: false });
  expect(onlineManager.isOnline()).toBe(false);

  netInfoListener({ isConnected: true, isInternetReachable: null });
  expect(onlineManager.isOnline()).toBe(true);

  netInfoListener({ isConnected: true, isInternetReachable: false });
  expect(onlineManager.isOnline()).toBe(false);
});

test("AppState drives focusManager so background polling stops", () => {
  expect(focusManager.isFocused()).toBe(true);

  appStateListener("background");
  expect(focusManager.isFocused()).toBe(false);

  appStateListener("active");
  expect(focusManager.isFocused()).toBe(true);
});

test("wiring is idempotent", () => {
  const before = AppState.addEventListener.mock.calls.length;
  wireQueryConnectivity();
  wireQueryConnectivity();
  expect(AppState.addEventListener.mock.calls.length).toBe(before);
});
