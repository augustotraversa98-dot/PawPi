import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

let mockProviders;
let mockHistory;

jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (_k, fb) => fb }) }));
jest.mock("@/components/RefreshableScrollView", () => {
  const { View } = require("react-native");
  return { RefreshableScrollView: ({ children }) => <View>{children}</View> };
});
jest.mock("@/components/Map/MapLocationView", () => {
  const { Text } = require("react-native");
  return ({ polyline }) => <Text testID="map">{`route:${polyline?.length ?? 0}`}</Text>;
});
jest.mock("@/hooks/useProviders", () => ({
  useMyProviders: () => mockProviders,
  useWalkerWalkHistory: () => mockHistory,
}));

import WalkerHistoryScreen from "./walker-history";

beforeEach(() => {
  mockProviders = { data: [{ id: 10, name: "Paw Walks" }], isLoading: false };
  mockHistory = { data: [], isLoading: false, isError: false, refetch: jest.fn() };
});

const FINISHED = {
  id: 1,
  pet_name: "Rex",
  ended_at: "2026-08-10T12:00:00Z",
  distance_m: 1200,
  duration_s: 1800,
  route: [
    { lat: -34.6, lng: -58.4, t: 1 },
    { lat: -34.61, lng: -58.41, t: 2 },
  ],
  pickup_lat: -34.6,
  pickup_lng: -58.4,
  photo_urls: ["https://cdn/p1.jpg"],
};

test("empty history → empty state", () => {
  const { getByText } = render(<WalkerHistoryScreen />);
  expect(getByText("No past walks yet")).toBeTruthy();
});

test("no walker provider → no-workspace state", () => {
  mockProviders = { data: [], isLoading: false };
  const { getByText } = render(<WalkerHistoryScreen />);
  expect(getByText("No walker workspace")).toBeTruthy();
});

test("lists a finished walk; expanding draws the route map + photos", () => {
  mockHistory = { data: [FINISHED], isLoading: false, isError: false, refetch: jest.fn() };
  const { getByTestId, queryByTestId } = render(<WalkerHistoryScreen />);
  // Collapsed: no map yet.
  expect(queryByTestId("history-map-1")).toBeNull();
  fireEvent.press(getByTestId("history-row-1"));
  // Expanded: the real route (2 points) is drawn + the photo shows.
  expect(getByTestId("history-map-1")).toBeTruthy();
  expect(getByTestId("map").props.children).toBe("route:2");
  expect(getByTestId("history-photo-1-0")).toBeTruthy();
});

test("a walk with no route renders the 'No route recorded' note, not a crash", () => {
  mockHistory = {
    data: [{ ...FINISHED, route: [], pickup_lat: null, pickup_lng: null }],
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  };
  const { getByTestId, queryByTestId } = render(<WalkerHistoryScreen />);
  fireEvent.press(getByTestId("history-row-1"));
  expect(getByTestId("history-noroute-1")).toBeTruthy();
  expect(queryByTestId("history-map-1")).toBeNull();
});
