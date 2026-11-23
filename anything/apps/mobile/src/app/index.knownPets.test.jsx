// Launch routing must never throw an existing owner into the onboarding wizard on a transient/empty pets read
// (incident Oct 2026, see utils/onboardingGuard.js): when the session already knows the account's pets, an
// empty 200 is not "a new user". A genuinely new account (nothing known) must still reach onboarding.

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
const mockFetchProviders = jest.fn(async () => []);
jest.mock("@/utils/launchQueries", () => ({
  PETS_QUERY_KEY: ["pets"],
  MY_PROVIDERS_QUERY_KEY: ["providers", "mine"],
  fetchPets: (...a) => mockFetchPets(...a),
  fetchMyProviders: (...a) => mockFetchProviders(...a),
}));

import { useAuthStore } from "@/utils/auth/store";
import { queryClient } from "@/utils/queryClient";
import { __resetSessionExpiryForTests } from "@/utils/auth/sessionExpiry";
import { __resetSessionHealthForTests } from "@/utils/auth/sessionHealth";
import { __resetLaunchGateForTests, isLaunchGateOpen } from "@/utils/auth/sessionLaunchGate";
import EntryPoint from "@/app/index";

const AUTH = { jwt: "eyJhbGciOiJkaXIifQ..aaa-_1.def.ghi", user: { id: 1 } };
const DOG = { id: 7, name: "Mango" };

beforeEach(() => {
  jest.clearAllMocks();
  queryClient.clear();
  __resetSessionExpiryForTests();
  __resetSessionHealthForTests();
  __resetLaunchGateForTests();
  process.env.EXPO_PUBLIC_BASE_URL = "https://api.test";
  useAuthStore.setState({ auth: AUTH, isReady: true });
});

test("a genuinely NEW account (nothing known, empty pets) still reaches onboarding — the gate stays fail-open for new users", async () => {
  mockFetchPets.mockResolvedValue([]);
  const { findByText } = render(<EntryPoint />);

  await findByText("redirect:/onboarding-photo");
});

test("an owner whose pets are already known this session is NOT thrown into onboarding by an empty/transient pets read", async () => {
  queryClient.setQueryData(["pets"], [DOG]); // the session already read the owner's dog
  mockFetchPets.mockResolvedValue([]); // 200 with an empty list: identity not resolved / replica lag / blip
  const { findByText, queryByText } = render(<EntryPoint />);

  await findByText("redirect:/(tabs)");

  expect(queryByText("redirect:/onboarding-photo")).toBeNull();
  // the tabs keep showing the dog (the empty answer must not wipe the cache entry)
  expect(queryClient.getQueryData(["pets"])).toEqual([DOG]);
});

test("known pets + a FAILED read → retry screen, never onboarding", async () => {
  queryClient.setQueryData(["pets"], [DOG]);
  mockFetchPets.mockRejectedValue(Object.assign(new Error("Failed to fetch pets"), { status: 503 }));
  const { findByText, queryByText } = render(<EntryPoint />);

  await findByText("Try again");

  expect(queryByText("redirect:/onboarding-photo")).toBeNull();
});

test("known pets + a normal answer with pets → home (unchanged)", async () => {
  queryClient.setQueryData(["pets"], [DOG]);
  mockFetchPets.mockResolvedValue([DOG, { id: 8, name: "Luna" }]);
  const { findByText } = render(<EntryPoint />);

  await findByText("redirect:/(tabs)");
});

// ── Every case where "pets already known this session" changes the routing, and the cases that must NOT ───────────────
// (strict: this is the area of the Oct 2026 duplicate-pet incident). The cache is in-memory only and is wiped by the real
// auth store on EVERY identity change (store.js setAuth, non-refresh): login, logout, "Use a different account",
// session expiry and account deletion all pass through it.

const AUTH_B = { jwt: "eyJhbGciOiJkaXIifQ..bbb-_2.def.ghi", user: { id: 2 } };

test("an EMPTY cache entry ([]) is not 'known pets': a new account still reaches onboarding", async () => {
  queryClient.setQueryData(["pets"], []);
  mockFetchPets.mockResolvedValue([]);
  const { findByText } = render(<EntryPoint />);

  await findByText("redirect:/onboarding-photo");
});

test("an unusable cache entry (null / not an array) is not 'known pets'", async () => {
  for (const junk of [null, {}, "x"]) {
    queryClient.clear();
    queryClient.setQueryData(["pets"], junk);
    mockFetchPets.mockResolvedValue([]);
    const { findByText, unmount } = render(<EntryPoint />);
    await findByText("redirect:/onboarding-photo");
    unmount();
  }
});

test("SWITCHING account through the real auth store drops the previous account's pets: the NEW account (no dog) reaches onboarding", async () => {
  useAuthStore.getState().setAuth(AUTH); // account A signs in …
  queryClient.setQueryData(["pets"], [DOG]); // … and the app reads A's dog
  useAuthStore.getState().setAuth(AUTH_B); // "Use a different account" → B (a brand-new sign-up)
  expect(queryClient.getQueryData(["pets"])).toBeUndefined(); // the identity change wiped the cache

  mockFetchPets.mockResolvedValue([]);
  const { findByText, queryByText } = render(<EntryPoint />);

  await findByText("redirect:/onboarding-photo");
  expect(queryByText("redirect:/(tabs)")).toBeNull();
});

test("logout / account DELETION (setAuth(null)) wipes known pets: the next sign-in of a new account reaches onboarding", async () => {
  useAuthStore.getState().setAuth(AUTH);
  queryClient.setQueryData(["pets"], [DOG]);
  // Settings → Delete account: DELETE /api/account, then setAuth(null) (AppSettings.performDelete).
  useAuthStore.getState().setAuth(null);
  expect(queryClient.getQueryData(["pets"])).toBeUndefined();

  useAuthStore.getState().setAuth(AUTH_B); // a new account signs up on the same phone
  mockFetchPets.mockResolvedValue([]);
  const { findByText } = render(<EntryPoint />);

  await findByText("redirect:/onboarding-photo");
});

test("a same-user rolling token refresh KEEPS the known pets (it is not an identity change)", () => {
  useAuthStore.getState().setAuth(AUTH);
  queryClient.setQueryData(["pets"], [DOG]);
  useAuthStore.getState().applyRefreshedToken(AUTH.jwt, "eyJhbGciOiJkaXIifQ..new-_9.def.ghi");
  expect(queryClient.getQueryData(["pets"])).toEqual([DOG]);
});

test("known pets + a dead session (401 session_expired) → Welcome, never the app", async () => {
  queryClient.setQueryData(["pets"], [DOG]);
  mockFetchPets.mockRejectedValue(
    Object.assign(new Error("Failed to fetch pets"), { status: 401, sessionExpired: true, bearerSent: true }),
  );
  const { findByText, queryByText } = render(<EntryPoint />);

  await findByText("redirect:/welcome");
  expect(queryByText("redirect:/(tabs)")).toBeNull();
});

test("known pets + an empty read does not even consult the business (providers) read — the owner keeps the pet app", async () => {
  queryClient.setQueryData(["pets"], [DOG]);
  mockFetchPets.mockResolvedValue([]);
  mockFetchProviders.mockResolvedValue([{ id: 10, name: "Clinic" }]); // a both-roles account
  const { findByText, queryByText } = render(<EntryPoint />);

  await findByText("redirect:/(tabs)");
  expect(mockFetchProviders).not.toHaveBeenCalled();
  expect(queryByText("redirect:/business")).toBeNull();
});

test("a business-only account (staff, no pets, nothing known) still reaches Business home, not pet onboarding", async () => {
  mockFetchPets.mockResolvedValue([]);
  mockFetchProviders.mockResolvedValue([{ id: 10, name: "Clinic" }]);
  const { findByText } = render(<EntryPoint />);

  await findByText("redirect:/business");
});
