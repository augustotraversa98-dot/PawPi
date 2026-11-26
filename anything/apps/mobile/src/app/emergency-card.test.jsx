// Emergency Card screen (ticket 2.51): assembles the card from the LIVE sources (empties show
// "Not recorded"), shows the LOST banner, persists the tag medical toggle + contact mode, and
// creates / revokes vet links. All hooks + native modules mocked (no real QR/share/capture).

jest.mock("react-i18next", () => require("@/i18n/testMock").makeReactI18nextMock());
import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { Alert } from "react-native";

let mockData;
let mockError = false;
const mockRefetch = jest.fn();
const mockUpdate = jest.fn();
const mockCreate = jest.fn();
const mockRevoke = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({ petId: "5" }),
}));
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("react-native-qrcode-svg", () => () => null);
jest.mock("react-native-view-shot", () => ({ captureRef: jest.fn() }));
jest.mock("expo-sharing", () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock("@/components/Pets/PetAvatar", () => ({ PetAvatar: () => null }));
let mockViewerPet = { id: 5 };
jest.mock("@/hooks/usePetProfile", () => ({ useCurrentPet: () => ({ data: mockViewerPet }) }));
jest.mock("@/hooks/useEmergencyCard", () => ({
  useEmergencyCard: () => ({ data: mockData, isLoading: false, isError: !!mockError, refetch: mockRefetch }),
  useUpdateEmergencyCard: () => ({ mutate: mockUpdate }),
  useCreateEmergencyLink: () => ({ mutate: mockCreate }),
  useRevokeEmergencyLink: () => ({ mutate: mockRevoke }),
  tagUrl: (t) => `https://web/p/tag/${t}`,
  cardUrl: (t) => `https://web/p/card/${t}`,
}));

import EmergencyCardScreen from "./emergency-card";
import KeyboardAwareScrollView from "@/components/KeyboardAwareScrollView";

beforeEach(() => {
  jest.clearAllMocks();
  mockError = false;
  mockViewerPet = { id: 5 };
  mockData = {
    card: {
      id: 1,
      pet_id: 5,
      tag_token: "TOK",
      show_medical_on_tag: false,
      contact_mode: "relay",
      contact_value: null,
      blood_type: "DEA 1.1+",
      active: true,
    },
    pet: { id: 5, name: "Rex", species: "dog", breed: "Beagle", avatar_url: "" },
    medical: { microchip_id: "chip-1", primary_vet_name: null },
    allergies: [{ allergen: "Penicillin" }],
    conditions: [],
    lost: null,
    links: [],
  };
});

test("assembles the card from sources; empty fields read 'Not recorded'", () => {
  const { getByText, getAllByText } = render(<EmergencyCardScreen />);
  expect(getByText("Rex")).toBeTruthy();
  expect(getByText("Penicillin")).toBeTruthy(); // allergy from source
  expect(getByText("DEA 1.1+")).toBeTruthy(); // blood type from the card
  // primary_vet_name is null → at least one "Not recorded" row renders (no fake data).
  expect(getAllByText("Not recorded").length).toBeGreaterThan(0);
});

test("renders the LOST banner when an active lost report exists", () => {
  mockData.lost = { active: true, reward: "$50" };
  const { getByTestId } = render(<EmergencyCardScreen />);
  expect(getByTestId("lost-banner")).toBeTruthy();
});

test("the public-tag medical toggle persists via PATCH", () => {
  const { getByTestId } = render(<EmergencyCardScreen />);
  fireEvent(getByTestId("toggle-medical"), "valueChange", true);
  expect(mockUpdate).toHaveBeenCalledWith({ show_medical_on_tag: true });
});

test("choosing a contact mode persists via PATCH", () => {
  const { getByTestId } = render(<EmergencyCardScreen />);
  fireEvent.press(getByTestId("contact-phone"));
  expect(mockUpdate).toHaveBeenCalledWith({ contact_mode: "phone" });
});

test("creating a vet link uses the selected scope + expiry", () => {
  const { getByTestId } = render(<EmergencyCardScreen />);
  fireEvent.press(getByTestId("scope-basic"));
  fireEvent.press(getByTestId("ttl-24"));
  fireEvent.press(getByTestId("create-link"));
  expect(mockCreate).toHaveBeenCalledWith({ scope: "basic", ttlHours: 24 });
});

test("revoking an active link calls the revoke mutation (confirmed)", () => {
  mockData.links = [{ id: 7, token: "L7", scope: "full", expires_at: null }];
  const alertSpy = jest.spyOn(Alert, "alert").mockImplementation((title, msg, buttons) => {
    // tap the destructive "Revoke" button
    buttons.find((b) => b.style === "destructive").onPress();
  });
  const { getByTestId } = render(<EmergencyCardScreen />);
  fireEvent.press(getByTestId("revoke-link-7"));
  expect(alertSpy).toHaveBeenCalled();
  expect(mockRevoke).toHaveBeenCalledWith(7);
});

// Consistency audit S-02: a failed load must not render an empty card.
describe("Emergency card — failed load", () => {
  it("shows a retryable error instead of an empty card", () => {
    mockData = undefined;
    mockError = true;
    const { getByTestId, queryByTestId } = render(<EmergencyCardScreen />);
    expect(getByTestId("emergency-error")).toBeTruthy();
    expect(queryByTestId("share-card")).toBeNull();
    fireEvent.press(getByTestId("emergency-error-retry"));
    expect(mockRefetch).toHaveBeenCalled();
  });
});

// Family sharing: the tag QR, "who can reach me" settings and vet links are the OWNER's. A family member / caregiver sees the card itself
// (the server already sends them no tag token, contacts or links) and cannot reach the writes.
describe.each([
  ["family", { id: 5, is_shared: true, access_role: "family" }],
  ["caregiver", { id: 5, is_shared: true, access_role: "caregiver" }],
])("a %s on a shared dog", (_role, pet) => {
  beforeEach(() => {
    mockViewerPet = pet;
  });

  test("sees the card but none of the owner-only controls", () => {
    const { getByText, queryByTestId } = render(<EmergencyCardScreen />);
    expect(getByText("Rex")).toBeTruthy();
    expect(getByText("Penicillin")).toBeTruthy();
    expect(queryByTestId("toggle-medical")).toBeNull();
    expect(queryByTestId("contact-phone")).toBeNull();
    expect(queryByTestId("create-link")).toBeNull();
    expect(queryByTestId("tag-qr")).toBeNull();
  });

  test("is told, kindly, that only the owner can change it", () => {
    const { getByTestId, getByText } = render(<EmergencyCardScreen />);
    expect(getByTestId("emergency-owner-only")).toBeTruthy();
    expect(getByText("Only the owner can change this.")).toBeTruthy();
  });

  test("the share-as-image action stays available (it only shares what they can already read)", () => {
    const { getByTestId } = render(<EmergencyCardScreen />);
    expect(getByTestId("share-card")).toBeTruthy();
  });
});

test("the owner still sees every control", () => {
  mockViewerPet = { id: 5, is_shared: false, access_role: "owner" };
  const { getByTestId, queryByTestId } = render(<EmergencyCardScreen />);
  expect(getByTestId("toggle-medical")).toBeTruthy();
  expect(getByTestId("create-link")).toBeTruthy();
  expect(queryByTestId("emergency-owner-only")).toBeNull();
});

test("typing in the contact field never remounts it, and it sits in the keyboard-aware scroll", () => {
  mockData.card.contact_mode = "phone";
  const api = render(<EmergencyCardScreen />);
  const field = api.getByTestId("contact-value");
  fireEvent.changeText(field, "1");
  api.rerender(<EmergencyCardScreen />);
  fireEvent.changeText(api.getByTestId("contact-value"), "12");
  expect(api.getByTestId("contact-value")).toBe(field);
  // Nothing is saved (and so nothing refetches) until the field is left.
  expect(mockUpdate).not.toHaveBeenCalled();
  fireEvent(field, "endEditing", { nativeEvent: { text: "12" } });
  expect(mockUpdate).toHaveBeenCalledWith({ contact_value: "12" });

  let node = field.parent;
  while (node && node.type !== KeyboardAwareScrollView) node = node.parent;
  expect(node).toBeTruthy();
});
