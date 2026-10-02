import React from "react";
import { Alert } from "react-native";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

const mockReplace = jest.fn();
const mockSetAuth = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ replace: mockReplace }) }));
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k) => k }) }));
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: { multiRemove: jest.fn(() => Promise.resolve()) },
}));
jest.mock("@/utils/auth/store", () => ({
  useAuthStore: { getState: () => ({ setAuth: mockSetAuth }) },
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import UseDifferentAccountLink, { ONBOARDING_DRAFT_KEYS } from "./UseDifferentAccountLink";

describe("UseDifferentAccountLink", () => {
  beforeEach(() => jest.clearAllMocks());

  test("confirming clears the draft, the session, and goes to /welcome", async () => {
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const screen = render(<UseDifferentAccountLink />);
    fireEvent.press(screen.getByTestId("onboarding-use-different-account"));
    const buttons = alertSpy.mock.calls[0][2];
    await buttons.find((b) => b.style === "destructive").onPress();
    expect(AsyncStorage.multiRemove).toHaveBeenCalledWith(ONBOARDING_DRAFT_KEYS);
    expect(mockSetAuth).toHaveBeenCalledWith(null);
    expect(mockReplace).toHaveBeenCalledWith("/welcome");
  });

  test("cancelling leaves everything untouched", () => {
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const screen = render(<UseDifferentAccountLink />);
    fireEvent.press(screen.getByTestId("onboarding-use-different-account"));
    expect(alertSpy.mock.calls[0][2].find((b) => b.style === "cancel").onPress).toBeUndefined();
    expect(mockSetAuth).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
