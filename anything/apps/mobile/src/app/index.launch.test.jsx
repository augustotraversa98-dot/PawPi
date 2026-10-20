// Cold-launch session handling in the EntryPoint (the "logged out every time" report):
//   • a stored token the server rejects with session_expired (or that one re-check confirms dead) is cleared and
//     the user lands on Welcome ONCE — never a flash of the home screen, never a second sign-out/navigation;
//   • anything that does not PROVE the token dead (network error, 5xx, a bare 401/403 the re-check does not
//     confirm, a re-check that fails) keeps the session and shows the retry screen instead;
//   • the launch reports, anonymously, whether a stored token was found.

import React from "react";
import { render, waitFor, fireEvent } from "@testing-library/react-native";

jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("react-i18next", () => require("@/i18n/testMock").makeReactI18nextMock());
jest.mock("@react-native-async-storage/async-storage", () => ({
  setItem: jest.fn(async () => {}),
  getItem: jest.fn(async () => null),
}));

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockReplace, back: jest.fn() }),
  router: { replace: (...a) => mockReplace(...a) },
  Redirect: ({ href }) => {
    const { Text } = require("react-native");
    return <Text>{`redirect:${href}`}</Text>;
  },
}));
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: "afu",
}));
const mockExpoFetch = jest.fn();
jest.mock("expo/fetch", () => ({ fetch: (...a) => mockExpoFetch(...a) }));

jest.mock("@/utils/auth/useAuth", () => {
  const { useAuthStore } = require("@/utils/auth/store");
  return {
    useAuth: () => {
      const { auth, isReady, setAuth } = useAuthStore();
      return { auth, isReady, setAuth, isAuthenticated: !!auth };
    },
  };
});
jest.mock("../../__create/boot-trace", () => ({ markBootStep: jest.fn(), markBootComplete: jest.fn() }));
jest.mock("@/utils/notificationDeepLink", () => ({ markNavigationReady: jest.fn() }));
jest.mock("@/telemetry/startup", () => ({ reportStartup: jest.fn() }));
jest.mock("@/telemetry/navExpect", () => ({ markExpectedNavigation: jest.fn(), markNavigationReason: jest.fn() }));
const mockTrack = jest.fn();
jest.mock("@/telemetry/track", () => ({ track: (...a) => mockTrack(...a) }));
jest.mock("@/components/ui", () => ({ PawMark: () => null }));
jest.mock("./../utils/auth/sessionCleanup", () => ({
  ...jest.requireActual("./../utils/auth/sessionCleanup"),
  cleanUpAfterIdentityChange: jest.fn(),
}));

const mockFetchPets = jest.fn();
jest.mock("@/utils/launchQueries", () => ({
  PETS_QUERY_KEY: ["pets"],
  MY_PROVIDERS_QUERY_KEY: ["providers", "mine"],
  fetchPets: (...a) => mockFetchPets(...a),
  fetchMyProviders: jest.fn(async () => []),
}));

import { useAuthStore } from "@/utils/auth/store";
import { queryClient } from "@/utils/queryClient";
import { __resetSessionExpiryForTests } from "@/utils/auth/sessionExpiry";
import { __resetSessionHealthForTests } from "@/utils/auth/sessionHealth";
import { __resetLaunchGateForTests, isLaunchGateOpen } from "@/utils/auth/sessionLaunchGate";
import EntryPoint from "@/app/index";

const AUTH = { jwt: "eyJhbGciOiJkaXIifQ..aaa-_1.def.ghi", user: { id: 1 } };
const httpError = (status, extra = {}) => Object.assign(new Error("Failed to fetch pets"), { status, ...extra });
const diag = () => mockTrack.mock.calls.filter(([n]) => n === "auth_diag").map(([, p]) => p.kind);
const recheckCalls = () => mockExpoFetch.mock.calls.filter(([u]) => String(u).endsWith("/api/session"));
const recheckAnswers = (r) => mockExpoFetch.mockImplementation(async () => {
  if (r instanceof Error) throw r;
  return r;
});

beforeEach(() => {
  jest.clearAllMocks();
  queryClient.clear();
  __resetSessionExpiryForTests();
  __resetSessionHealthForTests();
  __resetLaunchGateForTests();
  process.env.EXPO_PUBLIC_BASE_URL = "https://api.test";
  useAuthStore.setState({ auth: AUTH, isReady: true });
});

test("stale token + session_expired 401: cleared, Welcome once, no home flash, no second navigation", async () => {
  mockFetchPets.mockRejectedValue(httpError(401, { sessionExpired: true }));
  const { findByText, queryByText } = render(<EntryPoint />);

  await findByText("redirect:/welcome");

  expect(useAuthStore.getState().auth).toBeNull();
  expect(queryByText("redirect:/(tabs)")).toBeNull();
  expect(mockReplace).not.toHaveBeenCalled(); // the Redirect is the ONLY navigation
  expect(recheckCalls()).toHaveLength(0); // the code is proof enough
  expect(mockFetchPets).toHaveBeenCalledTimes(1); // no retry loop
  expect(diag()).toEqual(["launch_token_found", "session_cleared_launch_401"]);
  expect(isLaunchGateOpen()).toBe(false);
});

test("bare launch 401 that one re-check confirms dead: cleared once", async () => {
  mockFetchPets.mockRejectedValue(httpError(401));
  recheckAnswers({ ok: false, status: 401 });
  const { findByText } = render(<EntryPoint />);

  await findByText("redirect:/welcome");

  expect(recheckCalls()).toHaveLength(1);
  expect(useAuthStore.getState().auth).toBeNull();
  expect(diag()).toEqual(["launch_token_found", "session_cleared_launch_401"]);
});

test("launch 403 confirmed dead by the re-check is cleared and reported as launch_403", async () => {
  mockFetchPets.mockRejectedValue(httpError(403));
  recheckAnswers({ ok: false, status: 401 });
  const { findByText } = render(<EntryPoint />);

  await findByText("redirect:/welcome");

  expect(useAuthStore.getState().auth).toBeNull();
  expect(diag()).toEqual(["launch_token_found", "session_cleared_launch_403"]);
});

test.each([
  ["a bare 401 the re-check says is fine", httpError(401), { ok: true, status: 200 }],
  ["a bare 403 the re-check says is fine", httpError(403), { ok: true, status: 200 }],
  ["a bare 401 and a re-check that fails (offline)", httpError(401), new Error("Network request failed")],
  ["a bare 401 and a re-check 503", httpError(401), { ok: false, status: 503 }],
])("a transient failure does NOT clear the session: %s", async (_n, err, recheck) => {
  mockFetchPets.mockRejectedValue(err);
  recheckAnswers(recheck);
  const { findByText, queryByText } = render(<EntryPoint />);

  await findByText("Try again"); // the retry screen, not Welcome

  expect(useAuthStore.getState().auth).toEqual(AUTH);
  expect(queryByText("redirect:/welcome")).toBeNull();
  expect(mockReplace).not.toHaveBeenCalled();
  expect(diag()).toEqual(["launch_token_found"]);
});

test("a network error or a 500 at launch keeps the session and shows the retry screen", async () => {
  for (const err of [new Error("Network request failed"), httpError(500)]) {
    mockFetchPets.mockRejectedValue(err);
    const { findByText, unmount } = render(<EntryPoint />);
    await findByText("Try again");
    expect(useAuthStore.getState().auth).toEqual(AUTH);
    expect(recheckCalls()).toHaveLength(0);
    unmount();
  }
});

test("Try again after a transient failure routes into the app once the server answers", async () => {
  mockFetchPets.mockRejectedValueOnce(httpError(500)).mockResolvedValueOnce([{ id: 1 }]);
  const { findByText } = render(<EntryPoint />);

  fireEvent.press(await findByText("Try again"));

  await findByText("redirect:/(tabs)");
  expect(useAuthStore.getState().auth).toEqual(AUTH);
});

test("no stored token: Welcome, and the launch reports 'no token'", async () => {
  useAuthStore.setState({ auth: null, isReady: true });
  const { findByText } = render(<EntryPoint />);

  await findByText("redirect:/welcome");

  expect(mockFetchPets).not.toHaveBeenCalled();
  expect(diag()).toEqual(["launch_no_token"]);
});

test("a healthy stored token goes straight to the app (no flash of Welcome)", async () => {
  mockFetchPets.mockResolvedValue([{ id: 1 }]);
  const { findByText, queryByText } = render(<EntryPoint />);

  await findByText("redirect:/(tabs)");

  expect(queryByText("redirect:/welcome")).toBeNull();
  expect(useAuthStore.getState().auth).toEqual(AUTH);
  expect(diag()).toEqual(["launch_token_found"]);
});
