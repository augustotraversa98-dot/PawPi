import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Signup EULA gate + consent persistence (Guideline 1.2):
//  - the required Terms/Privacy checkbox gates submit (T5);
//  - on a successful sign-up the consent POST fires BEFORE the redirect, and a FAILED
//    consent POST must not block the redirect (the account already exists).
// useAuth is mocked so this isolates the form behavior.

const signUpMock = vi.fn();
vi.mock("@/utils/useAuth", () => ({
  default: () => ({ signUpWithCredentials: signUpMock }),
}));
vi.mock("@/components/auth/SocialSignInButtons", () => ({ default: () => null }));

import SignUpPage from "./page";

const STRONG = "Str0ng!Pass9";

function fillForm() {
  fireEvent.change(screen.getByPlaceholderText("Your name"), { target: { value: "Pat Owner" } });
  fireEvent.change(screen.getByPlaceholderText("your@email.com"), { target: { value: "pat@example.com" } });
  fireEvent.change(screen.getByPlaceholderText("At least 8 characters"), { target: { value: STRONG } });
  fireEvent.change(screen.getByPlaceholderText("Re-enter password"), { target: { value: STRONG } });
}

function checkAgree() {
  fireEvent.click(screen.getByLabelText("I agree to the Terms of Service and Privacy Policy"));
}

function submit() {
  fireEvent.click(screen.getByRole("button", { name: /create account/i }));
}

// jsdom forbids real navigation — replace window.location with a mutable stub so the
// component can assign href and read search without throwing.
let location;
let fetchMock;
const origLocation = window.location;

beforeEach(() => {
  vi.clearAllMocks();
  location = { href: "", search: "" };
  Object.defineProperty(window, "location", { value: location, writable: true, configurable: true });
  fetchMock = vi.fn().mockResolvedValue({ ok: true });
  global.fetch = fetchMock;
  signUpMock.mockResolvedValue({ ok: true, url: "/provider" });
});

afterEach(() => {
  Object.defineProperty(window, "location", { value: origLocation, writable: true, configurable: true });
});

describe("SignUpPage — Terms acceptance gate", () => {
  it("renders the required Terms/Privacy checkbox", () => {
    render(<SignUpPage />);
    expect(
      screen.getByLabelText("I agree to the Terms of Service and Privacy Policy"),
    ).toBeInTheDocument();
  });

  it("keeps Create account disabled until the box is checked, even with a valid form", () => {
    render(<SignUpPage />);
    fillForm();
    const btn = screen.getByRole("button", { name: /create account/i });
    expect(btn).toBeDisabled();
    checkAgree();
    expect(btn).not.toBeDisabled();
  });

  it("the checkbox starts unchecked", () => {
    render(<SignUpPage />);
    expect(
      screen.getByLabelText("I agree to the Terms of Service and Privacy Policy"),
    ).not.toBeChecked();
  });

  it("submits once the box is checked", async () => {
    render(<SignUpPage />);
    fillForm();
    checkAgree();
    submit();
    await waitFor(() => expect(signUpMock).toHaveBeenCalledTimes(1));
    expect(signUpMock.mock.calls[0][0]).toMatchObject({ redirect: false });
  });
});

describe("SignUpPage — consent persistence", () => {
  it("fires the consent POST (source web_signup) before redirecting", async () => {
    // Deferred consent fetch so we can prove the redirect waits for it.
    let resolveFetch;
    fetchMock.mockImplementation(
      () => new Promise((r) => { resolveFetch = () => r({ ok: true }); }),
    );

    render(<SignUpPage />);
    fillForm();
    checkAgree();
    submit();

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/legal/consent", expect.any(Object)),
    );
    // The POST is in flight; we have NOT redirected yet.
    expect(location.href).toBe("");
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({ source: "web_signup" });
    expect(fetchMock.mock.calls[0][1].credentials).toBe("include");

    resolveFetch();
    await waitFor(() => expect(location.href).toBe("/provider"));
  });

  it("uses source mobile_signup when the page was opened with ?callbackUrl=", async () => {
    location.search = "?callbackUrl=/api/auth/token";
    signUpMock.mockResolvedValue({ ok: true, url: "/api/auth/token" });

    render(<SignUpPage />);
    fillForm();
    checkAgree();
    submit();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ source: "mobile_signup" });
    await waitFor(() => expect(location.href).toBe("/api/auth/token"));
  });

  it("a failed consent POST does NOT block the redirect (retries once, then proceeds)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    render(<SignUpPage />);
    fillForm();
    checkAgree();
    submit();

    await waitFor(() => expect(location.href).toBe("/provider"));
    expect(fetchMock).toHaveBeenCalledTimes(2); // initial + one retry
  });

  it("a sign-up error shows a message and never calls the consent POST", async () => {
    signUpMock.mockResolvedValue({ ok: false, error: "CredentialsSignin", url: null });

    render(<SignUpPage />);
    fillForm();
    checkAgree();
    submit();

    await waitFor(() =>
      expect(screen.getByText(/already registered/i)).toBeInTheDocument(),
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(location.href).toBe("");
  });
});
