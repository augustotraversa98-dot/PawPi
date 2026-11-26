// "Someone found your pet" in the bell: its own title (never the generic "Dueño/a"), the finder's message and
// contact, tap-to-call / tap-to-email, older rows without the contact, in Spanish and English.

import React from "react";
import { render, fireEvent, act } from "@testing-library/react-native";
import { Alert, Linking } from "react-native";

let mockDbNotifications;
let mockLang = "es";
const mockPush = jest.fn();
const mockBack = jest.fn();
const mockMarkRead = jest.fn();

jest.mock("expo-router", () => ({ useRouter: () => ({ back: mockBack, push: mockPush }) }));
jest.mock("react-i18next", () => {
  const catalogs = { en: require("@/i18n/locales/en.json"), es: require("@/i18n/locales/es.json") };
  return {
    useTranslation: () => ({
      t: (key, vars) => {
        let s = key.split(".").reduce((o, part) => (o == null ? o : o[part]), catalogs[mockLang]);
        if (typeof s !== "string") return key;
        for (const [name, val] of Object.entries(vars || {}))
          s = s.replace(new RegExp(`{{${name}}}`, "g"), String(val));
        return s;
      },
    }),
  };
});
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/store/socialPetStore", () => ({
  __esModule: true,
  default: (selector) =>
    selector({ notifications: [], markNotificationRead: jest.fn(), markAllNotificationsRead: jest.fn() }),
}));
jest.mock("@/hooks/useNotifications", () => ({
  useNotifications: () => ({ data: mockDbNotifications, isLoading: false, isError: false, refetch: jest.fn() }),
  useMarkNotificationsRead: () => ({ mutate: mockMarkRead }),
}));
jest.mock("@/hooks/useCareAccessGrants", () => ({ useAllCareAccessGrants: () => ({ data: [] }) }));
jest.mock("@/hooks/useRecentVetNotes", () => ({ useRecentVetNotes: () => ({ data: [] }) }));
jest.mock("@/hooks/usePetProfile", () => ({ useCurrentPet: () => ({ data: { id: 1, name: "Busdy" } }) }));
jest.mock("@/utils/handleNotificationTap", () => ({
  handleNotificationTap: jest.fn(),
  getNotificationDisplayInfo: () => ({ icon: "x", color: "#000000" }),
}));

import NotificationsScreen from "./notifications";

const row = (extra) => ({
  id: 31,
  type: "emergency_contact",
  subject_ref: "1",
  body: "Marta\nTel: +54 9 11 5555-0101\nEmail: marta@example.test\nEstá en la plaza",
  finder_contact: {
    pet_name: "Busdy",
    name: "Marta",
    phone: "+54 9 11 5555-0101",
    email: "marta@example.test",
    message: "Está en la plaza",
  },
  read_at: null,
  created_at: "2026-06-17T09:00:00.000Z",
  actor_username: null,
  actor_avatar: null,
  ...extra,
});

let openURL;
beforeEach(() => {
  jest.clearAllMocks();
  mockLang = "es";
  mockDbNotifications = [row()];
  openURL = jest.spyOn(Linking, "openURL").mockImplementation(() => Promise.resolve());
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});

test("Spanish: names the dog, flags the emergency and shows the message and contact", () => {
  const { getByText, queryByText, getByTestId } = render(<NotificationsScreen />);
  expect(getByText("Alguien encontró a Busdy")).toBeTruthy();
  expect(getByTestId("emergency-badge").props.children).toBe("Emergencia");
  expect(getByText("Está en la plaza")).toBeTruthy();
  expect(getByText("Marta")).toBeTruthy();
  expect(getByText("+54 9 11 5555-0101")).toBeTruthy();
  expect(getByText("marta@example.test")).toBeTruthy();
  expect(getByText("Llamar")).toBeTruthy();
  expect(getByText("Enviar email")).toBeTruthy();
  expect(queryByText("Dueño/a")).toBeNull();
});

test("English", () => {
  mockLang = "en";
  const { getByText, queryByText } = render(<NotificationsScreen />);
  expect(getByText("Someone found Busdy")).toBeTruthy();
  expect(getByText("Call")).toBeTruthy();
  expect(getByText("Send email")).toBeTruthy();
  expect(queryByText("Pet parent")).toBeNull();
});

test("Call and Email open the phone and mail links and mark it read", async () => {
  const { getByTestId } = render(<NotificationsScreen />);
  await act(async () => fireEvent.press(getByTestId("emergency-call")));
  expect(openURL).toHaveBeenLastCalledWith("tel:+5491155550101");
  await act(async () => fireEvent.press(getByTestId("emergency-email")));
  expect(openURL).toHaveBeenLastCalledWith("mailto:marta@example.test");
  expect(mockMarkRead).toHaveBeenCalledWith({ ids: [31] });
});

test("a link the phone cannot open shows the value instead", async () => {
  openURL.mockImplementation(() => Promise.reject(new Error("no handler")));
  const { getByTestId } = render(<NotificationsScreen />);
  await act(async () => fireEvent.press(getByTestId("emergency-call")));
  expect(Alert.alert).toHaveBeenCalledWith("No se pudo abrir", "+54 9 11 5555-0101");
});

test("tapping the card marks it read and stays on the screen", () => {
  const { getByText } = render(<NotificationsScreen />);
  fireEvent.press(getByText("Está en la plaza"));
  expect(mockMarkRead).toHaveBeenCalledWith({ ids: [31] });
  expect(mockBack).not.toHaveBeenCalled();
  expect(mockPush).not.toHaveBeenCalled();
});

test("only a phone: one button, and a plain line when no message was written", () => {
  mockDbNotifications = [row({ finder_contact: { pet_name: "Busdy", phone: "123456" } })];
  const { getByText, getByTestId, queryByTestId } = render(<NotificationsScreen />);
  expect(getByText("No dejaron un mensaje. Contactalos con estos datos.")).toBeTruthy();
  expect(getByTestId("emergency-call")).toBeTruthy();
  expect(queryByTestId("emergency-email")).toBeNull();
});

test("an address that is not a plain email gets no button", () => {
  mockDbNotifications = [row({ finder_contact: { email: "a@example.test?bcc=x@example.test", message: "hi" } })];
  const { queryByTestId } = render(<NotificationsScreen />);
  expect(queryByTestId("emergency-email")).toBeNull();
});

test.each([
  ["a row from before the finder contact existed", { finder_contact: null, body: "Hola" }, "Hola"],
  ["a server that does not send the field", { finder_contact: undefined, body: "Hola" }, "Hola"],
  ["an empty message", { finder_contact: null, body: "" }, "Alguien escribió desde la chapa de tu mascota."],
])("%s still gets a real title, and the text", (_name, extra, text) => {
  mockDbNotifications = [row(extra)];
  const { getByText, queryByText, queryByTestId } = render(<NotificationsScreen />);
  expect(getByText("Alguien encontró a tu mascota")).toBeTruthy();
  expect(getByText(text)).toBeTruthy();
  expect(queryByText("Dueño/a")).toBeNull();
  expect(queryByTestId("emergency-finder")).toBeNull();
});
