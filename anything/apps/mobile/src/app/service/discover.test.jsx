// Unified Services discovery (providers + pet-friendly PLACES) over /api/services/discover:
//   • merged list of BOTH types; provider cards show capability chips, place cards a category chip;
//   • category chips (unified taxonomy) route SERVER-side to the right source (mock is category-aware);
//   • client-side q search + sorts (rating/reviews/nearest) + open-now (providers only);
//   • neighborhood "by area" filter passes neighborhood (places only; hidden for provider categories);
//   • drill-in by type: place → /service/place, provider → storefront / legacy bridge;
//   • P3 map: markers for BOTH types with coords, list⇄map toggle, pin↔card highlight, wide split,
//     Android/web degrade; five states.
// The discovery hook, router, expo-location, MapLocationView, the bottom sheet and i18n are mocked.
// i18n resolves REAL en.json.

import React from "react";
import * as RN from "react-native";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

let mockResolve; // (opts) => { data, isLoading, isError, refetch }
let lastOpts;
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
  useServicesDiscover: (opts) => {
    lastOpts = opts;
    return mockResolve(opts);
  },
}));
let mockWide = false;
jest.mock("@/hooks/useIsWideScreen", () => ({
  useIsWideScreen: () => mockWide,
}));
jest.mock("@/components/Map/MapLocationView", () => {
  const { View, Text, TouchableOpacity } = require("react-native");
  return ({ points = [], onMarkerPress, selectedIndex, testID }) => (
    <View testID={testID}>
      <Text testID="map-selected-index">{String(selectedIndex)}</Text>
      {points.map((p, i) => (
        <TouchableOpacity
          key={p.id}
          testID={`map-marker-${p.id}`}
          onPress={() => onMarkerPress && onMarkerPress(i, p)}
        >
          <Text>{p.title}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
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

import DiscoverScreen from "./discover";
import ServicesDiscovery from "@/components/Services/ServicesDiscovery";

const ok = (data) => ({ data, isLoading: false, isError: false, refetch: jest.fn() });

// Unified fixtures: 2 providers + 2 places.
const VET = { type: "provider", id: 1, slug: "vet-co", name: "Vet Co", capabilities: ["vet"], lat: "-34.6", lng: "-58.4", avg_rating: 4.9, review_count: 2 };
const SHOP = { type: "provider", id: 2, slug: "shop-co", name: "Shop Co", capabilities: ["shop"] };
const CAFE = { type: "place", id: "cafe-x", name: "Cafe X", category: "cafe", neighborhood: "Palermo", lat: "-34.58", lng: "-58.42", avg_rating: 4.0, review_count: 3 };
const PARK = { type: "place", id: "park-y", name: "Park Y", category: "park", neighborhood: "Belgrano", lat: null, lng: null };

// Category-aware resolver mirroring the server: a provider category → providers only, a place
// category → places only, "all"/undefined → both; neighborhood filters places.
function categoryAware(opts) {
  const cat = opts?.category;
  let data;
  if (cat === "vet") data = [VET];
  else if (cat === "shop") data = [SHOP];
  else if (cat === "cafe") data = [CAFE];
  else if (cat === "park") data = [PARK];
  else data = [VET, SHOP, CAFE, PARK]; // all
  if (opts?.neighborhood) {
    data = data.filter((it) => it.type !== "place" || it.neighborhood === opts.neighborhood);
  }
  return ok(data);
}

function setPlatform(os) {
  Object.defineProperty(RN.Platform, "OS", { configurable: true, get: () => os });
}

beforeEach(() => {
  mockPush.mockReset();
  mockParams = {};
  lastOpts = undefined;
  mockReq.mockResolvedValue({ status: "denied" }); // default: no location
  mockPos.mockResolvedValue({ coords: { latitude: 0, longitude: 0 } });
  setPlatform("ios");
  mockWide = false;
  mockResolve = categoryAware;
});

afterEach(() => {
  setPlatform("ios");
  mockWide = false;
});

// ─────────────────────────── unified list + card shape ───────────────────────────
test("merged list renders BOTH types: provider (capability chip) + place (category chip)", async () => {
  const { getByTestId } = render(<DiscoverScreen />);
  await waitFor(() => expect(getByTestId("discover-card-1")).toBeTruthy());
  // provider + place both present
  expect(getByTestId("discover-card-1")).toBeTruthy();
  expect(getByTestId("discover-card-cafe-x")).toBeTruthy();
  // provider shows its capability chip; place shows its category chip
  expect(getByTestId("discover-cap-1-vet")).toBeTruthy();
  expect(getByTestId("discover-placecat-cafe-x-cafe")).toBeTruthy();
});

// ─────────────────────────── category routing (server-side) ───────────────────────────
test("provider category chip → providers only; place category chip → places only", async () => {
  const { getByTestId, queryByTestId } = render(<DiscoverScreen />);
  await waitFor(() => expect(getByTestId("discover-card-1")).toBeTruthy());

  // Vet chip → the hook is asked for category 'vet' and only the provider shows.
  fireEvent.press(getByTestId("discover-cat-vet"));
  expect(lastOpts.category).toBe("vet");
  expect(getByTestId("discover-card-1")).toBeTruthy();
  expect(queryByTestId("discover-card-cafe-x")).toBeNull();

  // Cafe chip → category 'cafe', only the place shows.
  fireEvent.press(getByTestId("discover-cat-cafe"));
  expect(lastOpts.category).toBe("cafe");
  expect(getByTestId("discover-card-cafe-x")).toBeTruthy();
  expect(queryByTestId("discover-card-1")).toBeNull();
});

test("renders All + every provider + place category chip", async () => {
  const { getByTestId } = render(<DiscoverScreen />);
  await waitFor(() => expect(getByTestId("discover-card-1")).toBeTruthy());
  for (const key of [
    "all",
    "vet", "telehealth", "grooming", "walking", "daycare", "sitting", "training", "shop", "adoption", "transport", "insurance",
    "restaurant", "cafe", "bakery", "brewery", "bar", "park", "hotel", "market",
  ]) {
    expect(getByTestId(`discover-cat-${key}`)).toBeTruthy();
  }
});

// ─────────────────────────── q search (client-side) ───────────────────────────
test("search filters the merged list by name across both types", async () => {
  const { getByTestId, getByPlaceholderText, queryByTestId } = render(<DiscoverScreen />);
  await waitFor(() => expect(getByTestId("discover-card-1")).toBeTruthy());
  fireEvent.changeText(getByPlaceholderText("Search services & places"), "cafe");
  expect(getByTestId("discover-card-cafe-x")).toBeTruthy();
  expect(queryByTestId("discover-card-1")).toBeNull();
});

// ─────────────────────────── drill-in by type ───────────────────────────
test("place card → /service/place; provider card → storefront", async () => {
  const { getByTestId } = render(<DiscoverScreen />);
  await waitFor(() => expect(getByTestId("discover-card-cafe-x")).toBeTruthy());

  fireEvent.press(getByTestId("discover-card-cafe-x"));
  expect(mockPush).toHaveBeenCalledWith({ pathname: "/service/place", params: { id: "cafe-x" } });

  fireEvent.press(getByTestId("discover-card-1"));
  expect(mockPush).toHaveBeenCalledWith({ pathname: "/service/provider", params: { slug: "vet-co" } });
});

test("adoption-only provider still routes to the legacy adoption screen (bridge unchanged)", async () => {
  mockResolve = () => ok([{ type: "provider", id: 7, slug: "rescue", name: "Rescue Co", capabilities: ["adoption"] }]);
  const { getByTestId } = render(<DiscoverScreen />);
  await waitFor(() => expect(getByTestId("discover-card-7")).toBeTruthy());
  fireEvent.press(getByTestId("discover-card-7"));
  expect(mockPush).toHaveBeenCalledWith({ pathname: "/service/adoption", params: { providerId: 7 } });
});

// ─────────────────────────── neighborhood filter ───────────────────────────
test("neighborhood chips filter places (passed to API); hidden for provider categories", async () => {
  const { getByTestId, queryByTestId } = render(<DiscoverScreen />);
  await waitFor(() => expect(getByTestId("discover-card-cafe-x")).toBeTruthy());

  // Area chips appear for the 'all' view (places carry neighborhoods).
  expect(getByTestId("discover-area-Palermo")).toBeTruthy();
  fireEvent.press(getByTestId("discover-area-Palermo"));
  expect(lastOpts.neighborhood).toBe("Palermo");
  // Palermo cafe stays; the Belgrano park is filtered out by the (mocked) server.
  expect(getByTestId("discover-card-cafe-x")).toBeTruthy();
  expect(queryByTestId("discover-card-park-y")).toBeNull();

  // Switching to a provider category hides the area row (neighborhoods don't apply to providers).
  fireEvent.press(getByTestId("discover-cat-vet"));
  expect(queryByTestId("discover-area-Palermo")).toBeNull();
});

// ─────────────────────────── map includes places ───────────────────────────
test("map markers include BOTH providers and places that have coords", async () => {
  const { getByTestId, queryByTestId } = render(<DiscoverScreen />);
  await waitFor(() => expect(getByTestId("discover-view-toggle")).toBeTruthy());
  fireEvent.press(getByTestId("discover-view-map"));
  expect(getByTestId("map-marker-1")).toBeTruthy(); // provider pin
  expect(getByTestId("map-marker-cafe-x")).toBeTruthy(); // place pin
  expect(queryByTestId("map-marker-park-y")).toBeNull(); // no coords → no pin
  expect(getByTestId("discover-offmap-note")).toBeTruthy(); // some items off the map
});

// ─────────────────────────── sorts (mixed types) ───────────────────────────
test("Top rated / Most reviewed reorder the merged list; Nearest only with location", async () => {
  const { getByText, queryByText, UNSAFE_getAllByType } = render(<DiscoverScreen />);
  await waitFor(() => expect(getByText("Vet Co")).toBeTruthy());
  expect(queryByText("Nearest")).toBeNull(); // no location
  const { Text } = require("react-native");
  const order = () =>
    UNSAFE_getAllByType(Text)
      .map((n) => (typeof n.props.children === "string" ? n.props.children : null))
      .filter((s) => s === "Vet Co" || s === "Cafe X");
  fireEvent.press(getByText("Top rated"));
  expect(order()[0]).toBe("Vet Co"); // 4.9 > 4.0
  fireEvent.press(getByText("Most reviewed"));
  expect(order()[0]).toBe("Cafe X"); // 3 > 2
});

test("Nearest sort orders by distance_km when location is granted", async () => {
  mockReq.mockResolvedValue({ status: "granted" });
  mockPos.mockResolvedValue({ coords: { latitude: -34.6, longitude: -58.4 } });
  mockResolve = () =>
    ok([
      { type: "provider", id: 1, slug: "far", name: "Far One", capabilities: ["vet"], distance_km: 9.2 },
      { type: "place", id: "near", name: "Near One", category: "cafe", distance_km: 0.8 },
    ]);
  const { getByText, UNSAFE_getAllByType } = render(<DiscoverScreen />);
  await waitFor(() => expect(getByText("Nearest")).toBeTruthy());
  fireEvent.press(getByText("Nearest"));
  const { Text } = require("react-native");
  const names = UNSAFE_getAllByType(Text)
    .map((n) => (typeof n.props.children === "string" ? n.props.children : null))
    .filter((s) => s === "Far One" || s === "Near One");
  expect(names[0]).toBe("Near One");
});

// ─────────────────────────── open-now (providers only) ───────────────────────────
test("open-now hides a proven-closed PROVIDER, keeps unknown providers AND all places", async () => {
  jest.useFakeTimers().setSystemTime(new Date(2026, 7, 5, 10, 30)); // Wed 10:30
  mockResolve = () =>
    ok([
      { type: "provider", id: 1, slug: "open", name: "Open Co", capabilities: ["vet"], hours_json: { wed: "09:00-17:00" } },
      { type: "provider", id: 2, slug: "closed", name: "Closed Co", capabilities: ["vet"], hours_json: { wed: "closed" } },
      { type: "provider", id: 3, slug: "unknown", name: "Unknown Co", capabilities: ["vet"], hours_json: null },
      { type: "place", id: "cafe-z", name: "Cafe Z", category: "cafe" },
    ]);
  const { getByTestId, queryByTestId } = render(<DiscoverScreen />);
  await waitFor(() => expect(getByTestId("discover-card-1")).toBeTruthy());
  fireEvent.press(getByTestId("discover-opennow"));
  expect(getByTestId("discover-card-1")).toBeTruthy(); // open
  expect(queryByTestId("discover-card-2")).toBeNull(); // proven closed → hidden
  expect(getByTestId("discover-card-3")).toBeTruthy(); // unknown hours → kept
  expect(getByTestId("discover-card-cafe-z")).toBeTruthy(); // place → always kept
  jest.useRealTimers();
});

// ─────────────────────────── states ───────────────────────────
test("states: loading / error+retry / empty / no-results+clear / denied banner", async () => {
  mockResolve = () => ({ data: undefined, isLoading: true, isError: false, refetch: jest.fn() });
  let scr = render(<DiscoverScreen />);
  await waitFor(() => expect(scr.getByTestId("discover-loading")).toBeTruthy());
  scr.unmount();

  const refetch = jest.fn();
  mockResolve = () => ({ data: undefined, isLoading: false, isError: true, refetch });
  scr = render(<DiscoverScreen />);
  await waitFor(() => expect(scr.getByTestId("discover-error")).toBeTruthy());
  fireEvent.press(scr.getByTestId("discover-retry"));
  expect(refetch).toHaveBeenCalled();
  scr.unmount();

  mockResolve = () => ok([]);
  scr = render(<DiscoverScreen />);
  await waitFor(() => expect(scr.getByTestId("discover-empty")).toBeTruthy());
  scr.unmount();

  mockResolve = categoryAware;
  scr = render(<DiscoverScreen />);
  await waitFor(() => expect(scr.getByTestId("discover-card-1")).toBeTruthy());
  fireEvent.changeText(scr.getByPlaceholderText("Search services & places"), "zzz");
  expect(scr.getByTestId("discover-no-results")).toBeTruthy();
  fireEvent.press(scr.getByTestId("discover-clear-filters"));
  expect(scr.getByTestId("discover-card-1")).toBeTruthy();
  scr.unmount();

  mockResolve = categoryAware;
  scr = render(<DiscoverScreen />);
  await waitFor(() => expect(scr.getByTestId("discover-denied-banner")).toBeTruthy());
  expect(scr.getByTestId("discover-card-1")).toBeTruthy();
});

// ─────────────────────────── P3 map behaviors ───────────────────────────
test("phone default view is the LIST; map mounts only after toggling", async () => {
  const { getByTestId, queryByTestId } = render(<DiscoverScreen />);
  await waitFor(() => expect(getByTestId("discover-card-1")).toBeTruthy());
  expect(queryByTestId("discover-map")).toBeNull();
  expect(getByTestId("discover-view-toggle")).toBeTruthy();
});

test("marker press highlights that card (no navigation); card select highlights its pin", async () => {
  const { getByTestId, queryByTestId } = render(<DiscoverScreen />);
  await waitFor(() => expect(getByTestId("discover-view-toggle")).toBeTruthy());
  fireEvent.press(getByTestId("discover-view-map"));

  fireEvent.press(getByTestId("map-marker-cafe-x"));
  expect(getByTestId("discover-card-cafe-x-selected")).toBeTruthy();
  expect(mockPush).not.toHaveBeenCalled();

  fireEvent.press(getByTestId("discover-card-1"));
  expect(getByTestId("map-selected-index").props.children).toBe("0"); // index of provider id 1
  expect(mockPush).toHaveBeenCalled(); // card tap navigates
});

test("wide screens render a side-by-side split with list + map (iOS)", async () => {
  mockWide = true;
  const { getByTestId, queryByTestId } = render(<DiscoverScreen />);
  await waitFor(() => expect(getByTestId("discover-split")).toBeTruthy());
  expect(getByTestId("discover-card-1")).toBeTruthy();
  expect(getByTestId("discover-map")).toBeTruthy();
  expect(queryByTestId("discover-view-toggle")).toBeNull();
});

test("Android degrades: no map toggle, list-only, no crash", async () => {
  setPlatform("android");
  const { getByTestId, queryByTestId } = render(<DiscoverScreen />);
  await waitFor(() => expect(getByTestId("discover-card-1")).toBeTruthy());
  expect(queryByTestId("discover-view-toggle")).toBeNull();
  expect(queryByTestId("discover-map")).toBeNull();
});

test("web wide split shows the map placeholder (no engine), never a blank map", async () => {
  setPlatform("web");
  mockWide = true;
  const { getByTestId, queryByTestId } = render(<DiscoverScreen />);
  await waitFor(() => expect(getByTestId("discover-split")).toBeTruthy());
  expect(getByTestId("discover-map-placeholder")).toBeTruthy();
  expect(queryByTestId("discover-map")).toBeNull();
});

// ─────────────────────────── deep-link category param ───────────────────────────
test("initialCategory aliases resolve (veterinary→vet) and place categories pass through", async () => {
  mockParams = { category: "veterinary" };
  let scr = render(<DiscoverScreen />);
  await waitFor(() => expect(scr.getByTestId("discover-card-1")).toBeTruthy());
  expect(lastOpts.category).toBe("vet"); // alias resolved
  scr.unmount();

  mockParams = { category: "cafe" };
  scr = render(<DiscoverScreen />);
  await waitFor(() => expect(scr.getByTestId("discover-card-cafe-x")).toBeTruthy());
  expect(lastOpts.category).toBe("cafe"); // place category passes through
});

// ─────────────────────────── showHeader (tab shell) ───────────────────────────
test("showHeader={false} suppresses the internal header but keeps chips + search", async () => {
  const { getByTestId, getByPlaceholderText, queryByText } = render(
    <ServicesDiscovery variant="landing" showHeader={false} />,
  );
  await waitFor(() => expect(getByTestId("discover-card-1")).toBeTruthy());
  expect(queryByText("Find trusted pet care near you")).toBeNull();
  expect(getByTestId("discover-cat-all")).toBeTruthy();
  expect(getByPlaceholderText("Search services & places")).toBeTruthy();
});

test("showHeader defaults to true for the landing variant (header shown)", async () => {
  // The header carries the unique subtitle (the "Services" title now also matches the chip
  // group label, so assert the subtitle instead).
  const { getByText } = render(<ServicesDiscovery variant="landing" />);
  await waitFor(() =>
    expect(getByText("Find trusted pet care near you")).toBeTruthy(),
  );
});
