// Proves the new onboarding required-field validation actually localizes (es-AR),
// not just that it calls t(). Resolving against the real ES catalog means a
// missing/mistyped key would render the raw key and fail this test.

import React from "react";
import { render } from "@testing-library/react-native";

jest.mock("react-i18next", () =>
  require("@/i18n/testMock").makeReactI18nextMock("es"),
);
jest.mock("expo-router", () => ({ useRouter: () => ({ replace: jest.fn() }) }));
jest.mock("lucide-react-native", () =>
  new Proxy({}, { get: () => () => null }),
);
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/components/KeyboardAwareScrollView", () => {
  const { View } = require("react-native");
  return { __esModule: true, default: ({ children }) => <View>{children}</View> };
});
jest.mock("@/components/DateField", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("expo-image", () => ({ Image: () => null }));
jest.mock("@/utils/auth/useUser", () => ({
  __esModule: true,
  default: () => ({ data: null }),
}));
jest.mock("@/utils/useUpload", () => ({
  __esModule: true,
  default: () => [jest.fn(), { loading: false }],
}));
jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    invalidateQueries: jest.fn(),
    refetchQueries: jest.fn(),
    resetQueries: jest.fn(),
  }),
}));

import OnboardingScreen from "./onboarding";

test("required-field validation renders in Spanish", () => {
  const screen = render(<OnboardingScreen />);
  expect(
    screen.getByText("Agregá el nombre de tu perro para continuar"),
  ).toBeTruthy();
});
