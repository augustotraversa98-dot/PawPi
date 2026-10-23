// EntryPoint recovery: a post-login failure (non-auth 5xx / network) must offer Try again AND a way
// out (Start over / back) that clears the stored session — it can never strand the user.

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

const mockReplace = jest.fn();
const mockSetAuth = jest.fn();
let mockAuth;

jest.mock("expo-router", () => ({
  Redirect: ({ href }) => {
    const { Text } = require("react-native");
    return <Text>{`redirect:${href}`}</Text>;
  },
  useRouter: () => ({ replace: mockReplace }),
}));
jest.mock("react-i18next", () => require("@/i18n/testMock").makeReactI18nextMock());
// Like the real module, setItem returns a promise (the EntryPoint no longer awaits it, it fire-and-forgets).
jest.mock("@react-native-async-storage/async-storage", () => ({ setItem: jest.fn(() => Promise.resolve()) }));
jest.mock("@/utils/auth/useAuth", () => ({ useAuth: () => mockAuth }));
jest.mock("../../__create/boot-trace", () => ({ markBootStep: jest.fn(), markBootComplete: jest.fn() }));
jest.mock("@/utils/notificationDeepLink", () => ({ markNavigationReady: jest.fn() }));
jest.mock("@/components/ui", () => ({ PawMark: () => null }));

import EntryPoint from "./index";

const GOOD = "eyJhbGciOiJkaXIifQ..abc-_1.def.ghi";

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth = { isReady: true, auth: { jwt: GOOD }, setAuth: mockSetAuth };
});

test("5xx on /api/pets → retry screen with Start over that clears auth and goes to Welcome", async () => {
  global.fetch = jest.fn((url) =>
    Promise.resolve(
      url === "/api/pets"
        ? { ok: false, status: 500, json: async () => ({}) }
        : { ok: true, status: 200, json: async () => ({ providers: [] }) },
    ),
  );
  const { findByText, getByLabelText } = render(<EntryPoint />);
  await findByText("Try again");

  fireEvent.press(await findByText("Start over"));
  expect(mockSetAuth).toHaveBeenCalledWith(null);
  expect(mockReplace).toHaveBeenCalledWith("/welcome");

  mockSetAuth.mockClear();
  mockReplace.mockClear();
  fireEvent.press(getByLabelText("Back"));
  expect(mockSetAuth).toHaveBeenCalledWith(null);
  expect(mockReplace).toHaveBeenCalledWith("/welcome");
});

test("a malformed stored token is cleared, not retried forever", async () => {
  mockAuth = { isReady: true, auth: { jwt: "bad token\nwith newline" }, setAuth: mockSetAuth };
  global.fetch = jest.fn();
  const { findByText } = render(<EntryPoint />);
  await findByText("redirect:/welcome");
  expect(mockSetAuth).toHaveBeenCalledWith(null);
  expect(global.fetch).not.toHaveBeenCalled();
});

// ── Routes once per session (hardening) ──────────────────────────────────────────────────────
// EntryPoint is a one-shot gate. A user already routed into the app must not be bounced back to
// onboarding because the gate re-ran (new `auth` object for the SAME session, or a transient
// empty /api/pets) — but a real session change (logout, "Use a different account", a fresh
// sign-in, retry after an error) must still route again.

const JWT_A = "eyJhbGciOiJkaXIifQ..aaa-_1.def.ghi";
const JWT_B = "eyJhbGciOiJkaXIifQ..bbb-_2.def.ghi";

const json = (body) => ({ ok: true, status: 200, json: async () => body });
// Programmable backend: `petsAnswer` is what GET /api/pets returns.
let petsAnswer;
function mockBackend() {
  global.fetch = jest.fn((url) => {
    if (url === "/api/pets") return Promise.resolve(json({ pets: petsAnswer }));
    return Promise.resolve(json({ providers: [] }));
  });
}
const petsCalls = () => global.fetch.mock.calls.filter(([u]) => u === "/api/pets").length;

describe("EntryPoint routes once per session", () => {
  beforeEach(() => {
    petsAnswer = [{ id: 1, name: "Mango" }];
    mockBackend();
  });

  test("a new auth OBJECT for the same JWT does not re-run the gate (no refetch, no bounce to onboarding)", async () => {
    mockAuth = { isReady: true, auth: { jwt: JWT_A }, setAuth: mockSetAuth };
    const { findByText, rerender, queryByText } = render(<EntryPoint />);
    await findByText("redirect:/(tabs)");
    expect(petsCalls()).toBe(1);

    // Same session, fresh object (store re-hydration / user-info refresh) while the backend now
    // happens to answer "no pets" — the exact shape that used to bounce a user to onboarding.
    petsAnswer = [];
    mockAuth = { isReady: true, auth: { jwt: JWT_A, user: { id: 1 } }, setAuth: mockSetAuth };
    rerender(<EntryPoint />);
    await waitFor(() => expect(queryByText("redirect:/(tabs)")).toBeTruthy());

    expect(petsCalls()).toBe(1);
    expect(queryByText("redirect:/onboarding-photo")).toBeNull();
  });

  test("logout re-routes to Welcome", async () => {
    mockAuth = { isReady: true, auth: { jwt: JWT_A }, setAuth: mockSetAuth };
    const { findByText, rerender } = render(<EntryPoint />);
    await findByText("redirect:/(tabs)");

    mockAuth = { isReady: true, auth: null, setAuth: mockSetAuth };
    rerender(<EntryPoint />);
    await findByText("redirect:/welcome");
  });

  test("logout then a fresh sign-in (new account, no pets) routes to onboarding", async () => {
    mockAuth = { isReady: true, auth: { jwt: JWT_A }, setAuth: mockSetAuth };
    const { findByText, rerender } = render(<EntryPoint />);
    await findByText("redirect:/(tabs)");

    mockAuth = { isReady: true, auth: null, setAuth: mockSetAuth };
    rerender(<EntryPoint />);
    await findByText("redirect:/welcome");

    petsAnswer = []; // fresh Google/Apple account
    mockAuth = { isReady: true, auth: { jwt: JWT_B }, setAuth: mockSetAuth };
    rerender(<EntryPoint />);
    await findByText("redirect:/onboarding-photo");
    expect(petsCalls()).toBe(2);
  });

  test('"Use a different account" (JWT A → JWT B, no logout step in between) routes again', async () => {
    mockAuth = { isReady: true, auth: { jwt: JWT_A }, setAuth: mockSetAuth };
    const { findByText, rerender } = render(<EntryPoint />);
    await findByText("redirect:/(tabs)");

    petsAnswer = [];
    mockAuth = { isReady: true, auth: { jwt: JWT_B }, setAuth: mockSetAuth };
    rerender(<EntryPoint />);
    await findByText("redirect:/onboarding-photo");
  });

  test("a failed attempt is not 'routed': Try again re-fetches and then routes", async () => {
    mockAuth = { isReady: true, auth: { jwt: JWT_A }, setAuth: mockSetAuth };
    global.fetch = jest.fn((url) =>
      Promise.resolve(
        url === "/api/pets" ? { ok: false, status: 500, json: async () => ({}) } : json({ providers: [] }),
      ),
    );
    const { findByText } = render(<EntryPoint />);
    const retry = await findByText("Try again");
    expect(petsCalls()).toBe(1);

    // Backend recovers.
    mockBackend();
    fireEvent.press(retry);
    await findByText("redirect:/(tabs)");
    expect(petsCalls()).toBe(1); // counted on the new fetch mock: exactly the retry
  });

  test("auth not ready yet → no decision, then routes once when ready", async () => {
    mockAuth = { isReady: false, auth: null, setAuth: mockSetAuth };
    const { rerender, findByText } = render(<EntryPoint />);
    expect(global.fetch).not.toHaveBeenCalled();

    mockAuth = { isReady: true, auth: { jwt: JWT_A }, setAuth: mockSetAuth };
    rerender(<EntryPoint />);
    await findByText("redirect:/(tabs)");
  });
});
