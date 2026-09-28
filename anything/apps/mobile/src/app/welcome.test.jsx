import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

// The Terms/Privacy acceptance checkbox now lives ONLY on the create-account form (web WebView);
// the welcome screen no longer gates anything. "Create account" opens the signup flow directly.

const mockOpen = jest.fn();
jest.mock("@/utils/auth/store", () => ({
  useAuthModal: () => ({ open: mockOpen }),
  useAuthStore: (selector) => selector({ setAuth: jest.fn() }),
}));
// Social sign-in is exercised in its own tests; here we only need Welcome to render without
// pulling native modules (expo-apple-authentication) or firing the /api/auth/social-enabled probe.
jest.mock("@/utils/auth/useSocialProviders", () => ({
  useSocialProviders: () => ({ showGoogle: false, showApple: false, loaded: true }),
}));
jest.mock("@/components/auth/SocialSignInButtons", () => ({
  SocialSignInButtons: () => null,
}));
jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn() }) }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import WelcomeScreen from "./welcome";

beforeEach(() => {
  jest.clearAllMocks();
});

describe("WelcomeScreen", () => {
  it("opens the signup flow directly when Create account is pressed", () => {
    const { getByLabelText } = render(<WelcomeScreen />);
    fireEvent.press(getByLabelText("welcome.createAccount"));
    expect(mockOpen).toHaveBeenCalledWith({ mode: "signup" });
  });

  // Password recovery is now a real backed flow (/api/account/forgot-password). The auth modal
  // maps `mode` straight onto `${baseURL}/account/${mode}`, so this mode string IS the route —
  // if it drifts, the WebView 404s instead of showing the reset screen.
  it("opens the forgot-password screen when Forgot password? is pressed", () => {
    const { getByLabelText } = render(<WelcomeScreen />);
    fireEvent.press(getByLabelText("welcome.forgotPassword"));
    expect(mockOpen).toHaveBeenCalledWith({ mode: "forgot-password" });
  });
});
