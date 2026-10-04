import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// Hosted sign-in page: no "Coming soon" placeholders ever, the "Or continue with" divider
// only when a social button actually renders, and no social UI inside the mobile webview.
// SocialSignInButtons is the REAL component here (only useAuth is mocked).

vi.mock("@/utils/useAuth", () => ({
  default: () => ({
    signInWithCredentials: vi.fn(),
    signInWithGoogle: vi.fn(),
    signInWithApple: vi.fn(),
  }),
}));

import SignInPage from "./page";

const origLocation = window.location;

function setSearch(search) {
  Object.defineProperty(window, "location", {
    value: { search, href: "" },
    writable: true,
    configurable: true,
  });
}

function mockProviders(json) {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(json) });
}

beforeEach(() => setSearch(""));
afterEach(() => {
  delete global.fetch;
  Object.defineProperty(window, "location", {
    value: origLocation,
    writable: true,
    configurable: true,
  });
});

describe("SignInPage — social sign-in", () => {
  it("standalone web, google listed: Google + divider, no 'Coming soon', no Apple", async () => {
    mockProviders({ google: {}, "apple-native": {} });
    render(<SignInPage />);
    expect(await screen.findByTestId("oauth-google")).toBeTruthy();
    expect(screen.getByText("Or continue with")).toBeTruthy();
    expect(screen.queryByTestId("oauth-apple")).toBeNull();
    expect(document.body.textContent).not.toMatch(/coming soon/i);
  });

  it("standalone web, no social providers: no buttons, no divider, no 'Coming soon'", async () => {
    mockProviders({ "credentials-signin": {}, "apple-native": {} });
    render(<SignInPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText("Or continue with")).toBeNull();
    expect(screen.queryByTestId("oauth-google")).toBeNull();
    expect(document.body.textContent).not.toMatch(/coming soon/i);
    // credentials path untouched
    expect(screen.getByRole("button", { name: /log in/i })).toBeTruthy();
  });

  it("mobile webview: no social buttons and no divider even if providers exist", async () => {
    setSearch("?callbackUrl=/api/auth/expo-web-success");
    mockProviders({ google: {}, apple: {} });
    render(<SignInPage />);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText("Or continue with")).toBeNull();
    expect(screen.queryByTestId("oauth-google")).toBeNull();
    expect(screen.queryByTestId("oauth-apple")).toBeNull();
    expect(screen.getByRole("button", { name: /log in/i })).toBeTruthy();
  });
});
