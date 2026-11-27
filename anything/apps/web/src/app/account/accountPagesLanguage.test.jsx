import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

// The account pages follow the visitor's language: the phone or browser setting, or the ?lang= the app sends.

vi.mock("@/utils/useAuth", () => ({
  default: () => ({ signInWithCredentials: vi.fn(), signUpWithCredentials: vi.fn() }),
}));
vi.mock("@/components/auth/SocialSignInButtons", () => ({ default: () => null }));

import SignInPage from "./signin/page";
import SignUpPage from "./signup/page";
import ForgotPasswordPage from "./forgot-password/page";
import ResetPasswordPage from "./reset-password/page";

function browser({ languages, search = "" }) {
  vi.spyOn(window.navigator, "languages", "get").mockReturnValue(languages);
  window.history.replaceState({}, "", `/account/signin${search}`);
}
afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState({}, "", "/");
});

const PAGES = [
  ["sign in", SignInPage, "¡Hola de nuevo!", "Welcome Back"],
  ["sign up", SignUpPage, "Creá la cuenta de tu negocio o veterinaria", "Create the account for your business or clinic"],
  ["forgot password", ForgotPasswordPage, "¿Olvidaste tu contraseña?", "Forgot Password?"],
  ["reset password", ResetPasswordPage, "El enlace está incompleto", "This link is incomplete"],
];

describe.each(PAGES)("the %s page", (_name, Page, spanish, english) => {
  const show = () => render(<MemoryRouter><Page /></MemoryRouter>);

  it("is Spanish for a Spanish phone", () => {
    browser({ languages: ["es-AR", "es"] });
    show();
    expect(screen.getByText(spanish)).toBeInTheDocument();
    expect(screen.queryByText(english)).toBeNull();
  });

  it("is English for an English phone", () => {
    browser({ languages: ["en-US"] });
    show();
    expect(screen.getByText(english)).toBeInTheDocument();
  });

  it("follows ?lang= over the phone setting", () => {
    browser({ languages: ["en-US"], search: "?lang=es" });
    show();
    expect(screen.getByText(spanish)).toBeInTheDocument();
  });
});

describe.each([
  ["sign in", SignInPage, "Sign in to continue", "Sign in to manage your business"],
  ["sign up", SignUpPage, "Join the PawPi community", "Create the account for your business or clinic"],
])("the %s page and who it is for", (_name, Page, inApp, onWebsite) => {
  it("on the website says it is for businesses and vets, and sends pet owners to the app", () => {
    browser({ languages: ["en-US"] });
    render(<Page />);
    expect(screen.getByText("For businesses & vets")).toBeInTheDocument();
    expect(screen.getByText(onWebsite)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Get the PawPi app" }).getAttribute("href")).toContain("apps.apple.com");
  });

  it("inside the app stays the pet owner's page", () => {
    browser({ languages: ["en-US"], search: "?callbackUrl=/api/auth/token&lang=en" });
    render(<Page />);
    expect(screen.getByText(inApp)).toBeInTheDocument();
    expect(screen.queryByText("For businesses & vets")).toBeNull();
    expect(screen.queryByRole("link", { name: "Get the PawPi app" })).toBeNull();
  });
});

describe("a sign-in that failed away from the page", () => {
  it("explains an email that already has an account", () => {
    browser({ languages: ["es-AR"], search: "?error=OAuthAccountNotLinked" });
    render(<SignInPage />);
    expect(screen.getByText(/Ya hay una cuenta de PawPi con ese email/)).toBeInTheDocument();
  });

  it("shows the general message for any other code", () => {
    browser({ languages: ["en-US"], search: "?error=Configuration" });
    render(<SignInPage />);
    expect(screen.getByText("Something went wrong. Please try again.")).toBeInTheDocument();
  });
});

describe("links between the account pages", () => {
  it("keep the language the app asked for", () => {
    browser({ languages: ["es-AR"], search: "?callbackUrl=/api/auth/token&lang=en" });
    render(<SignInPage />);
    expect(screen.getByRole("link", { name: "Forgot password?" })).toHaveAttribute("href", "/account/forgot-password?lang=en");
    expect(screen.getByRole("link", { name: "Create account" }).getAttribute("href")).toContain("lang=en");
  });
});
