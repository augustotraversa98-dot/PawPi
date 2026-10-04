import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

// A provider the server doesn't list is simply not rendered (no "Coming soon" placeholders),
// "apple-native" never yields a web button, and inside the mobile auth webview nothing renders
// at all (the native Welcome screen provides the buttons). The "Or continue with" divider is
// owned by this component, so it appears only alongside a button.

const signInWithGoogle = vi.fn();
const signInWithApple = vi.fn();
vi.mock("@/utils/useAuth", () => ({
  default: () => ({ signInWithGoogle, signInWithApple }),
}));

import SocialSignInButtons from "./SocialSignInButtons";

const origLocation = window.location;

function setSearch(search) {
  Object.defineProperty(window, "location", {
    value: { search, href: "" },
    writable: true,
    configurable: true,
  });
}

function mockProviders(json) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(json),
  });
}

// Lets the providers fetch resolve and state flush, so "renders nothing" assertions are real.
async function settle() {
  await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  await new Promise((r) => setTimeout(r, 0));
}

beforeEach(() => {
  vi.clearAllMocks();
  setSearch("");
});
afterEach(() => {
  delete global.fetch;
  Object.defineProperty(window, "location", {
    value: origLocation,
    writable: true,
    configurable: true,
  });
});

describe("SocialSignInButtons", () => {
  it("google-only: renders Google + divider, no Apple, no placeholder, and triggers OAuth", async () => {
    mockProviders({ google: { id: "google" }, "apple-native": { id: "apple-native" } });
    const { container } = render(<SocialSignInButtons callbackUrl="/provider" />);
    const btn = await screen.findByTestId("oauth-google");
    fireEvent.click(btn);
    expect(signInWithGoogle).toHaveBeenCalledWith({ callbackUrl: "/provider" });
    expect(screen.queryByTestId("oauth-apple")).toBeNull();
    expect(screen.getByText("Or continue with")).toBeTruthy();
    expect(container.textContent).not.toMatch(/coming soon/i);
  });

  it("none: renders nothing at all — no buttons, no divider, no placeholders", async () => {
    mockProviders({ "credentials-signin": {}, "apple-native": {} });
    const { container } = render(<SocialSignInButtons />);
    await settle();
    expect(container.innerHTML).toBe("");
  });

  it("'apple-native' alone never renders a web Apple button", async () => {
    mockProviders({ "apple-native": { id: "apple-native" } });
    const { container } = render(<SocialSignInButtons />);
    await settle();
    expect(screen.queryByTestId("oauth-apple")).toBeNull();
    expect(container.innerHTML).toBe("");
  });

  it("renders a live Apple button only when a web 'apple' provider is listed", async () => {
    mockProviders({ apple: { id: "apple" } });
    render(<SocialSignInButtons callbackUrl="/provider" />);
    const btn = await screen.findByTestId("oauth-apple");
    fireEvent.click(btn);
    expect(signInWithApple).toHaveBeenCalledWith({ callbackUrl: "/provider" });
    expect(screen.queryByTestId("oauth-google")).toBeNull();
  });

  it("mobile webview (bridge callbackUrl): renders nothing and never fetches providers", async () => {
    setSearch("?callbackUrl=/api/auth/expo-web-success");
    mockProviders({ google: { id: "google" }, apple: { id: "apple" } });
    const { container } = render(<SocialSignInButtons />);
    await new Promise((r) => setTimeout(r, 0));
    expect(container.innerHTML).toBe("");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("mobile webview (device token callbackUrl) also renders nothing", async () => {
    setSearch("?callbackUrl=%2Fapi%2Fauth%2Ftoken");
    mockProviders({ google: { id: "google" } });
    const { container } = render(<SocialSignInButtons />);
    await new Promise((r) => setTimeout(r, 0));
    expect(container.innerHTML).toBe("");
  });

  it("standalone web with an unrelated ?callbackUrl still shows social buttons", async () => {
    setSearch("?callbackUrl=/provider/bookings");
    mockProviders({ google: { id: "google" } });
    render(<SocialSignInButtons />);
    expect(await screen.findByTestId("oauth-google")).toBeTruthy();
  });

  it("renders nothing if the providers fetch fails (no crash)", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network"));
    const { container } = render(<SocialSignInButtons />);
    await settle();
    expect(container.innerHTML).toBe("");
  });
});
