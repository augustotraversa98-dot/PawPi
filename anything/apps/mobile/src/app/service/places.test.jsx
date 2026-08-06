// Saved places screen (the Google browser is RETIRED). This is now just the favorites list:
//   - renders saved rows (name/address) with Directions + remove;
//   - remove calls useUnsavePlace(row.id);
//   - empty state when nothing is saved;
//   - it no longer consumes usePlacesSearch / the Google proxy.
// The favorites hooks are mocked; i18n resolves REAL en.json.

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

let mockSaved;
let mockUnsave;

jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("react-i18next", () =>
  require("@/i18n/testMock").makeReactI18nextMock(),
);
jest.mock("@/hooks/usePlaces", () => ({
  useSavedPlaces: () => mockSaved,
  useUnsavePlace: () => mockUnsave,
}));

import SavedPlacesScreen from "./places";

const SAVED = {
  id: 55,
  place_id: "curated-oveja-negra-san-isidro",
  name: "Oveja Negra",
  category: "cafe",
  address: "Av. Centenario 1",
  lat: -34.47,
  lng: -58.53,
};

beforeEach(() => {
  mockSaved = { data: [SAVED] };
  mockUnsave = { mutate: jest.fn() };
});

test("renders a saved favorite row (by our own place id)", () => {
  const { getByTestId, getByText } = render(<SavedPlacesScreen />);
  expect(getByTestId("place-curated-oveja-negra-san-isidro")).toBeTruthy();
  expect(getByText("Oveja Negra")).toBeTruthy();
});

test("remove calls useUnsavePlace with the saved row id", () => {
  const { getByTestId } = render(<SavedPlacesScreen />);
  fireEvent.press(getByTestId("place-remove-curated-oveja-negra-san-isidro"));
  expect(mockUnsave.mutate).toHaveBeenCalledWith(55);
});

test("empty state when nothing is saved", () => {
  mockSaved = { data: [] };
  const { getByTestId, getByText } = render(<SavedPlacesScreen />);
  expect(getByTestId("places-saved-empty")).toBeTruthy();
  expect(getByText("No saved places yet.")).toBeTruthy();
});
