import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { Alert } from "react-native";

// Welcome EULA gate (Guideline 1.2, T5): you can't open the signup flow until the required
// Terms/Privacy checkbox is checked.

const mockOpen = jest.fn();
jest.mock("@/utils/auth/store", () => ({
  useAuthModal: () => ({ open: mockOpen }),
}));
jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("lucide-react-native", () => {
  const React = require("react");
  const { Text } = require("react-native");
  return new Proxy({}, { get: (_t, name) => (props) => React.createElement(Text, null, String(name)) });
});

import WelcomeScreen from "./welcome";

const TERMS_LABEL = "I agree to the Terms of Service and Privacy Policy";

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});

describe("WelcomeScreen — Terms acceptance gate", () => {
  it("blocks Create account until the box is checked (alerts instead of opening signup)", () => {
    const { getByLabelText } = render(<WelcomeScreen />);
    fireEvent.press(getByLabelText("Create account"));
    expect(mockOpen).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalled();
  });

  it("opens the signup flow once the box is checked", () => {
    const { getByLabelText } = render(<WelcomeScreen />);
    fireEvent.press(getByLabelText(TERMS_LABEL));
    fireEvent.press(getByLabelText("Create account"));
    expect(mockOpen).toHaveBeenCalledWith({ mode: "signup" });
  });
});
