// "Share with your vet": nothing is shared without a picked vet AND ticked consent; the only scope sent is medical_read;
// revoke goes through a confirmation; family members are not offered the share. Data hooks, router and Alert are mocked.

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { Alert } from "react-native";
import ShareWithVetSheet from "./ShareWithVetSheet";

const mockLangRef = { current: "en" };
let mockBookings;
let mockGrants;
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockPush = jest.fn();

jest.mock("react-i18next", () => ({
  useTranslation: () => require("@/i18n/testMock").makeReactI18nextMock(mockLangRef.current).useTranslation(),
}));
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("@/components/KeyboardSafeFormModal", () => {
  const { View, Text, TouchableOpacity } = require("react-native");
  return {
    __esModule: true,
    default: ({ children, ctaLabel, ctaDisabled, onCtaPress }) => (
      <View>
        {children}
        <TouchableOpacity testID="cta" accessibilityState={{ disabled: !!ctaDisabled }} disabled={ctaDisabled} onPress={onCtaPress}>
          <Text>{ctaLabel}</Text>
        </TouchableOpacity>
      </View>
    ),
  };
});
jest.mock("@/hooks/useProviders", () => ({ useMyBookings: () => mockBookings }));
jest.mock("@/hooks/useCareAccessGrants", () => ({
  useCareAccessGrants: () => mockGrants,
  useCreateCareGrant: () => ({ mutate: mockCreate, isPending: false }),
  useUpdateGrant: () => ({ mutate: mockUpdate, isPending: false }),
}));

const pet = { id: 7, name: "Luna", is_shared: false };
const vets = [
  { pet_id: 7, provider_id: 1, provider_name: "Happy Paws", capability: "vet" },
  { pet_id: 7, provider_id: 2, provider_name: "North Clinic", capability: "vet" },
];
const query = (data, over) => ({ data, isError: false, refetch: jest.fn(), ...over });
const open = (props) => render(<ShareWithVetSheet pet={pet} onClose={jest.fn()} onOpenRequests={jest.fn()} {...props} />);
const ctaDisabled = (s) => s.getByTestId("cta").props.accessibilityState.disabled;

beforeEach(() => {
  mockLangRef.current = "en";
  mockCreate.mockReset();
  mockUpdate.mockReset();
  mockPush.mockReset();
  mockBookings = query({ upcoming: vets, past: [] });
  mockGrants = query([]);
  jest.spyOn(Alert, "alert").mockImplementation((title, msg, buttons = []) => {
    buttons.find((b) => b.style === "destructive")?.onPress?.();
  });
});
afterEach(() => jest.restoreAllMocks());

test("says what is shared and what is not", () => {
  const s = open();
  expect(s.getByText(/Medical profile: microchip/)).toBeTruthy();
  expect(s.getByText("Vaccinations")).toBeTruthy();
  expect(s.getByText(/Not shared: allergies, conditions, medications/)).toBeTruthy();
});

test("re-reads current access and bookings when it opens, not cached ones", () => {
  open();
  expect(mockGrants.refetch).toHaveBeenCalledTimes(1);
  expect(mockBookings.refetch).toHaveBeenCalledTimes(1);
});

test("a failed share re-reads current access and says it failed", () => {
  mockCreate.mockImplementation((vars, { onError }) => onError(new Error("Failed to create grant")));
  const s = open();
  fireEvent.press(s.getByTestId("vet-share-vet-1"));
  fireEvent.press(s.getByTestId("vet-share-consent"));
  fireEvent.press(s.getByTestId("cta"));
  expect(mockGrants.refetch).toHaveBeenCalledTimes(2);
  expect(Alert.alert.mock.calls[0][0]).toBe("Couldn't share");
});

test("needs a vet and consent, then creates a read-only grant", () => {
  const s = open();
  expect(ctaDisabled(s)).toBe(true);
  fireEvent.press(s.getByTestId("vet-share-vet-1"));
  expect(s.getByTestId("vet-share-consent").props.accessibilityState.checked).toBe(false);
  expect(ctaDisabled(s)).toBe(true);
  fireEvent.press(s.getByTestId("cta"));
  expect(mockCreate).not.toHaveBeenCalled();
  fireEvent.press(s.getByTestId("vet-share-consent"));
  fireEvent.press(s.getByTestId("cta"));
  expect(mockCreate).toHaveBeenCalledTimes(1);
  expect(mockCreate.mock.calls[0][0]).toEqual({ petId: 7, providerId: 1, scopes: ["medical_read"] });
});

test("consent is asked again when another vet is picked", () => {
  const s = open();
  fireEvent.press(s.getByTestId("vet-share-vet-1"));
  fireEvent.press(s.getByTestId("vet-share-consent"));
  fireEvent.press(s.getByTestId("vet-share-vet-2"));
  expect(s.getByTestId("vet-share-consent").props.accessibilityState.checked).toBe(false);
  expect(ctaDisabled(s)).toBe(true);
});

test("success says the vet is not notified", () => {
  mockCreate.mockImplementation((vars, { onSuccess }) => onSuccess({ grant: { status: "active" } }));
  const s = open();
  fireEvent.press(s.getByTestId("vet-share-vet-1"));
  fireEvent.press(s.getByTestId("vet-share-consent"));
  fireEvent.press(s.getByTestId("cta"));
  expect(Alert.alert.mock.calls[0][1]).toMatch(/PawPi doesn't notify them/);
});

test("a vet who already has access, or is waiting for an answer, cannot be picked", () => {
  mockGrants = query([
    { id: 4, provider_id: 1, provider_name: "Happy Paws", status: "active", scopes: ["medical_read"] },
    { id: 5, provider_id: 2, provider_name: "North Clinic", status: "pending", scopes: ["medical_read"] },
  ]);
  const onOpenRequests = jest.fn();
  const s = open({ onOpenRequests });
  expect(s.getByTestId("vet-share-vet-1").props.accessibilityState.disabled).toBe(true);
  expect(s.getByTestId("vet-share-vet-2").props.accessibilityState.disabled).toBe(true);
  fireEvent.press(s.getByText("See requests"));
  expect(onOpenRequests).toHaveBeenCalled();
});

test("revoke asks first, then revokes that grant", () => {
  mockGrants = query([{ id: 4, provider_id: 1, provider_name: "Happy Paws", status: "active", scopes: ["medical_read"] }]);
  const s = open();
  fireEvent.press(s.getByTestId("vet-share-revoke-4"));
  expect(Alert.alert).toHaveBeenCalled();
  expect(mockUpdate.mock.calls[0][0]).toEqual({ grantId: 4, action: "revoke" });
});

test("nothing can be picked while current access is unknown", () => {
  mockGrants = query(undefined, { isError: true });
  const s = open();
  expect(s.queryByTestId("vet-share-vet-1")).toBeNull();
  expect(s.getByText("Try again")).toBeTruthy();
  expect(ctaDisabled(s)).toBe(true);
});

test("no vet booking → empty state, and the emergency card link is offered", () => {
  mockBookings = query({ upcoming: [], past: [] });
  const onClose = jest.fn();
  const s = open({ onClose });
  expect(s.getByText(/You don't have a vet booking for Luna yet/)).toBeTruthy();
  fireEvent.press(s.getByText("Open the emergency card"));
  expect(onClose).toHaveBeenCalled();
  expect(mockPush).toHaveBeenCalledWith("/emergency-card?petId=7");
});

test("a family member is told only the owner can share", () => {
  const onClose = jest.fn();
  const s = open({ pet: { ...pet, is_shared: true }, onClose });
  expect(s.getByText(/Only Luna's owner can give a vet access/)).toBeTruthy();
  expect(s.queryByTestId("vet-share-vet-1")).toBeNull();
  fireEvent.press(s.getByTestId("cta"));
  expect(onClose).toHaveBeenCalled();
  expect(mockCreate).not.toHaveBeenCalled();
  expect(mockGrants.refetch).not.toHaveBeenCalled();
});

test("Spanish copy", () => {
  mockLangRef.current = "es";
  const s = open();
  expect(s.getByText("Qué va a poder ver la veterinaria")).toBeTruthy();
  expect(s.getByText(/No se comparte: alergias/)).toBeTruthy();
  expect(s.getByText("Dar acceso")).toBeTruthy();
});
