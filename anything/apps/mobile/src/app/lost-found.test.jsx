// Render pins for the Lost & Found screen (ticket 2.48):
//   - active alerts render in the "near me" tab; tapping reports a sighting;
//   - the "My pet" tab marks the current pet lost (fires markLost);
//   - when the pet is already lost, the active report shows a Resolve action.
// Native deps (maps, location) + data hooks are mocked.

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

let mockNearby;
let mockMine;
let mockReport;
let mockMark;
let mockSighting;
let mockResolve;

jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("expo-location", () => ({
  requestForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: "denied" }),
  getCurrentPositionAsync: jest.fn(),
}));
jest.mock("@/components/SocialWalks/WalkMapPicker", () => {
  const { Text, TouchableOpacity } = require("react-native");
  return ({ onPick }) => (
    <TouchableOpacity testID="mock-pin" onPress={() => onPick({ lat: 40.7, lng: -74 })}>
      <Text>pin</Text>
    </TouchableOpacity>
  );
});
jest.mock("@/hooks/usePetProfile", () => ({
  useCurrentPet: () => ({ data: { id: 1, name: "Rex" } }),
}));
jest.mock("@/hooks/useLostFound", () => ({
  useLostReports: () => mockNearby,
  useMyLostReports: () => mockMine,
  useLostReport: () => mockReport,
  useMarkLost: () => mockMark,
  useReportSighting: () => mockSighting,
  useResolveLost: () => mockResolve,
}));

import LostFoundScreen from "./lost-found";

beforeEach(() => {
  mockNearby = {
    data: [{ id: 5, pet_id: 9, pet_name: "Buddy", last_seen_area: "Park", status: "active" }],
    isLoading: false,
  };
  mockMine = { data: [] };
  mockReport = { data: { report: {}, sightings: [] } };
  mockMark = { mutate: jest.fn(), isPending: false };
  mockSighting = { mutate: jest.fn(), isPending: false };
  mockResolve = { mutate: jest.fn(), isPending: false };
});

test("active alerts render in the near-me tab", () => {
  const { getByText } = render(<LostFoundScreen />);
  expect(getByText("Buddy")).toBeTruthy();
  expect(getByText(/Last seen: Park/)).toBeTruthy();
});

test("reporting a sighting fires the sighting mutation", () => {
  const { getByTestId } = render(<LostFoundScreen />);
  fireEvent.press(getByTestId("report-sighting-5"));
  fireEvent.changeText(getByTestId("sighting-note"), "Saw it near the lake");
  fireEvent.press(getByTestId("sighting-submit"));
  expect(mockSighting.mutate).toHaveBeenCalledTimes(1);
  expect(mockSighting.mutate.mock.calls[0][0]).toMatchObject({ note: "Saw it near the lake" });
});

test("the My pet tab marks the current pet lost", () => {
  const { getByTestId } = render(<LostFoundScreen />);
  fireEvent.press(getByTestId("tab-mine"));
  fireEvent.press(getByTestId("mark-lost-open"));
  fireEvent.press(getByTestId("mock-pin")); // drop a last-seen pin
  fireEvent.changeText(getByTestId("lost-area"), "Main St");
  fireEvent.press(getByTestId("mark-lost-submit"));
  expect(mockMark.mutate).toHaveBeenCalledTimes(1);
  expect(mockMark.mutate.mock.calls[0][0]).toMatchObject({
    petId: 1,
    lat: 40.7,
    lng: -74,
    lastSeenArea: "Main St",
  });
});

test("an already-lost pet shows the resolve action", () => {
  mockMine = { data: [{ id: 7, pet_id: 1, pet_name: "Rex", status: "active", last_seen_area: "Park" }] };
  const { getByTestId } = render(<LostFoundScreen />);
  fireEvent.press(getByTestId("tab-mine"));
  fireEvent.press(getByTestId("resolve-lost"));
  expect(mockResolve.mutate).toHaveBeenCalledWith(7);
});
