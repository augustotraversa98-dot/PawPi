// Launch-request dedupe, part 3 — Services Discover.
//
// Before: the Discover pane fired GET /api/services/discover with NO coordinates immediately, then
// a second, located one as soon as the device location arrived (two requests within ~1 s; the first
// result was thrown away). Now the read waits for the location answer and fires ONCE with the final
// lat/lng — or once, unlocated, when location is denied. While waiting it shows its loading state,
// never an empty list. The real useServicesDiscover + a real QueryClient run here; only the network,
// expo-location, the map and the bottom sheet are mocked.

import React from "react";
import { render, waitFor, act } from "@testing-library/react-native";

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


import ServicesDiscovery from "@/components/Services/ServicesDiscovery";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const discoverCalls = () => global.fetch.mock.calls.filter(([u]) => String(u).startsWith("/api/services/discover"));
const items = [{ type: "provider", id: 1, slug: "a", name: "A Co", capabilities: ["vet"] }];

function renderDiscovery() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ServicesDiscovery variant="landing" showHeader={false} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockReq.mockReset();
  mockPos.mockReset();
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ items }) }));
});

test("location granted: ONE request, carrying the final lat/lng (was an unlocated one + a located one)", async () => {
  mockReq.mockResolvedValue({ status: "granted" });
  mockPos.mockResolvedValue({ coords: { latitude: -34.6, longitude: -58.4 } });
  const { findByTestId } = renderDiscovery();
  await findByTestId("discover-card-1");

  const calls = discoverCalls();
  expect(calls).toHaveLength(1);
  expect(calls[0][0]).toBe("/api/services/discover?lat=-34.6&lng=-58.4");
});

test("location denied: ONE unlocated request, after the answer", async () => {
  mockReq.mockResolvedValue({ status: "denied" });
  const { findByTestId } = renderDiscovery();
  await findByTestId("discover-card-1");

  const calls = discoverCalls();
  expect(calls).toHaveLength(1);
  expect(calls[0][0]).toBe("/api/services/discover");
});

test("while the location answer is pending nothing is fetched and the list is NOT shown empty", async () => {
  mockReq.mockReturnValue(new Promise(() => {})); // an unanswered permission prompt
  const { queryByTestId, queryByText } = renderDiscovery();
  await act(async () => {});
  expect(discoverCalls()).toHaveLength(0);
  expect(queryByTestId("discover-card-1")).toBeNull();
  // the empty-state copy must not flash while we are only waiting
  expect(queryByText(/no results|nothing found|no services/i)).toBeNull();
});

test("a location answer that never comes does not hold the list hostage (loads unlocated after the patience window)", async () => {
  mockReq.mockReturnValue(new Promise(() => {}));
  const { findByTestId } = renderDiscovery();
  await act(async () => {});
  expect(discoverCalls()).toHaveLength(0); // still waiting inside the patience window
  await findByTestId("discover-card-1", {}, { timeout: 5000 });
  expect(discoverCalls()).toHaveLength(1);
  expect(discoverCalls()[0][0]).toBe("/api/services/discover");
}, 10000);
