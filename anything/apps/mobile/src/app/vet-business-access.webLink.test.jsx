// "Open web dashboard" asks the web panel for the app's language, so a language chosen in the app
// is respected there. The address printed under the button stays clean.

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { Linking } from "react-native";

jest.mock("react-i18next", () => ({
  ...require("@/i18n/testMock").makeReactI18nextMock("es"),
  getI18n: () => ({ language: "es" }),
}));
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}));
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/components/KeyboardAwareScrollView", () => {
  const { View } = require("react-native");
  return { __esModule: true, default: ({ children }) => <View>{children}</View> };
});
jest.mock("@/utils/auth/useAuth", () => ({
  useAuth: () => ({ isReady: true, isAuthenticated: true, signIn: jest.fn(), signUp: jest.fn() }),
}));
jest.mock("@/hooks/useProviders", () => {
  const idle = () => ({ mutateAsync: jest.fn(), isPending: false });
  return {
    useMyProviders: () => ({ data: [{ id: 7, name: "Patitas" }], isLoading: false }),
    useCreateProvider: idle,
    useCreateProviderLocation: idle,
    useEnrichProvider: idle,
    useEnrichProviderDocument: idle,
    useUpdateProvider: idle,
    useCreateProviderService: idle,
  };
});
jest.mock("@/utils/useUpload", () => ({
  __esModule: true,
  default: () => [jest.fn(), { loading: false }],
}));
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));
jest.mock("@/components/Map/LocationField", () => ({ __esModule: true, default: () => null }));

const es = require("@/i18n/locales/es.json");

test("the dashboard link carries the app's language", () => {
  const previous = process.env.EXPO_PUBLIC_APP_URL;
  // The screen reads its web host when it loads.
  process.env.EXPO_PUBLIC_APP_URL = "https://web.example.test";
  const VetBusinessAccessScreen = require("./vet-business-access").default;
  const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);

  const screen = render(<VetBusinessAccessScreen />);
  fireEvent.press(screen.getByText(es.vetBusinessAccess.openWebDashboard));

  expect(open).toHaveBeenCalledWith("https://web.example.test/provider?lang=es");
  expect(screen.getByText("https://web.example.test/provider")).toBeTruthy();
  process.env.EXPO_PUBLIC_APP_URL = previous;
  open.mockRestore();
});
