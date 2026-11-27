import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ACCOUNT_COPY } from "@/lib/account/copy";
import { LANG_STORAGE_KEY, resetVisitorLang } from "@/lib/publicPet/langStore";

// The website's business sign-up and sign-in pages open in the browser's language and carry an ES / EN switch.
// Switching changes the words only: what is typed stays, a shown message follows, and the sign-up sends the same data.

const signUpMock = vi.fn();
const signInMock = vi.fn();
vi.mock("@/utils/useAuth", () => ({
  default: () => ({ signUpWithCredentials: signUpMock, signInWithCredentials: signInMock }),
}));
vi.mock("@/components/auth/SocialSignInButtons", () => ({ default: () => null }));

import SignInPage from "./signin/page";
import SignUpPage from "./signup/page";

const STRONG = "Str0ng!Pass9";
const BROWSERS = { es: ["es-AR", "es"], en: ["en-US"] };

let fetchMock;

function visit(path, languages) {
  vi.spyOn(window.navigator, "languages", "get").mockReturnValue(languages);
  window.history.replaceState({}, "", path);
}

beforeEach(() => {
  vi.clearAllMocks();
  resetVisitorLang();
  fetchMock = vi.fn().mockResolvedValue({ ok: true });
  global.fetch = fetchMock;
  // A hash target: jsdom can "navigate" there.
  signUpMock.mockResolvedValue({ ok: true, url: "#provider" });
});

afterEach(() => {
  vi.restoreAllMocks();
  resetVisitorLang();
  window.history.replaceState({}, "", "/");
});

const switchTo = (lang) => fireEvent.click(screen.getByRole("button", { name: lang.toUpperCase() }));
const type = (placeholder, value) =>
  fireEvent.change(screen.getByPlaceholderText(placeholder), { target: { value } });

function fillSignUp(lang, { name = "Pat Owner", confirm = STRONG, agree = true } = {}) {
  const copy = ACCOUNT_COPY[lang];
  type(copy.signup.namePlaceholder, name);
  type(copy.emailPlaceholder, "pat@example.com");
  type(copy.password.atLeastPlaceholder, STRONG);
  type(copy.password.reenter, confirm);
  if (agree) fireEvent.click(screen.getByRole("checkbox"));
}

// The form's own submit event: it also reaches the messages that the disabled button keeps a click from reaching.
const submitForm = () => fireEvent.submit(document.querySelector("form"));

describe("the business sign-up page's language switch", () => {
  it("starts in Spanish for an es-AR browser, goes to English and back", () => {
    visit("/account/signup", BROWSERS.es);
    render(<SignUpPage />);

    expect(screen.getByRole("heading", { name: "Crear cuenta" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Idioma" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ES" })).toHaveAttribute("aria-pressed", "true");
    expect(document.documentElement.lang).toBe("es-AR");

    switchTo("en");
    expect(screen.getByRole("heading", { name: "Create Account" })).toBeInTheDocument();
    expect(screen.getByText("Create the account for your business or clinic")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Language" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "EN" })).toHaveAttribute("aria-pressed", "true");
    expect(document.documentElement.lang).toBe("en");
    expect(window.localStorage.getItem(LANG_STORAGE_KEY)).toBe("en");

    switchTo("es");
    expect(screen.getByRole("heading", { name: "Crear cuenta" })).toBeInTheDocument();
    expect(screen.queryByText("Create the account for your business or clinic")).toBeNull();
    expect(window.localStorage.getItem(LANG_STORAGE_KEY)).toBe("es");
  });

  it("keeps the page the visitor came for, and carries the choice to the sign-in link", () => {
    visit("/account/signup?callbackUrl=%2Fvet-invite", BROWSERS.es);
    render(<SignUpPage />);
    switchTo("en");

    const href = screen.getByRole("link", { name: "Log in" }).getAttribute("href");
    const query = new URLSearchParams(href.split("?")[1]);
    expect(href.startsWith("/account/signin?")).toBe(true);
    expect(query.get("callbackUrl")).toBe("/vet-invite");
    expect(query.get("lang")).toBe("en");
  });

  it("keeps what was typed and the accepted terms, without submitting", () => {
    visit("/account/signup", BROWSERS.es);
    render(<SignUpPage />);
    fillSignUp("es");
    switchTo("en");

    expect(screen.getByPlaceholderText("Your name")).toHaveValue("Pat Owner");
    expect(screen.getByPlaceholderText("your@email.com")).toHaveValue("pat@example.com");
    expect(screen.getByPlaceholderText("Re-enter password")).toHaveValue(STRONG);
    expect(screen.getByRole("checkbox")).toBeChecked();
    expect(signUpMock).not.toHaveBeenCalled();
  });

  it("is not added to the pet owner's page inside the app", () => {
    visit("/account/signup?callbackUrl=/api/auth/token&lang=es", BROWSERS.es);
    render(<SignUpPage />);
    expect(screen.queryByRole("group", { name: "Idioma" })).toBeNull();
    expect(screen.queryByRole("button", { name: "EN" })).toBeNull();
  });
});

describe.each([
  ["Spanish", "es", null],
  ["English", "en", null],
  ["switched to English", "es", "en"],
  ["switched to Spanish", "en", "es"],
])("signing up a business in %s", (_name, browserLang, switched) => {
  it("sends the same account and consent", async () => {
    visit("/account/signup", BROWSERS[browserLang]);
    render(<SignUpPage />);
    if (switched) switchTo(switched);
    const lang = switched ?? browserLang;
    fillSignUp(lang, { name: "  Pat Owner  " });
    fireEvent.click(screen.getByRole("button", { name: ACCOUNT_COPY[lang].createAccount }));

    await waitFor(() => expect(window.location.hash).toBe("#provider"));
    expect(signUpMock.mock.calls).toEqual([
      [
        {
          name: "Pat Owner",
          email: "pat@example.com",
          password: STRONG,
          callbackUrl: "/provider",
          redirect: false,
        },
      ],
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/legal/consent");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ source: "web_signup" });
  });
});

describe.each([
  ["a missing name", { name: " " }, null, (c) => c.signup.missingName],
  ["passwords that differ", { confirm: "Other!Pass99" }, null, (c) => c.signup.mismatch],
  ["terms not accepted", { agree: false }, null, (c) => c.signup.mustAccept],
  ["an email already registered", {}, () => ({ ok: false, error: "CredentialsSignin" }), (c) => c.signup.errors.CredentialsSignin],
  ["a code with no message of its own", {}, () => ({ ok: false, error: "Configuration" }), (c) => c.genericError],
  ["no answer at all", {}, () => undefined, (c) => c.genericError],
  [
    "a request that throws",
    {},
    () => {
      throw new Error("Unexpected end of JSON input");
    },
    (c) => c.genericError,
  ],
  [
    "a thrown account error",
    {},
    () => {
      throw new Error("EmailCreateAccount");
    },
    (c) => c.signup.errors.EmailCreateAccount,
  ],
])("a sign-up with %s", (_name, form, answer, message) => {
  it.each(["es", "en"])("says so in %s, and in the other language after a switch", async (lang) => {
    const other = lang === "es" ? "en" : "es";
    if (answer) signUpMock.mockImplementation(async () => answer());
    visit("/account/signup", BROWSERS[lang]);
    render(<SignUpPage />);
    fillSignUp(lang, form);
    submitForm();

    expect(await screen.findByText(message(ACCOUNT_COPY[lang]))).toBeInTheDocument();
    switchTo(other);
    expect(screen.getByText(message(ACCOUNT_COPY[other]))).toBeInTheDocument();
    expect(screen.queryByText(message(ACCOUNT_COPY[lang]))).toBeNull();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(signUpMock).toHaveBeenCalledTimes(answer ? 1 : 0);
  });
});

describe("a password the rule refuses", () => {
  it("is explained in the language on screen", async () => {
    visit("/account/signup", BROWSERS.es);
    render(<SignUpPage />);
    fillSignUp("es");
    type("Al menos 8 caracteres", "short");
    type("Repetí la contraseña", "short");
    submitForm();

    expect(await screen.findByText("Usá al menos 8 caracteres")).toBeInTheDocument();
    switchTo("en");
    expect(screen.getByText("Use at least 8 characters")).toBeInTheDocument();
    expect(screen.queryByText("Usá al menos 8 caracteres")).toBeNull();
  });
});

describe("the business sign-in page's language switch", () => {
  it("goes between the languages, and a shown message follows", async () => {
    visit("/account/signin", BROWSERS.es);
    render(<SignInPage />);
    submitForm();
    expect(await screen.findByText("Completá todos los campos")).toBeInTheDocument();

    switchTo("en");
    expect(screen.getByRole("heading", { name: "Welcome Back" })).toBeInTheDocument();
    expect(screen.getByText("Please fill in all fields")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create account" })).toHaveAttribute("href", "/account/signup?lang=en");
    expect(screen.getByRole("link", { name: "Forgot password?" })).toHaveAttribute(
      "href",
      "/account/forgot-password?lang=en",
    );

    switchTo("es");
    expect(screen.getByText("Completá todos los campos")).toBeInTheDocument();
  });

  it.each(["es", "en"])("a failed sign-in is explained in %s and follows a switch", async (lang) => {
    const other = lang === "es" ? "en" : "es";
    signInMock.mockRejectedValue(new Error("CredentialsSignin"));
    visit("/account/signin", BROWSERS[lang]);
    render(<SignInPage />);
    type(ACCOUNT_COPY[lang].emailPlaceholder, "pat@example.com");
    type(ACCOUNT_COPY[lang].signin.passwordPlaceholder, STRONG);
    submitForm();

    expect(await screen.findByText(ACCOUNT_COPY[lang].signin.errors.CredentialsSignin)).toBeInTheDocument();
    switchTo(other);
    expect(screen.getByText(ACCOUNT_COPY[other].signin.errors.CredentialsSignin)).toBeInTheDocument();
    expect(signInMock.mock.calls).toEqual([
      [{ email: "pat@example.com", password: STRONG, callbackUrl: "/provider", redirect: true }],
    ]);
  });

  it("is not added to the pet owner's page inside the app", () => {
    visit("/account/signin?callbackUrl=/api/auth/token", BROWSERS.en);
    render(<SignInPage />);
    expect(screen.queryByRole("group", { name: "Language" })).toBeNull();
  });
});
