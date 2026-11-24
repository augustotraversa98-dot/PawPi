// Family sharing (PR5a): "Add a dog" can never create a duplicate of a dog the person already has — owned OR shared with them — and every
// create carries an Idempotency-Key that is reused by retries of the same attempt.
import React from "react";
import { Alert } from "react-native";
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";

let mockPets;
const mockMutateAsync = jest.fn();
const mockSetCurrentPet = jest.fn();
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("expo-image", () => ({ Image: () => null }));
jest.mock("expo-image-picker", () => ({}));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("react-i18next", () => ({
  useTranslation: () => require("@/i18n/testMock").makeReactI18nextMock(global.__lang || "en").useTranslation(),
}));
jest.mock("@/hooks/usePetProfile", () => ({
  usePetProfile: () => ({ data: mockPets }),
  useCurrentPet: () => ({ setCurrentPet: mockSetCurrentPet }),
  useCreatePet: () => ({ mutateAsync: mockMutateAsync }),
}));
jest.mock("@/utils/useUpload", () => () => [jest.fn(), { loading: false }]);
jest.mock("@/components/DateField", () => () => null);
jest.mock("@/components/BreedPicker", () => () => null);
jest.mock("@/components/KeyboardSafeSheet", () => {
  const { View } = require("react-native");
  return ({ visible, header, footer, children }) => (visible ? <View>{header}{children}{footer}</View> : null);
});
jest.mock("@/telemetry/track", () => ({ trackFeature: jest.fn() }));
jest.mock("@/telemetry/useFormTelemetry", () => ({ useFormTelemetry: () => ({ complete: jest.fn(), error: jest.fn() }) }));

import { AddDogModal } from "./AddDogModal";

const own = { id: 1, name: "Mango", is_shared: false, access_role: "owner" };
const shared = { id: 7, name: "Luna", is_shared: true, access_role: "family", owner_display: { full_name: "Sam" } };

let alertSpy;
beforeEach(() => {
  jest.clearAllMocks();
  global.__lang = "en";
  mockPets = [own, shared];
  mockMutateAsync.mockResolvedValue({ pet: { id: 55 } });
  alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
});
afterEach(() => alertSpy.mockRestore());
afterAll(() => {
  delete global.__lang;
});

const typeName = (utils, name) => {
  const input = utils.UNSAFE_getAllByType(require("react-native").TextInput)[0];
  fireEvent.changeText(input, name);
};
const press = (utils, label) => fireEvent.press(utils.getByText(label));

const open = () => render(<AddDogModal visible onClose={jest.fn()} />);

test("a brand-new name creates the dog right away, with an Idempotency-Key, and makes it active", async () => {
  const u = open();
  typeName(u, "Rex");
  press(u, "Save");
  await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
  const arg = mockMutateAsync.mock.calls[0][0];
  expect(arg.name).toBe("Rex");
  expect(arg.idempotencyKey).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(alertSpy).toHaveBeenCalledTimes(1); // only the "saved" message
  await waitFor(() => expect(mockSetCurrentPet).toHaveBeenCalledWith(55));
});

test("the same name as a dog SHARED with the person asks first, and creating nothing if they cancel", async () => {
  const u = open();
  typeName(u, "  luna ");
  press(u, "Save");
  expect(mockMutateAsync).not.toHaveBeenCalled();
  expect(alertSpy).toHaveBeenCalledTimes(1);
  const [title, body, buttons] = alertSpy.mock.calls[0];
  expect(title).toContain("luna");
  expect(body).toContain("shared with you");
  expect(buttons.map((b) => b.text)).toEqual(["No, cancel", "It's a different dog"]);
  buttons[0].onPress?.();
  expect(mockMutateAsync).not.toHaveBeenCalled();
});

test("…and goes ahead (exactly once) when the person says it is a different dog", async () => {
  const u = open();
  typeName(u, "Luna");
  press(u, "Save");
  const buttons = alertSpy.mock.calls[0][2];
  await act(async () => {
    buttons.find((b) => b.text === "It's a different dog").onPress();
  });
  await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
  expect(mockMutateAsync.mock.calls[0][0].idempotencyKey).toBeTruthy();
});

test("the same name as one of their OWN dogs asks first too", () => {
  const u = open();
  typeName(u, "Mango");
  press(u, "Save");
  expect(mockMutateAsync).not.toHaveBeenCalled();
  expect(alertSpy.mock.calls[0][1]).toContain("already have a dog called Mango");
});

test("a retry after a failure reuses the SAME Idempotency-Key (a lost response cannot create a second dog)", async () => {
  mockMutateAsync.mockRejectedValueOnce(new Error("network"));
  const u = open();
  typeName(u, "Rex");
  press(u, "Save");
  await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(alertSpy).toHaveBeenCalled()); // the friendly error
  press(u, "Save");
  await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(2));
  expect(mockMutateAsync.mock.calls[1][0].idempotencyKey).toBe(mockMutateAsync.mock.calls[0][0].idempotencyKey);
});

test("changing the name after a failure is a different dog: a NEW key", async () => {
  mockMutateAsync.mockRejectedValueOnce(new Error("network"));
  const u = open();
  typeName(u, "Rex");
  press(u, "Save");
  await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(alertSpy).toHaveBeenCalled());
  typeName(u, "Rexy");
  press(u, "Save");
  await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(2));
  expect(mockMutateAsync.mock.calls[1][0].idempotencyKey).not.toBe(mockMutateAsync.mock.calls[0][0].idempotencyKey);
});

test("Spanish: the duplicate question is in Spanish", () => {
  global.__lang = "es";
  const u = open();
  typeName(u, "Luna");
  press(u, "Guardar");
  expect(alertSpy.mock.calls[0][1]).toContain("te lo compartieron");
  expect(alertSpy.mock.calls[0][2].map((b) => b.text)).toEqual(["No, cancelar", "Es otro perro"]);
});
