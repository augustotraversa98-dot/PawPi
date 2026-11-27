// Emergency Card responsiveness (TestFlight: "the buttons are really slow"). Runs the REAL hooks against a
// QueryClient with a fetch whose responses are held open, so the test can see what the screen does BEFORE the
// server answers, how many requests one tap costs, and how often the QR code is redrawn.

jest.mock("react-i18next", () => require("@/i18n/testMock").makeReactI18nextMock());
import React from "react";
import { render, fireEvent, act, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Alert } from "react-native";

let mockQrRenders = 0;

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({ petId: "5" }),
}));
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("react-native-qrcode-svg", () => () => {
  mockQrRenders += 1;
  return null;
});
jest.mock("react-native-view-shot", () => ({ captureRef: jest.fn() }));
jest.mock("expo-sharing", () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn() }));
jest.mock("expo-file-system", () => ({ File: jest.fn(), Paths: { cache: "file:///cache" } }));
jest.mock("@/components/Pets/PetAvatar", () => ({ PetAvatar: () => null }));
jest.mock("@/hooks/usePetProfile", () => ({ useCurrentPet: () => ({ data: { id: 5 } }) }));

import EmergencyCardScreen from "./emergency-card";

const CARD = {
  id: 1,
  pet_id: 5,
  tag_token: "TOK",
  show_medical_on_tag: false,
  contact_mode: "relay",
  contact_value: null,
  blood_type: null,
  active: true,
};
let extraCardFields = {};
const payload = () => ({
  card: { ...CARD, ...extraCardFields },
  pet: { id: 5, name: "Rex", species: "dog", breed: "Beagle", avatar_url: "" },
  medical: null,
  allergies: [],
  conditions: [],
  lost: null,
  links: [{ id: 7, token: "L7", scope: "full", expires_at: null }],
});

// Every request except the first load stays pending until the test answers it.
let requests;
let held;
const respond = (body, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body });

beforeEach(() => {
  extraCardFields = {};
  mockQrRenders = 0;
  requests = [];
  held = [];
  let firstLoad = true;
  global.fetch = jest.fn((url, init = {}) => {
    const req = { url, method: init.method || "GET", body: init.body ? JSON.parse(init.body) : null };
    requests.push(req);
    if (req.method === "GET" && firstLoad) {
      firstLoad = false;
      return Promise.resolve(respond(payload()));
    }
    return new Promise((resolve) => held.push({ req, resolve }));
  });
});

const clients = [];
afterEach(() => {
  clients.splice(0).forEach((c) => c.clear());
});

async function open() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } });
  clients.push(client);
  const api = render(
    <QueryClientProvider client={client}>
      <EmergencyCardScreen />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(api.getByTestId("toggle-medical")).toBeTruthy());
  return { api, client };
}
const tick = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const chipSelected = (api, id) => api.getByTestId(id).props.accessibilityState?.selected === true;

test("a toggle and a contact-mode tap show immediately, cost one request each and never redraw the QR", async () => {
  const { api } = await open();
  const rendersAfterLoad = mockQrRenders;

  fireEvent(api.getByTestId("toggle-medical"), "valueChange", true);
  await tick();
  // Nothing has answered yet: the switch is already on.
  expect(api.getByTestId("toggle-medical").props.value).toBe(true);

  await act(async () => held.shift().resolve(respond({ card: { ...CARD, show_medical_on_tag: true } })));
  await tick();

  fireEvent.press(api.getByTestId("contact-none"));
  await tick();
  expect(chipSelected(api, "contact-none")).toBe(true);
  await act(async () =>
    held.shift().resolve(respond({ card: { ...CARD, show_medical_on_tag: true, contact_mode: "none" } })),
  );
  await tick();

  expect(requests.map((r) => r.method)).toEqual(["GET", "PATCH", "PATCH"]); // no refetch after a save
  expect(mockQrRenders - rendersAfterLoad).toBe(0);
});

test("quick taps are sent one at a time, in order, and an older answer never undoes a newer tap", async () => {
  const { api } = await open();

  fireEvent.press(api.getByTestId("contact-phone"));
  await tick();
  fireEvent.press(api.getByTestId("contact-email"));
  await tick();

  expect(chipSelected(api, "contact-email")).toBe(true);
  expect(requests.filter((r) => r.method === "PATCH")).toHaveLength(1); // the second waits its turn

  await act(async () => held.shift().resolve(respond({ card: { ...CARD, contact_mode: "phone" } })));
  await tick();
  expect(chipSelected(api, "contact-email")).toBe(true);
  expect(requests.filter((r) => r.method === "PATCH").map((r) => r.body.contact_mode)).toEqual(["phone", "email"]);

  await act(async () => held.shift().resolve(respond({ card: { ...CARD, contact_mode: "email" } })));
  await tick();
  expect(chipSelected(api, "contact-email")).toBe(true);
});

test("the phone and email switches show at once, cost one request each and are sent in order", async () => {
  const channels = {
    contact_phone_enabled: false,
    contact_email_enabled: false,
    contact_message_enabled: true,
    contact_phone: "11 5555",
    contact_email: "ana@example.test",
  };
  extraCardFields = channels;
  const { api } = await open();
  const rendersAfterLoad = mockQrRenders;
  const isOn = (id) => api.getByTestId(id).props.value;

  fireEvent(api.getByTestId("toggle-contact-phone"), "valueChange", true);
  await tick();
  fireEvent(api.getByTestId("toggle-contact-email"), "valueChange", true);
  await tick();
  expect([isOn("toggle-contact-phone"), isOn("toggle-contact-email")]).toEqual([true, true]);

  const phoneOnly = { ...CARD, ...channels, contact_phone_enabled: true };
  await act(async () => held.shift().resolve(respond({ card: phoneOnly })));
  await tick();
  expect(isOn("toggle-contact-email")).toBe(true); // the older answer does not undo the newer tap
  await act(async () => held.shift().resolve(respond({ card: { ...phoneOnly, contact_email_enabled: true } })));
  await tick();

  expect(requests.map((r) => r.body)).toEqual([
    null,
    { petId: "5", contact_phone_enabled: true },
    { petId: "5", contact_email_enabled: true },
  ]);
  expect(mockQrRenders - rendersAfterLoad).toBe(0);
});

test("a server that ignores the switches counts as a failed save, and the screen shows what it really has", async () => {
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  extraCardFields = { contact_phone_enabled: false, contact_email_enabled: false, contact_message_enabled: true };
  const { api } = await open();

  fireEvent(api.getByTestId("toggle-contact-phone"), "valueChange", true);
  await tick();
  await act(async () => held.shift().resolve(respond({ card: { ...CARD } }))); // 200, no channel fields
  await tick();

  expect(alert).toHaveBeenCalledWith("Could not save. Please try again.");
  expect(api.getByTestId("toggle-contact-phone").props.value).toBe(false);
  await act(async () => held.shift().resolve(respond({ ...payload(), card: { ...CARD } }))); // the re-read
  await tick();
  expect(api.queryByTestId("toggle-contact-phone")).toBeNull();
  expect(api.getByTestId("contact-relay")).toBeTruthy();
  alert.mockRestore();
});

test("a failed save rolls the control back and says so", async () => {
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  const { api } = await open();

  fireEvent(api.getByTestId("toggle-medical"), "valueChange", true);
  await tick();
  expect(api.getByTestId("toggle-medical").props.value).toBe(true);

  await act(async () => held.shift().resolve(respond({ error: "no" }, false)));
  await tick();

  expect(api.getByTestId("toggle-medical").props.value).toBe(false);
  expect(alert).toHaveBeenCalledWith("Could not save. Please try again.");
  alert.mockRestore();
});

test("revoking removes the link at once and brings it back if the server refuses", async () => {
  const alert = jest.spyOn(Alert, "alert").mockImplementation((title, body, buttons) => {
    buttons?.find((b) => b.style === "destructive")?.onPress();
  });
  const { api } = await open();

  fireEvent.press(api.getByTestId("revoke-link-7"));
  await tick();
  expect(api.queryByTestId("revoke-link-7")).toBeNull();

  await act(async () => held.shift().resolve(respond({ error: "no" }, false)));
  await tick();
  expect(api.getByTestId("revoke-link-7")).toBeTruthy();
  expect(alert).toHaveBeenLastCalledWith("Could not save. Please try again.");
  alert.mockRestore();
});

test("a new link appears from the POST answer alone, and the save button rests until the choice changes", async () => {
  const { api } = await open();

  fireEvent.press(api.getByTestId("create-link"));
  await tick();
  expect(api.getByTestId("create-link").props.accessibilityState?.disabled).toBe(true);
  await act(async () =>
    held.shift().resolve(respond({ link: { id: 9, token: "L9", scope: "full", expires_at: null } })),
  );
  await tick();

  expect(api.getByTestId("revoke-link-9")).toBeTruthy();
  expect(requests.map((r) => r.method)).toEqual(["GET", "POST"]); // no refetch
  expect(api.getByTestId("create-link").props.accessibilityState?.disabled).toBe(true);

  fireEvent.press(api.getByTestId("scope-basic"));
  await tick();
  expect(api.getByTestId("create-link").props.accessibilityState?.disabled).toBe(false);
});
