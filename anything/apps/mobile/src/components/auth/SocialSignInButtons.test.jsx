import React from "react";
import { Linking } from "react-native";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

// Continuing with Apple or Google can create an account: the Terms line is always under the buttons, and a successful
// sign-in records the acceptance without ever holding up the sign-in.

const mockGoogle = jest.fn();
jest.mock("@/utils/auth/socialAuth", () => ({
  signInWithGoogle: (...args) => mockGoogle(...args),
  signInWithApple: jest.fn(),
}));
jest.mock("expo-apple-authentication", () => ({
  AppleAuthenticationButton: () => null,
  AppleAuthenticationButtonType: {},
  AppleAuthenticationButtonStyle: {},
}));
jest.mock("@/telemetry/track", () => ({ trackFunnel: jest.fn(), trackTap: jest.fn() }));
jest.mock("@/constants/legal", () => ({
  TERMS_OF_SERVICE_URL: "https://legal.test/terms",
  PRIVACY_POLICY_URL: "https://legal.test/privacy",
}));
let mockLanguage = "en";
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key) => key, i18n: { language: mockLanguage } }),
}));

import { SocialSignInButtons } from "./SocialSignInButtons";

const originalFetch = global.fetch;
const session = { jwt: "new-session-token", user: { id: "7" } };
const setup = () => {
  const onAuthenticated = jest.fn();
  const screen = render(<SocialSignInButtons showGoogle showApple={false} onAuthenticated={onAuthenticated} />);
  return { ...screen, onAuthenticated };
};

beforeEach(() => {
  jest.clearAllMocks();
  mockLanguage = "en";
  global.fetch = jest.fn().mockResolvedValue({ ok: true });
});
afterAll(() => {
  global.fetch = originalFetch;
});

describe("SocialSignInButtons: Terms acceptance", () => {
  it("shows the Terms line with links to both documents, in the app's language", () => {
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue();
    const { getByTestId, getByText } = setup();
    expect(getByTestId("social-terms")).toBeTruthy();
    fireEvent.press(getByText("welcome.social.terms"));
    expect(open).toHaveBeenCalledWith("https://legal.test/terms?lang=en");

    mockLanguage = "es";
    const spanish = render(<SocialSignInButtons showGoogle showApple={false} onAuthenticated={jest.fn()} />);
    fireEvent.press(spanish.getByText("welcome.social.privacy"));
    expect(open).toHaveBeenCalledWith("https://legal.test/privacy");
  });

  it("records the acceptance with the new session's token after a successful sign-in", async () => {
    mockGoogle.mockResolvedValue(session);
    const { getByLabelText, onAuthenticated } = setup();
    fireEvent.press(getByLabelText("welcome.social.continueGoogle"));
    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledWith(session));
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe("/api/legal/consent");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer new-session-token");
    expect(JSON.parse(init.body)).toEqual({ source: "mobile_social" });
  });

  it("records nothing when the owner cancels", async () => {
    mockGoogle.mockResolvedValue(null);
    const { getByLabelText, onAuthenticated } = setup();
    fireEvent.press(getByLabelText("welcome.social.continueGoogle"));
    await waitFor(() => expect(mockGoogle).toHaveBeenCalled());
    expect(onAuthenticated).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("still signs in when the acceptance cannot be saved, after one retry", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    global.fetch = jest.fn().mockRejectedValue(new Error("offline"));
    mockGoogle.mockResolvedValue(session);
    const { getByLabelText, onAuthenticated } = setup();
    fireEvent.press(getByLabelText("welcome.social.continueGoogle"));
    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledWith(session));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    warn.mockRestore();
  });
});
