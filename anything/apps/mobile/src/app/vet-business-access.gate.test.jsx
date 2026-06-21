import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { Alert } from "react-native";

// Vet/Business EULA gate (Guideline 1.2): this is the SECOND account-creation entry point, so
// its SignedOutGate must gate "Create account" on Terms acceptance identically to the owner
// welcome (parity with welcome.test.jsx). "Log in" stays ungated. useAuth is mocked SIGNED-OUT
// here (the sibling vet-business-access.test.jsx pins isAuthenticated:true for the onboarding
// flow), with capturable signIn/signUp.

const mockSignIn = jest.fn();
const mockSignUp = jest.fn();

jest.mock("@/utils/auth/useAuth", () => ({
  useAuth: () => ({
    isReady: true,
    isAuthenticated: false,
    signIn: mockSignIn,
    signUp: mockSignUp,
  }),
}));
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("lucide-react-native", () => {
  const React = require("react");
  const { Text } = require("react-native");
  return new Proxy(
    {},
    { get: (_t, name) => () => React.createElement(Text, null, String(name)) },
  );
});
jest.mock("@/components/KeyboardAwareScrollView", () => {
  const { View } = require("react-native");
  return { __esModule: true, default: ({ children }) => <View>{children}</View> };
});
// SignedOutGate never renders ProviderOnboarding, but the screen imports these at module scope.
jest.mock("@/hooks/useProviders", () => ({
  useMyProviders: () => ({ data: [], isLoading: false }),
  useCreateProvider: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useCreateProviderLocation: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useEnrichProvider: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useEnrichProviderDocument: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useUpdateProvider: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useCreateProviderService: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));
jest.mock("@/utils/useUpload", () => ({
  __esModule: true,
  default: () => [jest.fn(), { loading: false }],
}));
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));
jest.mock("@/components/Map/LocationField", () => {
  const { View } = require("react-native");
  return { __esModule: true, default: () => <View /> };
});

import VetBusinessAccessScreen from "./vet-business-access";

const TERMS_LABEL = "I agree to the Terms of Service and Privacy Policy";

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});

describe("VetBusinessAccessScreen — Terms acceptance gate", () => {
  it("blocks Create account until the box is checked (alerts instead of signing up)", () => {
    const { getByLabelText } = render(<VetBusinessAccessScreen />);
    fireEvent.press(getByLabelText("Create account"));
    expect(mockSignUp).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalled();
  });

  it("signs up once the box is checked", () => {
    const { getByLabelText } = render(<VetBusinessAccessScreen />);
    fireEvent.press(getByLabelText(TERMS_LABEL));
    fireEvent.press(getByLabelText("Create account"));
    expect(mockSignUp).toHaveBeenCalledTimes(1);
  });

  it("Log in stays ungated — works without checking the box", () => {
    const { getByText } = render(<VetBusinessAccessScreen />);
    fireEvent.press(getByText("Log in"));
    expect(mockSignIn).toHaveBeenCalledTimes(1);
  });
});
