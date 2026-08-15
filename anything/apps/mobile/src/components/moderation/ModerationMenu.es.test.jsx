// PP2 — proof that the moderation menu is really localized, not just routed
// through t(). Every label here was hardcoded English before, on every UGC
// surface in the app (feed, comments, chat, events, forum, reviews, adoption).
// Same component, Spanish catalog.

import React from "react";
import { render, fireEvent, act } from "@testing-library/react-native";
import { Alert } from "react-native";

const mockReport = jest.fn(() => Promise.resolve({}));
const mockBlock = jest.fn(() => Promise.resolve({}));
jest.mock("@/hooks/useModeration", () => ({
  reportContent: (...args) => mockReport(...args),
  blockUser: (...args) => mockBlock(...args),
}));

jest.mock("react-i18next", () =>
  require("@/i18n/testMock").makeReactI18nextMock("es"),
);

jest.mock("lucide-react-native", () => {
  const React = require("react");
  const { Text } = require("react-native");
  return new Proxy(
    {},
    { get: (_t, name) => () => React.createElement(Text, null, String(name)) },
  );
});

import { ModerationMenu } from "./ModerationMenu";

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});

const openMenu = () => {
  const utils = render(
    <ModerationMenu targetType="post" targetId={5} authorUserId={9} />,
  );
  fireEvent.press(utils.getByLabelText("Más opciones"));
  return utils;
};

it("renders the action sheet in Spanish", () => {
  const { getByText } = openMenu();
  expect(getByText("Reportar")).toBeTruthy();
  expect(getByText("Bloquear usuario")).toBeTruthy();
  expect(getByText("Cancelar")).toBeTruthy();
});

it("renders the report reasons in Spanish", () => {
  const { getByLabelText, getByText } = openMenu();
  fireEvent.press(getByLabelText("Reportar"));
  expect(getByText("¿Por qué lo reportás?")).toBeTruthy();
  expect(getByText("Acoso o bullying")).toBeTruthy();
  expect(getByText("Discurso de odio")).toBeTruthy();
  // The a11y label interpolates the translated reason, not an English one.
  expect(getByLabelText("Motivo del reporte: Spam o estafa")).toBeTruthy();
});

it("sends the untranslated wire value and confirms in Spanish", async () => {
  const { getByLabelText } = openMenu();
  fireEvent.press(getByLabelText("Reportar"));
  await act(async () => {
    fireEvent.press(getByLabelText("Motivo del reporte: Acoso o bullying"));
  });
  // The reason KEY crosses the wire — the API contract must not be localized.
  expect(mockReport).toHaveBeenCalledWith({
    targetType: "post",
    targetId: 5,
    reason: "harassment",
  });
  expect(Alert.alert).toHaveBeenCalledWith(
    "Gracias por reportarlo",
    "Nuestro equipo lo va a revisar dentro de las próximas 24 horas.",
  );
});

it("asks for block confirmation in Spanish", () => {
  let buttons;
  Alert.alert.mockImplementation((_title, _msg, btns) => {
    buttons = btns;
  });
  const { getByLabelText } = openMenu();
  fireEvent.press(getByLabelText("Bloquear usuario"));
  expect(Alert.alert).toHaveBeenCalledWith(
    "¿Bloquear a esta persona?",
    expect.stringContaining("No van a ver"),
    expect.any(Array),
  );
  expect(buttons.map((b) => b.text)).toEqual(["Cancelar", "Bloquear"]);
});
