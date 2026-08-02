// Unified discovery screen (Services Hub P2):
//   - ONE merged, deduped list — a provider with vet+grooming shows ONCE with both
//     capability chips;
//   - client-side search, each category filter, each sort (incl. Nearest w/ location);
//   - all five states: loading / location-denied / empty / no-results (+clear) / error (+retry);
//   - tapping a card opens the provider profile by slug.
// The data hook, router, expo-location and i18n are mocked. i18n resolves REAL en.json.

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

let mockDiscover;
const mockPush = jest.fn();
const mockReq = jest.fn();
const mockPos = jest.fn();
let mockParams = {};

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: mockPush }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock("react-i18next", () =>
  require("@/i18n/testMock").makeReactI18nextMock(),
);
jest.mock("lucide-react-native", () =>
  new Proxy({}, { get: () => () => null }),
);
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/components/RefreshableScrollView", () => {
  const { View } = require("react-native");
  return { RefreshableScrollView: ({ children }) => <View>{children}</View> };
});
jest.mock("expo-location", () => ({
  requestForegroundPermissionsAsync: (...a) => mockReq(...a),
  getCurrentPositionAsync: (...a) => mockPos(...a),
}));
jest.mock("@/hooks/useProviders", () => ({
  useDiscoverProviders: () => mockDiscover,
}));

import DiscoverScreen from "./discover";

const ok = (data) => ({ data, isLoading: false, isError: false, refetch: jest.fn() });

beforeEach(() => {
  mockPush.mockReset();
  mockParams = {};
  // Default: location denied → no distance, denied banner path.
  mockReq.mockResolvedValue({ status: "denied" });
  mockPos.mockResolvedValue({ coords: { latitude: 0, longitude: 0 } });
});

test("merged list: a vet+grooming provider appears ONCE with both capability chips", async () => {
  mockDiscover = ok([
    { id: 1, slug: "happy-paws", name: "Happy Paws", capabilities: ["vet", "groomer"] },
    { id: 2, slug: "shop-co", name: "Shop Co", capabilities: ["shop"] },
  ]);
  const { getByTestId, queryAllByTestId } = render(<DiscoverScreen />);

  await waitFor(() => expect(getByTestId("discover-card-1")).toBeTruthy());
  // exactly one card for provider 1
  expect(queryAllByTestId("discover-card-1")).toHaveLength(1);
  // both capability chips render
  expect(getByTestId("discover-cap-1-vet")).toBeTruthy();
  expect(getByTestId("discover-cap-1-groomer")).toBeTruthy();
  expect(getByTestId("discover-card-2")).toBeTruthy();
});

test("search filters the merged list by name (type-ahead)", async () => {
  mockDiscover = ok([
    { id: 1, slug: "happy-paws", name: "Happy Paws", capabilities: ["vet"] },
    { id: 2, slug: "shop-co", name: "Shop Co", capabilities: ["shop"] },
  ]);
  const { getByPlaceholderText, getByTestId, queryByTestId } = render(<DiscoverScreen />);
  await waitFor(() => expect(getByTestId("discover-card-1")).toBeTruthy());

  fireEvent.changeText(getByPlaceholderText("Search providers"), "shop");
  expect(getByTestId("discover-card-2")).toBeTruthy();
  expect(queryByTestId("discover-card-1")).toBeNull();
});

test("category chips filter by capability set (Veterinary vs Shops)", async () => {
  mockDiscover = ok([
    { id: 1, slug: "vet-co", name: "Vet Co", capabilities: ["vet"] },
    { id: 2, slug: "shop-co", name: "Shop Co", capabilities: ["shop"] },
    { id: 3, slug: "groom-co", name: "Groom Co", capabilities: ["groomer", "telehealth"] },
  ]);
  const { getByTestId, queryByTestId } = render(<DiscoverScreen />);
  await waitFor(() => expect(getByTestId("discover-card-1")).toBeTruthy());

  // All → 3 visible
  expect(getByTestId("discover-card-2")).toBeTruthy();
  expect(getByTestId("discover-card-3")).toBeTruthy();

  // Veterinary → vet + groomer/telehealth, NOT the pure shop
  fireEvent.press(getByTestId("discover-cat-veterinary"));
  expect(getByTestId("discover-card-1")).toBeTruthy();
  expect(getByTestId("discover-card-3")).toBeTruthy();
  expect(queryByTestId("discover-card-2")).toBeNull();

  // Shops → only the shop
  fireEvent.press(getByTestId("discover-cat-shops"));
  expect(getByTestId("discover-card-2")).toBeTruthy();
  expect(queryByTestId("discover-card-1")).toBeNull();
  expect(queryByTestId("discover-card-3")).toBeNull();
});

test("category can be pre-applied from the route param", async () => {
  mockParams = { category: "shops" };
  mockDiscover = ok([
    { id: 1, slug: "vet-co", name: "Vet Co", capabilities: ["vet"] },
    { id: 2, slug: "shop-co", name: "Shop Co", capabilities: ["shop"] },
  ]);
  const { getByTestId, queryByTestId } = render(<DiscoverScreen />);
  await waitFor(() => expect(getByTestId("discover-card-2")).toBeTruthy());
  expect(queryByTestId("discover-card-1")).toBeNull();
});

test("Top rated and Most reviewed sorts reorder the list", async () => {
  mockDiscover = ok([
    { id: 1, slug: "low", name: "Low Rated", capabilities: ["vet"], avg_rating: 3.1, review_count: 40 },
    { id: 2, slug: "high", name: "High Rated", capabilities: ["vet"], avg_rating: 4.9, review_count: 2 },
  ]);
  const { getByText, UNSAFE_getAllByType } = render(<DiscoverScreen />);
  await waitFor(() => expect(getByText("Low Rated")).toBeTruthy());
  const { Text } = require("react-native");
  const namesInOrder = () =>
    UNSAFE_getAllByType(Text)
      .map((n) => (typeof n.props.children === "string" ? n.props.children : null))
      .filter((s) => s === "High Rated" || s === "Low Rated");

  fireEvent.press(getByText("Top rated"));
  expect(namesInOrder()[0]).toBe("High Rated");

  fireEvent.press(getByText("Most reviewed"));
  expect(namesInOrder()[0]).toBe("Low Rated"); // 40 reviews > 2
});

test("Nearest sort appears with location and orders by distance_km", async () => {
  mockReq.mockResolvedValue({ status: "granted" });
  mockPos.mockResolvedValue({ coords: { latitude: -34.6, longitude: -58.4 } });
  mockDiscover = ok([
    { id: 1, slug: "far", name: "Far One", capabilities: ["vet"], distance_km: 9.2 },
    { id: 2, slug: "near", name: "Near One", capabilities: ["vet"], distance_km: 0.8 },
  ]);
  const { getByText, UNSAFE_getAllByType } = render(<DiscoverScreen />);
  // Nearest chip only shows once location resolves.
  await waitFor(() => expect(getByText("Nearest")).toBeTruthy());

  fireEvent.press(getByText("Nearest"));
  const { Text } = require("react-native");
  const names = UNSAFE_getAllByType(Text)
    .map((n) => (typeof n.props.children === "string" ? n.props.children : null))
    .filter((s) => s === "Far One" || s === "Near One");
  expect(names[0]).toBe("Near One");
});

test("open-now toggle hides a provider proven closed, keeps unknown-hours ones", async () => {
  // Wednesday 10:30 is inside Vet Co's hours; Closed Co is shut Wednesday; Unknown Co has
  // no parseable hours and must NOT be hidden.
  jest.useFakeTimers().setSystemTime(new Date(2026, 7, 5, 10, 30));
  mockDiscover = ok([
    { id: 1, slug: "open", name: "Open Co", capabilities: ["vet"], hours_json: { wed: "09:00-17:00" } },
    { id: 2, slug: "closed", name: "Closed Co", capabilities: ["vet"], hours_json: { wed: "closed" } },
    { id: 3, slug: "unknown", name: "Unknown Co", capabilities: ["vet"], hours_json: null },
  ]);
  const { getByTestId, queryByTestId } = render(<DiscoverScreen />);
  await waitFor(() => expect(getByTestId("discover-card-1")).toBeTruthy());

  fireEvent.press(getByTestId("discover-opennow"));
  expect(getByTestId("discover-card-1")).toBeTruthy(); // open
  expect(queryByTestId("discover-card-2")).toBeNull(); // closed → hidden
  expect(getByTestId("discover-card-3")).toBeTruthy(); // unknown → kept
  jest.useRealTimers();
});

test("state: loading", async () => {
  mockDiscover = { data: undefined, isLoading: true, isError: false, refetch: jest.fn() };
  const { getByTestId } = render(<DiscoverScreen />);
  await waitFor(() => expect(getByTestId("discover-loading")).toBeTruthy());
});

test("state: error shows retry which calls refetch", async () => {
  const refetch = jest.fn();
  mockDiscover = { data: undefined, isLoading: false, isError: true, refetch };
  const { getByTestId } = render(<DiscoverScreen />);
  await waitFor(() => expect(getByTestId("discover-error")).toBeTruthy());
  fireEvent.press(getByTestId("discover-retry"));
  expect(refetch).toHaveBeenCalled();
});

test("state: empty (no providers at all)", async () => {
  mockDiscover = ok([]);
  const { getByTestId } = render(<DiscoverScreen />);
  await waitFor(() => expect(getByTestId("discover-empty")).toBeTruthy());
});

test("state: no-results with clear-filters restoring the list", async () => {
  mockDiscover = ok([
    { id: 1, slug: "vet-co", name: "Vet Co", capabilities: ["vet"] },
  ]);
  const { getByTestId, getByPlaceholderText, queryByTestId } = render(<DiscoverScreen />);
  await waitFor(() => expect(getByTestId("discover-card-1")).toBeTruthy());

  fireEvent.changeText(getByPlaceholderText("Search providers"), "zzz");
  expect(getByTestId("discover-no-results")).toBeTruthy();
  expect(queryByTestId("discover-card-1")).toBeNull();

  fireEvent.press(getByTestId("discover-clear-filters"));
  expect(getByTestId("discover-card-1")).toBeTruthy();
  expect(queryByTestId("discover-no-results")).toBeNull();
});

test("state: location-denied banner shows but the list still works", async () => {
  mockDiscover = ok([
    { id: 1, slug: "vet-co", name: "Vet Co", capabilities: ["vet"] },
  ]);
  const { getByTestId } = render(<DiscoverScreen />);
  await waitFor(() => expect(getByTestId("discover-denied-banner")).toBeTruthy());
  expect(getByTestId("discover-card-1")).toBeTruthy(); // list unaffected
});

test("tapping a card opens the provider profile by slug", async () => {
  mockDiscover = ok([
    { id: 1, slug: "happy-paws", name: "Happy Paws", capabilities: ["vet"] },
  ]);
  const { getByTestId } = render(<DiscoverScreen />);
  await waitFor(() => expect(getByTestId("discover-card-1")).toBeTruthy());

  fireEvent.press(getByTestId("discover-card-1"));
  expect(mockPush).toHaveBeenCalledWith({
    pathname: "/service/provider",
    params: { slug: "happy-paws" },
  });
});
