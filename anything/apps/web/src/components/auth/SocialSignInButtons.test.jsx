import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

// Ticket 2.46 — the social buttons appear ONLY for providers the server configured
// (discovered via /api/auth/providers). With none configured the disabled "Coming soon"
// placeholders show, so the page is unchanged when no keys are set.

const signInWithGoogle = vi.fn();
const signInWithApple = vi.fn();
vi.mock("@/utils/useAuth", () => ({
  default: () => ({ signInWithGoogle, signInWithApple }),
}));

import SocialSignInButtons from "./SocialSignInButtons";

function mockProviders(json) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(json),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  delete global.fetch;
});

describe("SocialSignInButtons", () => {
  it("shows disabled 'Coming soon' placeholders when no social provider is configured", async () => {
    mockProviders({ "credentials-signin": {} });
    render(<SocialSignInButtons />);
    await waitFor(() => {
      expect(screen.getByText("Continue with Google (Coming soon)")).toBeTruthy();
    });
    expect(screen.getByText("Continue with Apple (Coming soon)")).toBeTruthy();
    expect(screen.queryByTestId("oauth-google")).toBeNull();
    expect(screen.queryByTestId("oauth-apple")).toBeNull();
  });

  it("renders a live Google button when Google is configured, and triggers OAuth", async () => {
    mockProviders({ google: { id: "google" } });
    render(<SocialSignInButtons callbackUrl="/provider" />);
    const btn = await screen.findByTestId("oauth-google");
    fireEvent.click(btn);
    expect(signInWithGoogle).toHaveBeenCalledWith({ callbackUrl: "/provider" });
    // Apple stays a placeholder.
    expect(screen.getByText("Continue with Apple (Coming soon)")).toBeTruthy();
  });

  it("renders a live Apple button when Apple is configured, and triggers OAuth", async () => {
    mockProviders({ apple: { id: "apple" } });
    render(<SocialSignInButtons callbackUrl="/provider" />);
    const btn = await screen.findByTestId("oauth-apple");
    fireEvent.click(btn);
    expect(signInWithApple).toHaveBeenCalledWith({ callbackUrl: "/provider" });
  });

  it("falls back to placeholders if the providers fetch fails (no crash)", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network"));
    render(<SocialSignInButtons />);
    await waitFor(() => {
      expect(screen.getByText("Continue with Google (Coming soon)")).toBeTruthy();
    });
  });
});
