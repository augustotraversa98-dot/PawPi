import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Signup EULA gate (Guideline 1.2, T5): account creation is blocked until the required
// Terms/Privacy checkbox is checked. useAuth is mocked so this isolates the form gate.

const signUpMock = vi.fn(() => Promise.resolve());
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

beforeEach(() => {
  vi.clearAllMocks();
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
    const submit = screen.getByRole("button", { name: /create account/i });
    expect(submit).toBeDisabled();

    fireEvent.click(
      screen.getByLabelText("I agree to the Terms of Service and Privacy Policy"),
    );
    expect(submit).not.toBeDisabled();
  });

  it("submits once the box is checked", async () => {
    render(<SignUpPage />);
    fillForm();
    fireEvent.click(
      screen.getByLabelText("I agree to the Terms of Service and Privacy Policy"),
    );
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));
    await waitFor(() => expect(signUpMock).toHaveBeenCalledTimes(1));
  });

  it("the checkbox starts unchecked", () => {
    render(<SignUpPage />);
    expect(
      screen.getByLabelText("I agree to the Terms of Service and Privacy Policy"),
    ).not.toBeChecked();
  });
});
