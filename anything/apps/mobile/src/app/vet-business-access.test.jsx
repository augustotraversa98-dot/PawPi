// Render pins for the multi-capability business onboarding (ticket 2.15):
//   - the service picker is MULTI-select: tapping several keeps them all selected;
//   - submitting with two services posts capabilities:['vet','shop'] + provider_type:'vet'
//     (the first/primary selected capability) through useCreateProvider;
//   - submitting with NO service shows "Please choose at least one service." and does NOT
//     call the create mutation;
//   - useCreateProvider forwards the capabilities array verbatim in the POST body.
// All data hooks, router, auth, and icons are mocked.

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

let mockProviders;
const mockCreate = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}));
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
jest.mock("@/utils/auth/useAuth", () => ({
  useAuth: () => ({
    isReady: true,
    isAuthenticated: true,
    signIn: jest.fn(),
    signUp: jest.fn(),
  }),
}));
jest.mock("@/hooks/useProviders", () => ({
  useMyProviders: () => mockProviders,
  useCreateProvider: () => ({ mutateAsync: mockCreate, isPending: false }),
}));

import VetBusinessAccessScreen from "./vet-business-access";

beforeEach(() => {
  mockProviders = { data: [], isLoading: false };
  mockCreate.mockReset();
  mockCreate.mockResolvedValue({ name: "Happy Paws" });
});

function fillName(screen) {
  fireEvent.changeText(
    screen.getByPlaceholderText("Happy Paws Veterinary"),
    "Happy Paws",
  );
}

test("submitting with no service selected shows the validation error and does not create", () => {
  const screen = render(<VetBusinessAccessScreen />);
  fillName(screen);
  fireEvent.press(screen.getByText("Create business"));

  expect(screen.getByText("Please choose at least one service.")).toBeTruthy();
  expect(mockCreate).not.toHaveBeenCalled();
});

test("multi-select keeps several services selected and posts capabilities[] + primary provider_type", async () => {
  const screen = render(<VetBusinessAccessScreen />);
  fillName(screen);

  // Pick two distinct services — both must stay selected (multi-select, not radio).
  fireEvent.press(screen.getByText("Veterinary clinic"));
  fireEvent.press(screen.getByText("Pet shop"));

  // The summary line reflects both, in CAPABILITIES order (vet before shop).
  expect(screen.getByText("Selected: Veterinary clinic, Pet shop")).toBeTruthy();

  fireEvent.press(screen.getByText("Create business"));

  await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
  expect(mockCreate).toHaveBeenCalledWith(
    expect.objectContaining({
      name: "Happy Paws",
      provider_type: "vet",
      capabilities: ["vet", "shop"],
    }),
  );
});

test("optional links submit through useCreateProvider (ticket 2.20)", async () => {
  const screen = render(<VetBusinessAccessScreen />);
  fillName(screen);
  fireEvent.press(screen.getByText("Veterinary clinic"));
  fireEvent.changeText(
    screen.getByPlaceholderText("Website (https://…)"),
    "https://happypaws.example",
  );
  fireEvent.changeText(
    screen.getByPlaceholderText("Google Maps URL"),
    "https://maps.example/hp",
  );
  fireEvent.press(screen.getByText("Create business"));

  await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
  expect(mockCreate).toHaveBeenCalledWith(
    expect.objectContaining({
      website_url: "https://happypaws.example",
      google_maps_url: "https://maps.example/hp",
    }),
  );
});

test("tapping a selected service again de-selects it", () => {
  const screen = render(<VetBusinessAccessScreen />);
  fillName(screen);

  fireEvent.press(screen.getByText("Groomer"));
  expect(screen.getByText("Selected: Groomer")).toBeTruthy();

  fireEvent.press(screen.getByText("Groomer"));
  expect(screen.queryByText("Selected: Groomer")).toBeNull();
});
