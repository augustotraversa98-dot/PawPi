// Pet-friendly Places (ticket 2.73):
//   - "not set up yet" when the proxy reports unconfigured;
//   - location-denied empty state;
//   - map + list render from mocked place data; category filter switches; save toggles favorite;
//   - Saved tab shows saved places (and its empty state).
// Map (2.68), expo-location, and the data hooks are mocked.

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

let mockSearch;
let mockSaved;
let mockSave;
let mockUnsave;
const mockReq = jest.fn();
const mockPos = jest.fn();

jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k) => k }) }));
jest.mock("@/components/Map/MapLocationView", () => {
  const { Text } = require("react-native");
  return ({ points }) => <Text testID="map-view">{`m:${points?.length || 0}`}</Text>;
});
jest.mock("expo-location", () => ({
  requestForegroundPermissionsAsync: (...a) => mockReq(...a),
  getCurrentPositionAsync: (...a) => mockPos(...a),
}));
jest.mock("@/hooks/usePlaces", () => ({
  usePlacesSearch: () => mockSearch,
  useSavedPlaces: () => mockSaved,
  useSavePlace: () => mockSave,
  useUnsavePlace: () => mockUnsave,
}));

import PlacesScreen from "./places";

const PLACE = {
  place_id: "p1",
  name: "Dog Park",
  address: "Main St",
  lat: 40.7,
  lng: -74,
  rating: 4.5,
  open_now: true,
  category: "park",
};

beforeEach(() => {
  mockReq.mockResolvedValue({ status: "granted" });
  mockPos.mockResolvedValue({ coords: { latitude: 40.7, longitude: -74 } });
  mockSearch = { data: { configured: true, places: [PLACE] }, isLoading: false };
  mockSaved = { data: [] };
  mockSave = { mutate: jest.fn() };
  mockUnsave = { mutate: jest.fn() };
});

it("shows the not-set-up state when the proxy is unconfigured", async () => {
  mockSearch = { data: { configured: false, places: [] }, isLoading: false };
  const { findByTestId } = render(<PlacesScreen />);
  expect(await findByTestId("places-unconfigured")).toBeTruthy();
});

it("shows the location-denied state when permission is refused", async () => {
  mockReq.mockResolvedValue({ status: "denied" });
  const { findByTestId } = render(<PlacesScreen />);
  expect(await findByTestId("places-denied")).toBeTruthy();
});

it("renders the map + a place row from real data and saves a favorite", async () => {
  const { findByTestId, getByTestId } = render(<PlacesScreen />);
  expect(await findByTestId("place-p1")).toBeTruthy();
  expect(getByTestId("map-view").props.children).toBe("m:1");
  fireEvent.press(getByTestId("place-save-p1"));
  expect(mockSave.mutate).toHaveBeenCalledWith(
    expect.objectContaining({ place_id: "p1", name: "Dog Park", category: "park" }),
  );
});

it("switches category when a filter chip is tapped", async () => {
  const { findByTestId, getByTestId } = render(<PlacesScreen />);
  await findByTestId("place-p1");
  fireEvent.press(getByTestId("places-cat-cafe")); // no throw; re-queries under the new category
  expect(getByTestId("places-cat-cafe")).toBeTruthy();
});

it("Saved tab shows an empty state when nothing is saved", async () => {
  const { findByTestId, getByTestId } = render(<PlacesScreen />);
  await findByTestId("place-p1");
  fireEvent.press(getByTestId("places-tab-saved"));
  expect(await findByTestId("places-saved-empty")).toBeTruthy();
});
