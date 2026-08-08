// Services TAB SHELL (two-pane redesign): a segmented [Discover | My Activity] toggle over
// two panes — Discover = the headerless unified discovery, My Activity = the consolidated
// owner surface. Asserts: both segments render, Discover is the default (chips + search
// visible, activity hidden), tapping My Activity swaps panes, the unread badge shows on the
// My Activity segment, and toggling back works. All data hooks, router, expo-location,
// MapLocationView, the bottom sheet and i18n are mocked; i18n resolves REAL en.json.

import React from "react";
import { render, waitFor, fireEvent } from "@testing-library/react-native";

let mockDiscover;
let mockUnread = 0;
const mockPush = jest.fn();
const mockReq = jest.fn();
const mockPos = jest.fn();
const mockEmptyQ = { data: [], isLoading: false, refetch: jest.fn() };

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: mockPush }),
  useLocalSearchParams: () => ({}),
}));
jest.mock("react-i18next", () =>
  require("@/i18n/testMock").makeReactI18nextMock(),
);
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
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
jest.mock("@/hooks/useServicesDiscover", () => ({
  useServicesDiscover: () => mockDiscover,
}));
jest.mock("@/hooks/useProviders", () => ({
  useUnreadCount: () => ({ data: mockUnread }),
  useMyBookings: () => ({
    data: { upcoming: [], past: [] },
    isLoading: false,
    refetch: jest.fn(),
  }),
  useWalkSessions: () => mockEmptyQ,
  useDaycareStays: () => mockEmptyQ,
  useSittingVisits: () => mockEmptyQ,
  useShopOrders: () => mockEmptyQ,
  useShopSubscriptions: () => mockEmptyQ,
}));
jest.mock("@/hooks/usePetProfile", () => ({
  useCurrentPet: () => ({ data: { id: 1 } }),
}));
jest.mock("@/hooks/usePlaces", () => ({
  useSavedPlaces: () => mockEmptyQ,
}));
jest.mock("@/hooks/useIsWideScreen", () => ({
  useIsWideScreen: () => false,
}));
jest.mock("@/components/Map/MapLocationView", () => {
  const { View } = require("react-native");
  return ({ testID }) => <View testID={testID} />;
});
jest.mock("@gorhom/bottom-sheet", () => {
  const React = require("react");
  const { View } = require("react-native");
  const BottomSheet = React.forwardRef(({ children }, ref) => {
    React.useImperativeHandle(ref, () => ({ snapToIndex: jest.fn() }));
    return <View>{children}</View>;
  });
  return {
    __esModule: true,
    default: BottomSheet,
    BottomSheetScrollView: ({ children }) => <View>{children}</View>,
  };
});

import ServicesScreen from "./services";

const ok = (data) => ({ data, isLoading: false, isError: false, refetch: jest.fn() });

beforeEach(() => {
  mockPush.mockReset();
  mockUnread = 0;
  mockReq.mockResolvedValue({ status: "denied" }); // no location → deterministic list
  mockPos.mockResolvedValue({ coords: { latitude: 0, longitude: 0 } });
  mockDiscover = ok([
    { type: "provider", id: 1, slug: "a", name: "A Co", capabilities: ["vet"] },
  ]);
});

test("renders both segments and defaults to Discover (chips + search, no internal header)", async () => {
  const { getByText, getByTestId, getByPlaceholderText, queryByTestId, queryByText } =
    render(<ServicesScreen />);
  await waitFor(() => expect(getByTestId("discover-card-1")).toBeTruthy());
  // Both segments present.
  expect(getByTestId("services-seg-discover")).toBeTruthy();
  expect(getByTestId("services-seg-activity")).toBeTruthy();
  expect(getByText("Discover")).toBeTruthy();
  expect(getByText("My Activity")).toBeTruthy();
  // Discover pane content is visible…
  expect(getByTestId("discover-filter-category")).toBeTruthy();
  expect(getByPlaceholderText("Search services & places")).toBeTruthy();
  // …the discovery's OWN header is suppressed (the toggle replaces it)…
  expect(queryByTestId("services-activity-action")).toBeNull();
  expect(queryByText("Find trusted pet care near you")).toBeNull();
  // …and the activity pane is not mounted.
  expect(queryByTestId("activity-messages")).toBeNull();
});

test("tapping My Activity swaps to the activity pane and hides discovery", async () => {
  const { getByTestId, queryByTestId } = render(<ServicesScreen />);
  await waitFor(() => expect(getByTestId("discover-card-1")).toBeTruthy());

  fireEvent.press(getByTestId("services-seg-activity"));
  // Activity sections now render…
  expect(getByTestId("activity-messages")).toBeTruthy();
  expect(getByTestId("activity-orders")).toBeTruthy();
  expect(getByTestId("activity-upcoming-empty")).toBeTruthy();
  // …and discovery is gone.
  expect(queryByTestId("discover-filter-category")).toBeNull();
  expect(queryByTestId("discover-card-1")).toBeNull();
});

test("toggling back to Discover restores the discovery pane", async () => {
  const { getByTestId, queryByTestId } = render(<ServicesScreen />);
  await waitFor(() => expect(getByTestId("discover-card-1")).toBeTruthy());

  fireEvent.press(getByTestId("services-seg-activity"));
  expect(getByTestId("activity-messages")).toBeTruthy();

  fireEvent.press(getByTestId("services-seg-discover"));
  await waitFor(() => expect(getByTestId("discover-card-1")).toBeTruthy());
  expect(queryByTestId("activity-messages")).toBeNull();
});

test("the My Activity segment shows the unread badge when unread > 0", async () => {
  mockUnread = 5;
  const { getByTestId, queryByTestId } = render(<ServicesScreen />);
  await waitFor(() => expect(getByTestId("discover-card-1")).toBeTruthy());
  expect(getByTestId("services-seg-activity-badge")).toBeTruthy();
  expect(queryByTestId("services-seg-discover-badge")).toBeNull(); // no badge on Discover
});

test("no unread → no badge on either segment", async () => {
  const { getByTestId, queryByTestId } = render(<ServicesScreen />);
  await waitFor(() => expect(getByTestId("discover-card-1")).toBeTruthy());
  expect(queryByTestId("services-seg-activity-badge")).toBeNull();
});
