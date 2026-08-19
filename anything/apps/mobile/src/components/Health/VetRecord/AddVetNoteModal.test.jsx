// Ticket 2.42 — owner adds a dated entry to the append-only history log.

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

jest.mock("react-i18next", () => require("@/i18n/testMock").makeReactI18nextMock());
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("lucide-react-native", () =>
  new Proxy({}, { get: () => () => null }),
);
jest.mock("@/components/DateField", () => () => null);
jest.mock("@/components/KeyboardAwareScrollView", () => {
  const { ScrollView } = require("react-native");
  return (props) => <ScrollView {...props} />;
});
jest.mock("@/utils/dateUtils", () => ({
  getLocalPostDateString: () => "2026-06-18",
}));

import { AddVetNoteModal } from "./AddVetNoteModal";

beforeEach(() => {
  global.fetch = jest.fn();
});

test("renders the append-only framing", () => {
  const { getByText } = render(
    <AddVetNoteModal visible petId={3} onClose={jest.fn()} onSaved={jest.fn()} />,
  );
  expect(getByText("Add to history")).toBeTruthy();
  expect(getByText(/append-only/i)).toBeTruthy();
});

test("POSTs an owner-authored entry (no vetName) then refetches + closes", async () => {
  global.fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
  const onSaved = jest.fn();
  const onClose = jest.fn();
  const { getByText, getByPlaceholderText } = render(
    <AddVetNoteModal visible petId={3} onClose={onClose} onSaved={onSaved} />,
  );

  fireEvent.changeText(
    getByPlaceholderText(/What happened/i),
    "Limping on left paw",
  );
  fireEvent.press(getByText("Add entry"));

  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  expect(global.fetch).toHaveBeenCalledWith(
    "/api/vet-record/notes",
    expect.objectContaining({ method: "POST" }),
  );
  const body = JSON.parse(global.fetch.mock.calls[0][1].body);
  expect(body).toMatchObject({
    petId: 3,
    noteDate: "2026-06-18",
    note: "Limping on left paw",
  });
  expect(body.vetName).toBeUndefined(); // owner-authored → labelled "You"
  expect(onClose).toHaveBeenCalled();
});
