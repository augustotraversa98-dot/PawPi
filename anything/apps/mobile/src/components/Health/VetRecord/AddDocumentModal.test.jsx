// Ticket 2.41 — owner adds a Vet Record document: pick a photo + name → upload →
// POST /api/vet-record/documents → onSaved + close. Native deps are mocked.

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

const mockUpload = jest.fn();
const mockLaunch = jest.fn();

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("lucide-react-native", () =>
  new Proxy({}, { get: () => () => null }),
);
jest.mock("expo-image-picker", () => ({
  MediaTypeOptions: { Images: "Images" },
  requestMediaLibraryPermissionsAsync: () =>
    Promise.resolve({ granted: true }),
  launchImageLibraryAsync: (...args) => mockLaunch(...args),
}));
jest.mock("@/utils/useUpload", () => ({
  useUpload: () => [mockUpload, { loading: false }],
}));
jest.mock("@/components/DateField", () => () => null);
jest.mock("@/components/KeyboardAwareScrollView", () => {
  const { ScrollView } = require("react-native");
  return (props) => <ScrollView {...props} />;
});
jest.mock("@/utils/dateUtils", () => ({
  getLocalPostDateString: () => "2026-06-18",
}));

import { AddDocumentModal } from "./AddDocumentModal";

beforeEach(() => {
  mockUpload.mockReset();
  mockLaunch.mockReset();
  global.fetch = jest.fn();
});

test("renders the add-document form", () => {
  const { getByText, getByTestId } = render(
    <AddDocumentModal visible petId={3} onClose={jest.fn()} onSaved={jest.fn()} />,
  );
  expect(getByText("Add document")).toBeTruthy();
  expect(getByTestId("pick-document-photo")).toBeTruthy();
});

test("uploads the photo and POSTs the document, then refetches + closes", async () => {
  mockLaunch.mockResolvedValue({
    canceled: false,
    assets: [{ uri: "file:///paper.jpg" }],
  });
  mockUpload.mockResolvedValue({ url: "https://cdn/paper.jpg" });
  global.fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });

  const onSaved = jest.fn();
  const onClose = jest.fn();
  const { getByTestId, getByText, getByPlaceholderText } = render(
    <AddDocumentModal visible petId={3} onClose={onClose} onSaved={onSaved} />,
  );

  fireEvent.changeText(getByPlaceholderText("e.g. Rabies certificate"), "Labwork");
  await waitFor(() => fireEvent.press(getByTestId("pick-document-photo")));

  fireEvent.press(getByText("Save document"));

  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  expect(mockUpload).toHaveBeenCalled();
  expect(global.fetch).toHaveBeenCalledWith(
    "/api/vet-record/documents",
    expect.objectContaining({ method: "POST" }),
  );
  // The POST body carries the owner-supplied fields + the uploaded URL.
  const body = JSON.parse(global.fetch.mock.calls[0][1].body);
  expect(body).toMatchObject({
    petId: 3,
    name: "Labwork",
    fileUrl: "https://cdn/paper.jpg",
    documentDate: "2026-06-18",
  });
  expect(onClose).toHaveBeenCalled();
});
