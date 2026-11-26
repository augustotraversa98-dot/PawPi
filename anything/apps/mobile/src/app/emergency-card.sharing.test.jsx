// Emergency Card: the contact-mode explanations, the explicit save buttons, and sharing / copying the QR and vet
// links, rendered with the REAL Spanish catalog (TestFlight reports).

jest.mock("react-i18next", () => require("@/i18n/testMock").makeReactI18nextMock("es"));
import React from "react";
import { render, fireEvent, act } from "@testing-library/react-native";
import { Alert } from "react-native";

let mockData;
let mockCreateState;
const mockUpdate = jest.fn();
const mockShareQr = jest.fn(() => Promise.resolve());

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
jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn(() => Promise.resolve()) }));
jest.mock("@/utils/emergencyQrShare", () => ({ shareQrImage: (...args) => mockShareQr(...args) }));
jest.mock("@/components/Pets/PetAvatar", () => ({ PetAvatar: () => null }));
jest.mock("@/hooks/usePetProfile", () => ({ useCurrentPet: () => ({ data: { id: 5 } }) }));
jest.mock("@/hooks/useEmergencyCard", () => ({
  useEmergencyCard: () => ({ data: mockData, isLoading: false, isError: false, refetch: jest.fn() }),
  useUpdateEmergencyCard: () => ({ mutate: mockUpdate }),
  useCreateEmergencyLink: () => mockCreateState,
  useRevokeEmergencyLink: () => ({ mutate: jest.fn() }),
  tagUrl: (token) => `https://web/p/tag/${token}`,
  cardUrl: (token) => `https://web/p/card/${token}`,
}));

import * as Clipboard from "expo-clipboard";
import EmergencyCardScreen from "./emergency-card";

const es = require("@/i18n/locales/es.json").emergencyCard;

beforeEach(() => {
  jest.clearAllMocks();
  mockCreateState = { mutate: jest.fn() };
  mockData = {
    card: { id: 1, pet_id: 5, tag_token: "TOK", show_medical_on_tag: false, contact_mode: "relay", contact_value: null },
    pet: { id: 5, name: "Busdy", species: "dog", breed: null },
    medical: null,
    allergies: [],
    conditions: [],
    lost: null,
    links: [{ id: 7, token: "L7", scope: "full", expires_at: null }],
  };
});

test.each([
  ["relay", "contactRelayHint"],
  ["phone", "contactPhoneHint"],
  ["email", "contactEmailHint"],
  ["none", "contactNoneHint"],
])("the %s contact mode is explained in one plain line", (mode, key) => {
  mockData.card.contact_mode = mode;
  const { getByTestId, getByText } = render(<EmergencyCardScreen />);
  expect(getByTestId("contact-hint")).toBeTruthy();
  expect(getByText(es[key])).toBeTruthy();
});

test.each([
  ["phone", null, "contactPhoneMissing"],
  ["phone", "ana@example.test", "contactPhoneMismatch"],
  ["email", "  ", "contactEmailMissing"],
  ["email", "11 5555", "contactEmailMismatch"],
])("%s mode with %p says that finders will see nothing", (mode, value, key) => {
  mockData.card.contact_mode = mode;
  mockData.card.contact_value = value;
  const { getByTestId } = render(<EmergencyCardScreen />);
  expect(getByTestId("contact-warning").props.children).toBe(es[key]);
});

test.each([
  ["phone", "11 5555"],
  ["email", "ana@example.test"],
  ["relay", null],
  ["none", null],
])("no warning for %s mode with %p", (mode, value) => {
  mockData.card.contact_mode = mode;
  mockData.card.contact_value = value;
  const { queryByTestId } = render(<EmergencyCardScreen />);
  expect(queryByTestId("contact-warning")).toBeNull();
});

// "Show my emergency contact on the pet tag" (default off; the server sends false / true, or nothing when it does
// not support the setting yet).
test("the tag emergency-contact switch is off by default, explained, and saves on tap", () => {
  mockData.card.show_emergency_contact_on_tag = false;
  const { getByTestId, getByText, queryByTestId } = render(<EmergencyCardScreen />);
  const toggle = getByTestId("toggle-emergency-contact");
  expect(toggle.props.value).toBe(false);
  expect(getByText(es.showEmergencyContactOnTag)).toBeTruthy();
  expect(getByText(es.showEmergencyContactOnTagHint)).toBeTruthy();
  expect(queryByTestId("emergency-contact-missing")).toBeNull();
  fireEvent(toggle, "valueChange", true);
  expect(mockUpdate).toHaveBeenCalledWith({ show_emergency_contact_on_tag: true });
});

test("turned on without a saved emergency contact, it says the tag shows none", () => {
  mockData.card.show_emergency_contact_on_tag = true;
  const { getByTestId } = render(<EmergencyCardScreen />);
  expect(getByTestId("emergency-contact-missing").props.children).toBe(es.emergencyContactMissing);
});

test.each([
  [{ emergency_contact_name: "Ana", emergency_contact_phone: null }],
  [{ emergency_contact_name: "", emergency_contact_phone: "11 6666" }],
])("turned on with %o there is no warning", (medical) => {
  mockData.card.show_emergency_contact_on_tag = true;
  mockData.medical = medical;
  const { queryByTestId } = render(<EmergencyCardScreen />);
  expect(queryByTestId("emergency-contact-missing")).toBeNull();
});

test.each([[undefined], [null]])("no switch when the server does not support the setting (%p)", (value) => {
  mockData.card.show_emergency_contact_on_tag = value;
  const { queryByTestId } = render(<EmergencyCardScreen />);
  expect(queryByTestId("toggle-emergency-contact")).toBeNull();
});

test("no English leaks into the Spanish card", () => {
  const { getByText, queryByText } = render(<EmergencyCardScreen />);
  expect(getByText("Perro")).toBeTruthy();
  expect(queryByText("dog")).toBeNull();
  expect(getByText(es.shareWithVetTitle)).toBeTruthy();
  expect(getByText(es.createVetLink)).toBeTruthy();
});

test("the vet-link choices are one-of-a-group and say what they include", () => {
  const { getByTestId, getByText } = render(<EmergencyCardScreen />);
  expect(getByTestId("scope-full").props.accessibilityState.selected).toBe(true);
  expect(getByText(es.scopeFullHint)).toBeTruthy();
  fireEvent.press(getByTestId("scope-basic"));
  expect(getByTestId("scope-basic").props.accessibilityState.selected).toBe(true);
  expect(getByTestId("scope-full").props.accessibilityState.selected).toBe(false);
  expect(getByText(es.scopeBasicHint)).toBeTruthy();
});

test("a saved link rests the button until a choice changes", () => {
  mockCreateState = {
    mutate: jest.fn(),
    isSuccess: true,
    variables: { scope: "full", ttlHours: 168 },
    data: { link: { id: 7 } },
  };
  const { getByTestId, getByText } = render(<EmergencyCardScreen />);
  expect(getByText(es.linkSaved)).toBeTruthy();
  fireEvent.press(getByTestId("create-link"));
  expect(mockCreateState.mutate).not.toHaveBeenCalled();

  fireEvent.press(getByTestId("ttl-24"));
  fireEvent.press(getByTestId("create-link"));
  expect(mockCreateState.mutate).toHaveBeenCalledWith({ scope: "full", ttlHours: 24 });
});

test("the contact field has a Save button that wakes only when the text changes, and saves once", () => {
  mockData.card.contact_mode = "phone";
  mockData.card.contact_value = "111";
  const { getByTestId } = render(<EmergencyCardScreen />);
  const disabled = () => getByTestId("contact-save").props.accessibilityState.disabled;
  expect(disabled()).toBe(true);
  fireEvent.changeText(getByTestId("contact-value"), "222");
  expect(disabled()).toBe(false);
  fireEvent.press(getByTestId("contact-save"));
  fireEvent(getByTestId("contact-value"), "endEditing", { nativeEvent: { text: "222" } });
  expect(mockUpdate).toHaveBeenCalledTimes(1);
  expect(mockUpdate).toHaveBeenCalledWith({ contact_value: "222" });
});

test("a typed number is saved when the screen closes without leaving the field", () => {
  mockData.card.contact_mode = "phone";
  const { getByTestId, unmount } = render(<EmergencyCardScreen />);
  fireEvent.changeText(getByTestId("contact-value"), "333");
  unmount();
  expect(mockUpdate).toHaveBeenCalledWith({ contact_value: "333" });
});

test("Share QR and long-press both export the QR with its link", async () => {
  const { getByTestId, getByText } = render(<EmergencyCardScreen />);
  expect(getByText(es.shareQr)).toBeTruthy();
  await act(async () => fireEvent.press(getByTestId("share-qr")));
  await act(async () => fireEvent(getByTestId("tag-qr-press"), "longPress"));
  expect(mockShareQr).toHaveBeenCalledTimes(2);
  expect(mockShareQr.mock.calls[0][0]).toMatchObject({ petName: "Busdy", url: "https://web/p/tag/TOK" });
});

test("a failed QR share says so", async () => {
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  mockShareQr.mockImplementationOnce(() => Promise.reject(new Error("x")));
  const { getByTestId } = render(<EmergencyCardScreen />);
  await act(async () => fireEvent.press(getByTestId("share-qr")));
  expect(alert).toHaveBeenCalledWith(es.qrShareError);
  alert.mockRestore();
});

test("the tag link and a vet link can be copied", async () => {
  const { getByTestId, getByText } = render(<EmergencyCardScreen />);
  await act(async () => fireEvent.press(getByTestId("copy-tag-link")));
  expect(Clipboard.setStringAsync).toHaveBeenLastCalledWith("https://web/p/tag/TOK");
  expect(getByText(es.linkCopied)).toBeTruthy();
  await act(async () => fireEvent.press(getByTestId("copy-link-7")));
  expect(Clipboard.setStringAsync).toHaveBeenLastCalledWith("https://web/p/card/L7");
});
