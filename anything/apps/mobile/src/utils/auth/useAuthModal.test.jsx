import React from "react";
import { Keyboard } from "react-native";
import { render, act } from "@testing-library/react-native";

// The sign-in window: Apple and Google sit under the sign-in and sign-up pages (also after moving between them with the
// links inside the page), not under password reset, and step aside while the keyboard is up.

const mockWebView = { props: null };
jest.mock("react-native-webview", () => ({
  WebView: (props) => {
    mockWebView.props = props;
    return null;
  },
}));
jest.mock("expo-router", () => ({ router: { replace: jest.fn() } }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key) => key, i18n: { language: "es" } }) }));
jest.mock("@/telemetry/track", () => ({ trackFunnel: jest.fn() }));
jest.mock("@/telemetry/useFormTelemetry", () => ({ useFormTelemetry: () => ({ complete: jest.fn() }) }));
jest.mock("@/utils/appAlert", () => ({ translate: (_key, fallback) => fallback }));
jest.mock("./store", () => {
  const state = { modal: { isOpen: true, mode: "signup", close: jest.fn() } };
  return {
    __state: state,
    useAuthModal: () => state.modal,
    useAuthStore: (selector) => {
      const store = { auth: null, isReady: true, setAuth: jest.fn() };
      return selector ? selector(store) : store;
    },
  };
});
jest.mock("./useSocialProviders", () => ({ useSocialProviders: () => ({ showGoogle: true, showApple: true }) }));
jest.mock("@/components/auth/SocialSignInButtons", () => ({ SocialSignInButtons: () => null }));

const BASE = "https://app.test";
let AuthModal;
beforeAll(() => {
  process.env.EXPO_PUBLIC_BASE_URL = BASE;
  process.env.EXPO_PUBLIC_PROXY_BASE_URL = BASE;
  ({ AuthModal } = require("./useAuthModal"));
});

const { __state } = require("./store");
const open = (mode) => {
  __state.modal = { isOpen: true, mode, close: jest.fn() };
  return render(<AuthModal />);
};
const follow = (path) => act(() => void mockWebView.props.onShouldStartLoadWithRequest({ url: `${BASE}${path}` }));

describe("AuthModal: Apple and Google under the account pages", () => {
  it.each(["signin", "signup"])("offers them under %s", (mode) => {
    expect(open(mode).getByTestId("auth-social-panel")).toBeTruthy();
  });

  it("does not offer them under password reset", () => {
    expect(open("forgot-password").queryByTestId("auth-social-panel")).toBeNull();
  });

  it("follows the links inside the page: sign up, to log in, to password reset", () => {
    const screen = open("signup");
    follow("/account/signin?callbackUrl=/api/auth/token&lang=es");
    expect(screen.getByTestId("auth-social-panel")).toBeTruthy();
    follow("/account/forgot-password?lang=es");
    expect(screen.queryByTestId("auth-social-panel")).toBeNull();
    follow("/account/signin?lang=es");
    expect(screen.getByTestId("auth-social-panel")).toBeTruthy();
  });

  it("opens the page in the app's language", () => {
    open("signin");
    expect(mockWebView.props.source.uri).toBe(`${BASE}/account/signin?callbackUrl=/api/auth/token&lang=es`);
  });

  it("gets out of the way while the keyboard is up", () => {
    const listeners = {};
    const spy = jest.spyOn(Keyboard, "addListener").mockImplementation((name, handler) => {
      listeners[name] = handler;
      return { remove: jest.fn() };
    });
    const screen = open("signin");
    // Still mounted while hidden, so a sign-in under way keeps its state.
    const display = () => screen.getByTestId("auth-social-panel", { includeHiddenElements: true }).props.style.display;
    act(() => listeners.keyboardWillShow());
    expect(display()).toBe("none");
    act(() => listeners.keyboardWillHide());
    expect(display()).toBe("flex");
    spy.mockRestore();
  });
});
