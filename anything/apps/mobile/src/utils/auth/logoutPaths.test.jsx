// Every way a user can leave this device's session must leave NOTHING of theirs behind:
//   • every locally scheduled notification cancelled (routine reminders, walks, vet/telehealth,
//     streak-save, daily-return) — otherwise they keep firing for the previous user/pet;
//   • this device's push-token association removed for that user (DELETE /api/push-tokens, sent
//     with THEIR jwt because the stored one is dropped in the same tick).
//
// Each case drives the REAL call site (component handler / fetch wrapper / EntryPoint) against the
// REAL auth store, so a path that stopped going through useAuthStore.setAuth would fail here.
//   1 manual logout (owner menu)      4 switching account ("Use a different account")
//   2 business logout                  5 switching straight to another user (sign-in over a session)
//   3 account deletion                 6 EntryPoint clearSession (server says 401/403)
//   7 session expiry (401 on any /api call, via the fetch wrapper)

import React from "react";
import { Alert } from "react-native";
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";

jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("react-i18next", () => require("@/i18n/testMock").makeReactI18nextMock());

const mockReplace = jest.fn();
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn() }),
  router: { replace: (...a) => mockReplace(...a) },
  Redirect: ({ href }) => {
    const { Text } = require("react-native");
    return <Text>{`redirect:${href}`}</Text>;
  },
}));

// ── the device: OS notifications + push token ──
jest.mock("expo-notifications", () => ({
  __esModule: true,
  setNotificationHandler: jest.fn(),
  cancelAllScheduledNotificationsAsync: jest.fn(async () => {}),
  cancelScheduledNotificationAsync: jest.fn(async () => {}),
  getPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  getExpoPushTokenAsync: jest.fn(async () => ({ data: "ExponentPushToken[device-1]" })),
  scheduleNotificationAsync: jest.fn(async () => "os-id"),
  SchedulableTriggerInputTypes: { DATE: "date", DAILY: "daily" },
}));
jest.mock("expo-device", () => ({ __esModule: true, isDevice: true }));
jest.mock("expo-constants", () => ({ __esModule: true, default: { expoConfig: { extra: { eas: { projectId: "p" } } } } }));
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: "afu",
}));
jest.mock("expo/fetch", () => ({ fetch: jest.fn() }));

// ── the real store is used; the screens just read setAuth from it ──
jest.mock("@/utils/auth/useAuth", () => {
  const { useAuthStore } = require("@/utils/auth/store");
  return {
    useAuth: () => {
      const { auth, isReady, setAuth } = useAuthStore.getState();
      return { auth, isReady, setAuth, isAuthenticated: !!auth };
    },
  };
});
// (the real shared QueryClient is used: other code in the app reads from it, e.g. routinesStore.loadRoutines)
jest.mock("../../../__create/boot-trace", () => ({ markBootStep: jest.fn(), markBootComplete: jest.fn() }));
jest.mock("@/utils/notificationDeepLink", () => ({ markNavigationReady: jest.fn() }));
jest.mock("@/telemetry/navExpect", () => ({ markExpectedNavigation: jest.fn(), markNavigationReason: jest.fn() }));
// Layout primitives render as plain pressables; the paw mark renders nothing.
jest.mock("@/components/ui", () =>
  new Proxy(
    { __esModule: true },
    { get: (target, name) => (name in target ? target[name] : name === "PawMark" ? () => null : require("react-native").Pressable) },
  ),
);
jest.mock("@/components/Pets/PetSwitcher", () => ({ PetSwitcher: () => null }));
jest.mock("@/hooks/useProviders", () => ({
  useMyProviders: () => ({ data: [] }),
  useProviderProfile: () => ({ data: undefined, isLoading: false, isError: false, refetch: jest.fn() }),
  useProviderFollow: () => ({ data: { following: false, followersCount: 0 } }),
}));
jest.mock("@/hooks/usePetProfile", () => ({ usePetProfile: () => ({ data: [] }) }));
jest.mock("@/hooks/useActiveProvider", () => {
  const value = { activeProvider: { id: 7, slug: "s", name: "Biz", logo_url: null, bio: "" }, providers: [], isLoading: false };
  return { useActiveProvider: () => value, __esModule: true, default: () => value };
});
jest.mock("@/utils/providerPostHandoff", () => ({ stashProviderPost: jest.fn() }));
jest.mock("@/i18n/localePreference", () => ({
  getLocalePreference: jest.fn().mockResolvedValue("en"),
  setLocalePreference: jest.fn(),
}));
jest.mock("@/components/Health/WalkActivity/WalkTrackingSettings", () => () => null);
jest.mock("@/utils/businessNotificationPrefs", () => ({
  CHANNEL_GROUP: { PUSH: "push", OPTIONAL: "optional", INAPP: "inapp" },
  BUSINESS_NOTIF_CATEGORIES: [],
  BUSINESS_NOTIF_INFO_CATEGORIES: [],
  categoryDefaultEnabled: () => true,
  getBusinessNotificationPrefs: jest.fn().mockResolvedValue({}),
  setBusinessCategoryEnabled: jest.fn(),
}));

import * as Notifications from "expo-notifications";
import { fetch as expoFetch } from "expo/fetch";
import { useAuthStore } from "@/utils/auth/store";
import { __resetRegisterPushTokenForTests } from "@/utils/registerPushToken";
import { __resetSessionExpiryForTests } from "../../__create/fetch";
import fetchToWeb from "../../__create/fetch";
import { OwnerMenu } from "@/components/More/OwnerMenu";
import BusinessProfile from "@/app/business/profile";
import AppSettings from "@/components/Settings/AppSettings";
import UseDifferentAccountLink from "@/components/onboarding/UseDifferentAccountLink";
import EntryPoint from "@/app/index";

const JWT_A = "eyJhbGciOiJkaXIifQ..aaa-_1.def.ghi";
const JWT_B = "eyJhbGciOiJkaXIifQ..bbb-_2.def.ghi";
const USER_A = { jwt: JWT_A, user: { id: 1, email: "a@x.com" } };
const USER_B = { jwt: JWT_B, user: { id: 2, email: "b@x.com" } };

let pushTokenCalls;
beforeEach(() => {
  jest.clearAllMocks();
  __resetRegisterPushTokenForTests();
  __resetSessionExpiryForTests();
  process.env.EXPO_PUBLIC_BASE_URL = "https://api.test";
  pushTokenCalls = [];
  // The app-level `fetch` (everything but the wrapper test): record push-token requests, answer the rest.
  global.fetch = jest.fn(async (url, init) => {
    if (url === "/api/push-tokens") {
      pushTokenCalls.push({ method: init?.method, auth: init?.headers?.Authorization, body: init?.body });
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    }
    if (url === "/api/account") return { ok: true, status: 200, json: async () => ({}) };
    if (url === "/api/pets") return { ok: false, status: 401, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ providers: [] }) };
  });
  useAuthStore.setState({ auth: USER_A, isReady: true });
});

// Assertions shared by every path.
async function expectDeviceCleanedFor(jwt) {
  await waitFor(() => expect(Notifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalled());
  expect(useAuthStore.getState().auth === null || useAuthStore.getState().auth?.jwt !== jwt).toBe(true);
  await waitFor(() => expect(pushTokenCalls).toHaveLength(1));
  expect(pushTokenCalls[0].method).toBe("DELETE");
  expect(pushTokenCalls[0].auth).toBe(`Bearer ${jwt}`);
  expect(JSON.parse(pushTokenCalls[0].body)).toEqual({ token: "ExponentPushToken[device-1]" });
}

test("1. manual logout from the owner menu", async () => {
  const spy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  const { getByLabelText, getByText } = render(<OwnerMenu />);
  fireEvent.press(getByLabelText("Open menu"));
  fireEvent.press(getByText("Log out"));
  await act(async () => {
    await spy.mock.calls[0][2].find((b) => b.style === "destructive").onPress();
  });
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/welcome"));
  await expectDeviceCleanedFor(JWT_A);
});

test("2. business logout", async () => {
  const spy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  const { getByTestId } = render(<BusinessProfile />);
  fireEvent.press(getByTestId("business-account-logout"));
  await act(async () => {
    await spy.mock.calls[0][2].find((b) => b.style === "destructive").onPress();
  });
  expect(mockReplace).toHaveBeenCalledWith("/welcome");
  await expectDeviceCleanedFor(JWT_A);
});

test("3. account deletion", async () => {
  const spy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  const { getByTestId } = render(<AppSettings />);
  fireEvent.press(getByTestId("delete-account"));
  // two-step confirm: first dialog → second dialog → "Delete forever"
  spy.mock.calls[0][2].find((b) => b.style === "destructive").onPress();
  await act(async () => {
    await spy.mock.calls[1][2].find((b) => b.style === "destructive").onPress();
  });
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/welcome"));
  await expectDeviceCleanedFor(JWT_A);
});

test("4. switching account via 'Use a different account'", async () => {
  const spy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  const { getByTestId } = render(<UseDifferentAccountLink />);
  fireEvent.press(getByTestId("onboarding-use-different-account"));
  await act(async () => {
    await spy.mock.calls[0][2].find((b) => b.style === "destructive").onPress();
  });
  expect(mockReplace).toHaveBeenCalledWith("/welcome");
  await expectDeviceCleanedFor(JWT_A);
});

test("5. signing in as a DIFFERENT user over a live session", async () => {
  await act(async () => {
    useAuthStore.getState().setAuth(USER_B);
  });
  expect(useAuthStore.getState().auth).toEqual(USER_B);
  await expectDeviceCleanedFor(JWT_A);
});

test("6. EntryPoint clearSession (the server answers 401 to /api/pets)", async () => {
  const { findByText } = render(<EntryPoint />);
  await findByText("redirect:/welcome");
  expect(useAuthStore.getState().auth).toBeNull();
  await expectDeviceCleanedFor(JWT_A);
});

describe("7. session expiry (401 through the fetch wrapper)", () => {
  test("cancels every local notification; skips the push-token call (a dead session cannot authenticate)", async () => {
    const SecureStore = require("expo-secure-store");
    SecureStore.getItemAsync.mockResolvedValue(JSON.stringify(USER_A));
    expoFetch.mockResolvedValue({ ok: false, status: 401, headers: { get: () => "application/json" } });

    await fetchToWeb("/api/routines?petId=5");

    expect(useAuthStore.getState().auth).toBeNull();
    expect(mockReplace).toHaveBeenCalledWith("/welcome");
    await waitFor(() => expect(Notifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalled());
    // The only request through the wrapper is the 401 itself — no follow-up DELETE as the dead user.
    expect(expoFetch).toHaveBeenCalledTimes(1);
    expect(pushTokenCalls).toHaveLength(0);
  });
});

test("a logout with nobody signed in is a no-op (no cancel, no request)", async () => {
  useAuthStore.setState({ auth: null });
  await act(async () => {
    useAuthStore.getState().setAuth(null);
  });
  expect(Notifications.cancelAllScheduledNotificationsAsync).not.toHaveBeenCalled();
  expect(pushTokenCalls).toHaveLength(0);
});
