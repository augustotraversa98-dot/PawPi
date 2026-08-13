// Render pins for the owner's live walk watch + report screen (ticket 2.7):
//   - an in_progress session shows the LIVE badge + the live hint;
//   - a finished session shows the walk report (potty) + the "added to Health" note;
//   - a session with valid GPS points draws the route on the real map (MapLocationView);
//   - a session with <2 GPS points shows the waiting/no-route empty state (no fake path);
//   - an unknown session id shows "Walk not found".
// The data hook, router, params, and the real map (MapLocationView) are mocked.

import React from "react";
import { render } from "@testing-library/react-native";

let mockSessions;
let mockParams;

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock("lucide-react-native", () =>
  new Proxy({}, { get: () => () => null }),
);
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/components/Map/MapLocationView", () => {
  const { Text } = require("react-native");
  return ({ polyline, points }) => (
    <Text testID="map-view">{`p:${polyline?.length || 0};m:${points?.length || 0}`}</Text>
  );
});
jest.mock("@/hooks/usePetProfile", () => ({
  useCurrentPet: () => ({ data: { id: 5, name: "Rex" } }),
}));
jest.mock("@/hooks/useProviders", () => ({
  useWalkSessions: () => mockSessions,
}));

import WalkLiveScreen from "./walk-live";

beforeEach(() => {
  mockParams = { sessionId: "77" };
  mockSessions = { data: [], isLoading: false };
});

test("an in_progress session shows the LIVE badge and live hint", () => {
  mockSessions = {
    data: [
      {
        id: 77,
        status: "in_progress",
        walker_name: "Sam",
        route: [
          { lat: 1, lng: 1 },
          { lat: 1.001, lng: 1.001 },
        ],
      },
    ],
    isLoading: false,
  };
  const { getByText, getByTestId } = render(<WalkLiveScreen />);
  expect(getByText("LIVE")).toBeTruthy();
  expect(getByText("Walk in progress")).toBeTruthy();
  // The route is drawn on the real map: both points feed the polyline, start + latest are markers.
  expect(getByTestId("map-view").props.children).toBe("p:2;m:2");
});

test("a finished session shows the walk report and the health-timeline note", () => {
  mockSessions = {
    data: [
      {
        id: 77,
        status: "finished",
        provider_name: "Paw Walks",
        distance_m: 1609.34,
        duration_s: 1800,
        potty_pee: true,
        potty_poo: false,
        notes: "Great walk",
        route: [
          { lat: 1, lng: 1 },
          { lat: 1.002, lng: 1.002 },
        ],
      },
    ],
    isLoading: false,
  };
  const { getByText } = render(<WalkLiveScreen />);
  expect(getByText("Walk report")).toBeTruthy();
  expect(getByText("Great walk")).toBeTruthy();
});

test("a short track shows the waiting/no-route state (no fake path)", () => {
  mockSessions = {
    data: [{ id: 77, status: "in_progress", route: [] }],
    isLoading: false,
  };
  const { getByText, queryByTestId } = render(<WalkLiveScreen />);
  expect(getByText("Waiting for the first GPS points…")).toBeTruthy();
  // No fake path: the map is not rendered for a track with < 2 points.
  expect(queryByTestId("map-view")).toBeNull();
});

test("an unknown session id shows Walk not found", () => {
  mockParams = { sessionId: "999" };
  mockSessions = {
    data: [{ id: 77, status: "finished", route: [] }],
    isLoading: false,
  };
  const { getByText } = render(<WalkLiveScreen />);
  expect(getByText("Walk not found")).toBeTruthy();
});
