// Emergency Card: phone and email are switched on separately (both, one, or neither), rendered with the REAL
// Spanish catalog. A server without the switches (no channel fields on the card) still gets the single choice.

jest.mock("react-i18next", () => require("@/i18n/testMock").makeReactI18nextMock("es"));
import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

let mockData;
const mockUpdate = jest.fn();

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
jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn() }));
jest.mock("@/utils/emergencyQrShare", () => ({ shareQrImage: jest.fn() }));
jest.mock("@/components/Pets/PetAvatar", () => ({ PetAvatar: () => null }));
jest.mock("@/hooks/usePetProfile", () => ({ useCurrentPet: () => ({ data: { id: 5 } }) }));
jest.mock("@/hooks/useEmergencyCard", () => ({
  useEmergencyCard: () => ({ data: mockData, isLoading: false, isError: false, refetch: jest.fn() }),
  useUpdateEmergencyCard: () => ({ mutate: mockUpdate }),
  useCreateEmergencyLink: () => ({ mutate: jest.fn() }),
  useRevokeEmergencyLink: () => ({ mutate: jest.fn() }),
  tagUrl: (token) => `https://web/p/tag/${token}`,
  cardUrl: (token) => `https://web/p/card/${token}`,
}));

import EmergencyCardScreen from "./emergency-card";
import KeyboardAwareScrollView from "@/components/KeyboardAwareScrollView";

const es = require("@/i18n/locales/es.json").emergencyCard;

const channels = (over = {}) => ({
  contact_phone_enabled: false,
  contact_email_enabled: false,
  contact_message_enabled: true,
  contact_phone: null,
  contact_email: null,
  ...over,
});
const open = (over) => {
  Object.assign(mockData.card, channels(over));
  return render(<EmergencyCardScreen />);
};

beforeEach(() => {
  jest.clearAllMocks();
  mockData = {
    card: { id: 1, pet_id: 5, tag_token: "TOK", contact_mode: "relay", contact_value: null },
    pet: { id: 5, name: "Busdy", species: "dog", breed: null },
    medical: null,
    allergies: [],
    conditions: [],
    lost: null,
    links: [],
  };
});

test("offers two switches instead of the single choice", () => {
  const api = open();
  expect(api.getByText(es.showPhoneToFinder)).toBeTruthy();
  expect(api.getByText(es.showEmailToFinder)).toBeTruthy();
  for (const mode of ["relay", "phone", "email", "none"]) expect(api.queryByTestId(`contact-${mode}`)).toBeNull();
});

test.each([[undefined], [null]])("keeps the single choice when the server has no switches (%p)", (value) => {
  mockData.card.contact_phone_enabled = value;
  const api = render(<EmergencyCardScreen />);
  expect(api.getByTestId("contact-phone")).toBeTruthy();
  expect(api.queryByTestId("toggle-contact-phone")).toBeNull();
  fireEvent.press(api.getByTestId("contact-email"));
  expect(mockUpdate).toHaveBeenCalledWith({ contact_mode: "email" });
});

test.each([
  ["toggle-contact-phone", "contact_phone_enabled"],
  ["toggle-contact-email", "contact_email_enabled"],
])("%s saves only its own channel", (testID, field) => {
  const api = open();
  fireEvent(api.getByTestId(testID), "valueChange", true);
  expect(mockUpdate.mock.calls).toEqual([[{ [field]: true }]]);
});

test.each([
  ["both off, message on", {}, "contactRelayHint", [false, false, true]],
  ["both off, message off", { contact_message_enabled: false }, "contactNoneHint", [false, false, true]],
  ["phone", { contact_phone_enabled: true }, "channelsPhoneHint", [true, false, false]],
  ["email", { contact_email_enabled: true }, "channelsEmailHint", [false, true, false]],
  ["both", { contact_phone_enabled: true, contact_email_enabled: true }, "channelsBothHint", [true, true, false]],
])("%s: one field per channel that is on, the message switch only with both off", (_name, over, hint, shown) => {
  const api = open(over);
  const [phoneField, emailField, messageSwitch] = shown;
  expect(!!api.queryByTestId("contact-phone-value")).toBe(phoneField);
  expect(!!api.queryByTestId("contact-email-value")).toBe(emailField);
  expect(!!api.queryByTestId("toggle-contact-message")).toBe(messageSwitch);
  expect(api.getByText(es[hint])).toBeTruthy();
});

test("the message switch shows the saved choice and saves it", () => {
  const api = open({ contact_message_enabled: false });
  expect(api.getByText(es.allowFinderMessage)).toBeTruthy();
  expect(api.getByTestId("toggle-contact-message").props.value).toBe(false);
  fireEvent(api.getByTestId("toggle-contact-message"), "valueChange", true);
  expect(mockUpdate).toHaveBeenCalledWith({ contact_message_enabled: true });
});

test("each field saves its own value", () => {
  const api = open({ contact_phone_enabled: true, contact_email_enabled: true });
  fireEvent.changeText(api.getByTestId("contact-phone-value"), "11 5555");
  fireEvent.press(api.getByTestId("contact-phone-save"));
  fireEvent.changeText(api.getByTestId("contact-email-value"), "ana@example.test");
  fireEvent(api.getByTestId("contact-email-value"), "endEditing", { nativeEvent: { text: "ana@example.test" } });
  expect(mockUpdate.mock.calls).toEqual([[{ contact_phone: "11 5555" }], [{ contact_email: "ana@example.test" }]]);
});

const BOTH = { contact_phone_enabled: true, contact_email_enabled: true };
const warning = (api, channel) => api.queryByTestId(`contact-${channel}-warning`)?.props.children ?? null;

test.each([
  // Nothing at all to show: the finder gets the message form, and each warning says so.
  [null, null, "contactPhoneMissing", "contactEmailMissing"],
  ["ana@example.test", "11 5555", "contactPhoneMismatch", "contactEmailMismatch"],
  // The other channel shows, so there is no form: the warning only says this one is not shown.
  [null, "ana@example.test", "contactPhoneMissingHidden", null],
  ["ana@example.test", "ana@example.test", "contactPhoneMismatchHidden", null],
  ["11 5555", " ", null, "contactEmailMissingHidden"],
  ["11 5555", "11 5555", null, "contactEmailMismatchHidden"],
  ["11 5555", "ana@example.test", null, null],
])("both on with %p / %p warns per channel", (phone, email, phoneKey, emailKey) => {
  const api = open({ ...BOTH, contact_phone: phone, contact_email: email });
  expect(warning(api, "phone")).toBe(phoneKey ? es[phoneKey] : null);
  expect(warning(api, "email")).toBe(emailKey ? es[emailKey] : null);
});

test("a switched-off channel does not count as shown", () => {
  const api = open({ contact_phone_enabled: true, contact_email: "ana@example.test" });
  expect(warning(api, "phone")).toBe(es.contactPhoneMissing);
});

test("typing never remounts a field, even when the other channel changes, and it stays in the keyboard scroll", () => {
  const api = open({ contact_email_enabled: true });
  const field = api.getByTestId("contact-email-value");
  fireEvent.changeText(field, "a");
  Object.assign(mockData.card, { contact_phone_enabled: true });
  api.rerender(<EmergencyCardScreen />);
  fireEvent.changeText(api.getByTestId("contact-email-value"), "an");
  expect(api.getByTestId("contact-email-value")).toBe(field);
  expect(mockUpdate).not.toHaveBeenCalled();

  let node = field.parent;
  while (node && node.type !== KeyboardAwareScrollView) node = node.parent;
  expect(node).toBeTruthy();
});

test("a typed value is saved when its switch is turned off before saving", () => {
  const api = open({ contact_phone_enabled: true });
  fireEvent.changeText(api.getByTestId("contact-phone-value"), "11 5555");
  Object.assign(mockData.card, { contact_phone_enabled: false });
  api.rerender(<EmergencyCardScreen />);
  expect(mockUpdate).toHaveBeenCalledWith({ contact_phone: "11 5555" });
});
