// Emergency Card screen (ticket 2.51): assembles the card from the LIVE sources (empties show
// "Not recorded"), shows the LOST banner, persists the tag medical toggle + contact mode, and
// creates / revokes vet links. All hooks + native modules mocked (no real QR/share/capture).

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { Alert } from "react-native";

let mockData;
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
jest.mock("@/hooks/usePetProfile", () => ({ useCurrentPet: () => ({ data: { id: 5 } }) }));
jest.mock("@/hooks/useEmergencyCard", () => ({
  useEmergencyCard: () => ({ data: mockData, isLoading: false }),
  useUpdateEmergencyCard: () => ({ mutate: mockUpdate }),
  useCreateEmergencyLink: () => ({ mutate: mockCreate }),
  useRevokeEmergencyLink: () => ({ mutate: mockRevoke }),
  tagUrl: (t) => `https://web/p/tag/${t}`,
  cardUrl: (t) => `https://web/p/card/${t}`,
}));

import EmergencyCardScreen from "./emergency-card";

beforeEach(() => {
  jest.clearAllMocks();
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
