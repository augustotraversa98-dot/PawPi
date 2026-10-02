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
jest.mock("@react-native-async-storage/async-storage", () => ({ setItem: jest.fn() }));
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
