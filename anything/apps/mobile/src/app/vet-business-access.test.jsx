// Magic onboarding wizard (ticket 2.83), building on the 2.15 multi-select + 2.81 map pin:
//   - the service picker is MULTI-select; "Build my profile" posts capabilities[] + primary type;
//   - no service selected → validation error, no create;
//   - a dropped map pin persists as the primary location (2.81);
//   - enrichment that proposes services shows the confirm-first REVIEW screen; Save & finish applies
//     them via the services CRUD; keyless (503) / empty enrichment goes straight to success (manual).
// All data hooks, router, auth, icons, the map pin, upload + document picker are mocked.

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

let mockProviders;
const mockCreate = jest.fn();
const mockCreateLocation = jest.fn();
const mockEnrich = jest.fn();
const mockEnrichDoc = jest.fn();
const mockUpdate = jest.fn();
const mockCreateService = jest.fn();
const mockUpload = jest.fn();
const mockPickDocument = jest.fn();

jest.mock("react-i18next", () => require("@/i18n/testMock").makeReactI18nextMock());
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
  useCreateProviderLocation: () => ({ mutateAsync: mockCreateLocation, isPending: false }),
  useEnrichProvider: () => ({ mutateAsync: mockEnrich, isPending: false }),
  useEnrichProviderDocument: () => ({ mutateAsync: mockEnrichDoc, isPending: false }),
  useUpdateProvider: () => ({ mutateAsync: mockUpdate, isPending: false }),
  useCreateProviderService: () => ({ mutateAsync: mockCreateService, isPending: false }),
}));
jest.mock("@/utils/useUpload", () => ({
  __esModule: true,
  default: () => [mockUpload, { loading: false }],
}));
jest.mock("expo-document-picker", () => ({
  getDocumentAsync: (...args) => mockPickDocument(...args),
}));
// The shared map pin (ticket 2.81) → a button that drops a fixed coord.
jest.mock("@/components/Map/LocationField", () => {
  const { Text, TouchableOpacity } = require("react-native");
  return {
    __esModule: true,
    default: ({ onChange }) => (
      <TouchableOpacity
        onPress={() => onChange({ lat: 40.7128, lng: -74.006, address: "123 Bark St" })}
      >
        <Text>Drop pin</Text>
      </TouchableOpacity>
    ),
  };
});

import VetBusinessAccessScreen from "./vet-business-access";

beforeEach(() => {
  mockProviders = { data: [], isLoading: false };
  [mockCreate, mockCreateLocation, mockEnrich, mockEnrichDoc, mockUpdate, mockCreateService,
    mockUpload, mockPickDocument].forEach((m) => m.mockReset());
  mockCreate.mockResolvedValue({ id: 7, name: "Happy Paws" });
  mockCreateLocation.mockResolvedValue({ id: 1 });
  // Default: enrichment proposes nothing (keyless/empty) → straight to success.
  mockEnrich.mockResolvedValue({ draft: {} });
  mockEnrichDoc.mockResolvedValue({ draft: {} });
  mockUpdate.mockResolvedValue({ id: 7 });
  mockCreateService.mockResolvedValue({ id: 1 });
});

function fillName(screen) {
  fireEvent.changeText(
    screen.getByPlaceholderText("Happy Paws Veterinary"),
    "Happy Paws",
  );
}

test("no service selected → validation error, no create", () => {
  const screen = render(<VetBusinessAccessScreen />);
  fillName(screen);
  fireEvent.press(screen.getByText("Build my profile"));
  expect(screen.getByText("Please choose at least one service.")).toBeTruthy();
  expect(mockCreate).not.toHaveBeenCalled();
});

test(
  "multi-select posts capabilities[] + primary provider_type",
  async () => {
    const screen = render(<VetBusinessAccessScreen />);
    fillName(screen);
    fireEvent.press(screen.getByText("Veterinary clinic"));
    fireEvent.press(screen.getByText("Pet shop"));
    expect(screen.getByText("Selected: Veterinary clinic, Pet shop")).toBeTruthy();
    fireEvent.press(screen.getByText("Build my profile"));

    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Happy Paws",
        provider_type: "vet",
        capabilities: ["vet", "shop"],
      }),
    );
  },
  10000,
);

test("optional links submit through useCreateProvider (ticket 2.20)", async () => {
  const screen = render(<VetBusinessAccessScreen />);
  fillName(screen);
  fireEvent.press(screen.getByText("Veterinary clinic"));
  fireEvent.changeText(screen.getByPlaceholderText("Website (https://…)"), "https://hp.example");
  fireEvent.changeText(screen.getByPlaceholderText("Google Maps URL"), "https://maps.example/hp");
  fireEvent.press(screen.getByText("Build my profile"));

  await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
  expect(mockCreate).toHaveBeenCalledWith(
    expect.objectContaining({
      website_url: "https://hp.example",
      google_maps_url: "https://maps.example/hp",
    }),
  );
});

test("a dropped map pin persists as the primary location (ticket 2.81)", async () => {
  const screen = render(<VetBusinessAccessScreen />);
  fillName(screen);
  fireEvent.press(screen.getByText("Veterinary clinic"));
  fireEvent.press(screen.getByText("Drop pin"));
  fireEvent.press(screen.getByText("Build my profile"));

  await waitFor(() => expect(mockCreateLocation).toHaveBeenCalledTimes(1));
  expect(mockCreateLocation).toHaveBeenCalledWith({
    providerId: 7,
    name: "Happy Paws",
    address: "123 Bark St",
    lat: 40.7128,
    lng: -74.006,
  });
});

test("empty/keyless enrichment goes straight to the created-business success state", async () => {
  const screen = render(<VetBusinessAccessScreen />);
  fillName(screen);
  fireEvent.press(screen.getByText("Veterinary clinic"));
  fireEvent.press(screen.getByText("Build my profile"));

  expect(await screen.findByText("Your business is created!")).toBeTruthy();
  await waitFor(() => expect(mockEnrich).toHaveBeenCalledWith(7));
});

test("a 503 from enrichment still finishes onboarding (degrades to manual)", async () => {
  mockEnrich.mockRejectedValueOnce(Object.assign(new Error("not set up"), { status: 503 }));
  const screen = render(<VetBusinessAccessScreen />);
  fillName(screen);
  fireEvent.press(screen.getByText("Veterinary clinic"));
  fireEvent.press(screen.getByText("Build my profile"));

  expect(await screen.findByText("Your business is created!")).toBeTruthy();
});

test("proposed services show the review screen; Save & finish applies them via the services CRUD", async () => {
  mockEnrich.mockResolvedValue({
    draft: {
      description: "Friendly neighborhood vet",
      services: [{ name: "Annual checkup", price: "$50", duration: "30" }],
    },
  });
  const screen = render(<VetBusinessAccessScreen />);
  fillName(screen);
  fireEvent.press(screen.getByText("Veterinary clinic"));
  fireEvent.press(screen.getByText("Build my profile"));

  // The confirm-first review renders with the proposed, editable rows.
  expect(await screen.findByText("Review your profile")).toBeTruthy();
  expect(screen.getByDisplayValue("Annual checkup")).toBeTruthy();

  fireEvent.press(screen.getByText("Save & finish"));

  await waitFor(() => expect(mockCreateService).toHaveBeenCalledTimes(1));
  expect(mockCreateService).toHaveBeenCalledWith({
    providerId: 7,
    name: "Annual checkup",
    description: undefined,
    price_cents: 5000,
    duration_min: 30,
  });
  // the enriched description was applied to the provider (bio)
  expect(mockUpdate).toHaveBeenCalledWith({ providerId: 7, bio: "Friendly neighborhood vet" });
  expect(await screen.findByText("Your business is created!")).toBeTruthy();
});

test("tapping a selected service again de-selects it", () => {
  const screen = render(<VetBusinessAccessScreen />);
  fillName(screen);
  fireEvent.press(screen.getByText("Groomer"));
  expect(screen.getByText("Selected: Groomer")).toBeTruthy();
  fireEvent.press(screen.getByText("Groomer"));
  expect(screen.queryByText("Selected: Groomer")).toBeNull();
});
