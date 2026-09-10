// Post-login hand-off (AUDIT_2026-09 A-03): the screen must delegate the routing decision to
// the EntryPoint ("/") — which owns the bounded pets/providers fetch, the retry state and
// the role-aware destination — and must never fetch or route to onboarding on its own.

import React from "react";
import { render } from "@testing-library/react-native";

let mockAuth;
const mockReplace = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn(), back: jest.fn() }),
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("react-i18next", () => require("@/i18n/testMock").makeReactI18nextMock());
jest.mock("@/components/ui", () => ({ PawMark: () => null }));
jest.mock("@/utils/auth/useAuth", () => ({ useAuth: () => mockAuth }));

import AuthSuccessRedirect from "./expo-web-success";

beforeEach(() => {
  mockReplace.mockClear();
  global.fetch = jest.fn();
});

test("authenticated → hands off to the EntryPoint, never fetching or routing to onboarding itself", () => {
  mockAuth = { isReady: true, isAuthenticated: true };

  render(<AuthSuccessRedirect />);

  expect(mockReplace).toHaveBeenCalledTimes(1);
  expect(mockReplace).toHaveBeenCalledWith("/");
  expect(global.fetch).not.toHaveBeenCalled();
});

test("not authenticated → Welcome", () => {
  mockAuth = { isReady: true, isAuthenticated: false };

  render(<AuthSuccessRedirect />);

  expect(mockReplace).toHaveBeenCalledWith("/welcome");
  expect(global.fetch).not.toHaveBeenCalled();
});

test("waits for the auth store before routing anywhere", () => {
  mockAuth = { isReady: false, isAuthenticated: false };

  const { getByText } = render(<AuthSuccessRedirect />);

  expect(mockReplace).not.toHaveBeenCalled();
  expect(getByText("Setting up your account…")).toBeTruthy();
});
