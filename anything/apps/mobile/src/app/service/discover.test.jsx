// Unified discovery screen (Services Hub P2 + P3):
//   P2 — merged/deduped list, capability chips, search, category filters, sorts (incl.
//        Nearest w/ location), open-now, five states, card→profile.
//   P3 — list⇄map toggle, marker press → card highlight (no nav), card select → pin
//        highlight, providers-without-coords stay in list but off the map (+ note),
//        wide split (list left, map right), Android/web map degrade to a placeholder
//        (no crash, toggle hidden), and P2 filters still apply in map mode.
// Data hook, router, expo-location, MapLocationView, the bottom sheet and i18n are mocked.
// i18n resolves REAL en.json.

import React from "react";
import * as RN from "react-native";
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
  useDiscoverProviders: () => mockDiscover,
}));
let mockWide = false; // controls the split-vs-toggle layout deterministically
jest.mock("@/hooks/useIsWideScreen", () => ({
  useIsWideScreen: () => mockWide,
}));
// MapLocationView stub: renders the selectedIndex and a pressable per marker so we can
// fire onMarkerPress and assert the two-way highlight.
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
// Bottom sheet stub: render children plainly (no reanimated/gesture in jest).
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

function setPlatform(os) {
  Object.defineProperty(RN.Platform, "OS", { configurable: true, get: () => os });
}

beforeEach(() => {
  mockPush.mockReset();
  mockParams = {};
  mockReq.mockResolvedValue({ status: "denied" }); // default: no location
  mockPos.mockResolvedValue({ coords: { latitude: 0, longitude: 0 } });
  setPlatform("ios"); // jest-expo default; explicit for clarity
  mockWide = false; // narrow phone by default
});

afterEach(() => {
  setPlatform("ios");
  mockWide = false;
});

// ─────────────────────────────── P2 (retained) ───────────────────────────────
test("merged list: a vet+grooming provider appears ONCE with both capability chips", async () => {
  mockDiscover = ok([
    { id: 1, slug: "happy-paws", name: "Happy Paws", capabilities: ["vet", "groomer"] },
    { id: 2, slug: "shop-co", name: "Shop Co", capabilities: ["shop"] },
  ]);
  const { getByTestId, queryAllByTestId } = render(<DiscoverScreen />);
  await waitFor(() => expect(getByTestId("discover-card-1")).toBeTruthy());
  expect(queryAllByTestId("discover-card-1")).toHaveLength(1);
  expect(getByTestId("discover-cap-1-vet")).toBeTruthy();
  expect(getByTestId("discover-cap-1-groomer")).toBeTruthy();
});

test("search filters by name; single-service category chips filter by capability", async () => {
  mockDiscover = ok([
    { id: 1, slug: "vet-co", name: "Vet Co", capabilities: ["vet"] },
    { id: 2, slug: "shop-co", name: "Shop Co", capabilities: ["shop"] },
    { id: 3, slug: "groom-co", name: "Groom Co", capabilities: ["groomer", "telehealth"] },
  ]);
  const { getByTestId, getByPlaceholderText, queryByTestId } = render(<DiscoverScreen />);
  await waitFor(() => expect(getByTestId("discover-card-1")).toBeTruthy());

  // Vet chip → only the vet provider.
  fireEvent.press(getByTestId("discover-cat-vet"));
  expect(getByTestId("discover-card-1")).toBeTruthy();
  expect(queryByTestId("discover-card-2")).toBeNull();
  expect(queryByTestId("discover-card-3")).toBeNull();

  // Grooming chip → only the groomer (multi-capability provider still matches).
  fireEvent.press(getByTestId("discover-cat-groomer"));
  expect(getByTestId("discover-card-3")).toBeTruthy();
  expect(queryByTestId("discover-card-1")).toBeNull();

  // Telehealth chip → the same multi-capability provider.
  fireEvent.press(getByTestId("discover-cat-telehealth"));
  expect(getByTestId("discover-card-3")).toBeTruthy();
  expect(queryByTestId("discover-card-1")).toBeNull();

  // Shop chip (shop + pharmacy) → only the shop.
  fireEvent.press(getByTestId("discover-cat-shop"));
  expect(getByTestId("discover-card-2")).toBeTruthy();
  expect(queryByTestId("discover-card-1")).toBeNull();

  fireEvent.press(getByTestId("discover-cat-all"));
  fireEvent.changeText(getByPlaceholderText("Search providers"), "groom");
  expect(getByTestId("discover-card-3")).toBeTruthy();
  expect(queryByTestId("discover-card-1")).toBeNull();
});

test("renders all 12 category chips (all + 11 service types)", async () => {
  mockDiscover = ok([{ id: 1, slug: "a", name: "A Co", capabilities: ["vet"] }]);
  const { getByTestId } = render(<DiscoverScreen />);
  await waitFor(() => expect(getByTestId("discover-card-1")).toBeTruthy());
  for (const key of [
    "all",
    "vet",
    "telehealth",
    "groomer",
    "walker",
    "daycare",
    "sitter",
    "trainer",
    "shop",
    "adoption",
    "transport",
    "insurance",
  ]) {
    expect(getByTestId(`discover-cat-${key}`)).toBeTruthy();
  }
});

test("alias resolves legacy category params (veterinary→vet); unknown→all", async () => {
  mockParams = { category: "veterinary" };
  mockDiscover = ok([
    { id: 1, slug: "vet-co", name: "Vet Co", capabilities: ["vet"] },
    { id: 2, slug: "shop-co", name: "Shop Co", capabilities: ["shop"] },
  ]);
  let scr = render(<DiscoverScreen />);
  await waitFor(() => expect(scr.getByTestId("discover-card-1")).toBeTruthy());
  expect(scr.queryByTestId("discover-card-2")).toBeNull(); // "veterinary" → vet chip pre-applied
  scr.unmount();

  // Unrecognized param falls back to "all" (both providers visible).
  mockParams = { category: "banana" };
  scr = render(<DiscoverScreen />);
  await waitFor(() => expect(scr.getByTestId("discover-card-1")).toBeTruthy());
  expect(scr.getByTestId("discover-card-2")).toBeTruthy();
});

test("search by service TYPE returns a provider whose name lacks the type", async () => {
  mockDiscover = ok([
    { id: 1, slug: "happy-paws", name: "Happy Paws", capabilities: ["vet"] },
    { id: 2, slug: "chez-toto", name: "Chez Toto", capabilities: ["groomer"] },
  ]);
  const { getByTestId, getByPlaceholderText, queryByTestId } = render(<DiscoverScreen />);
  await waitFor(() => expect(getByTestId("discover-card-1")).toBeTruthy());

  // "vet" matches by capability slug — neither name contains "vet".
  fireEvent.changeText(getByPlaceholderText("Search providers"), "vet");
  expect(getByTestId("discover-card-1")).toBeTruthy();
  expect(queryByTestId("discover-card-2")).toBeNull();

  // "grooming" matches by the LOCALIZED capability label (discover.cap.groomer = "Grooming").
  fireEvent.changeText(getByPlaceholderText("Search providers"), "grooming");
  expect(getByTestId("discover-card-2")).toBeTruthy();
  expect(queryByTestId("discover-card-1")).toBeNull();
});

test("category pre-applied from the route param", async () => {
  mockParams = { category: "shops" };
  mockDiscover = ok([
    { id: 1, slug: "vet-co", name: "Vet Co", capabilities: ["vet"] },
    { id: 2, slug: "shop-co", name: "Shop Co", capabilities: ["shop"] },
  ]);
  const { getByTestId, queryByTestId } = render(<DiscoverScreen />);
  await waitFor(() => expect(getByTestId("discover-card-2")).toBeTruthy());
  expect(queryByTestId("discover-card-1")).toBeNull();
});

test("Top rated / Most reviewed sorts reorder; Nearest appears only with location", async () => {
  mockDiscover = ok([
    { id: 1, slug: "low", name: "Low Rated", capabilities: ["vet"], avg_rating: 3.1, review_count: 40 },
    { id: 2, slug: "high", name: "High Rated", capabilities: ["vet"], avg_rating: 4.9, review_count: 2 },
  ]);
  const { getByText, queryByText, UNSAFE_getAllByType } = render(<DiscoverScreen />);
  await waitFor(() => expect(getByText("Low Rated")).toBeTruthy());
  // No location by default → no Nearest.
  expect(queryByText("Nearest")).toBeNull();
  const { Text } = require("react-native");
  const order = () =>
    UNSAFE_getAllByType(Text)
      .map((n) => (typeof n.props.children === "string" ? n.props.children : null))
      .filter((s) => s === "High Rated" || s === "Low Rated");
  fireEvent.press(getByText("Top rated"));
  expect(order()[0]).toBe("High Rated");
  fireEvent.press(getByText("Most reviewed"));
  expect(order()[0]).toBe("Low Rated");
});

test("Nearest sort orders by distance_km when location is granted", async () => {
  mockReq.mockResolvedValue({ status: "granted" });
  mockPos.mockResolvedValue({ coords: { latitude: -34.6, longitude: -58.4 } });
  mockDiscover = ok([
    { id: 1, slug: "far", name: "Far One", capabilities: ["vet"], distance_km: 9.2 },
    { id: 2, slug: "near", name: "Near One", capabilities: ["vet"], distance_km: 0.8 },
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

test("open-now hides the proven-closed, keeps unknown-hours", async () => {
  jest.useFakeTimers().setSystemTime(new Date(2026, 7, 5, 10, 30)); // Wed 10:30
  mockDiscover = ok([
    { id: 1, slug: "open", name: "Open Co", capabilities: ["vet"], hours_json: { wed: "09:00-17:00" } },
    { id: 2, slug: "closed", name: "Closed Co", capabilities: ["vet"], hours_json: { wed: "closed" } },
    { id: 3, slug: "unknown", name: "Unknown Co", capabilities: ["vet"], hours_json: null },
  ]);
  const { getByTestId, queryByTestId } = render(<DiscoverScreen />);
  await waitFor(() => expect(getByTestId("discover-card-1")).toBeTruthy());
  fireEvent.press(getByTestId("discover-opennow"));
  expect(getByTestId("discover-card-1")).toBeTruthy();
  expect(queryByTestId("discover-card-2")).toBeNull();
  expect(getByTestId("discover-card-3")).toBeTruthy();
  jest.useRealTimers();
});

test("states: loading / error+retry / empty / no-results+clear / denied banner", async () => {
  // loading
  mockDiscover = { data: undefined, isLoading: true, isError: false, refetch: jest.fn() };
  let scr = render(<DiscoverScreen />);
  await waitFor(() => expect(scr.getByTestId("discover-loading")).toBeTruthy());
  scr.unmount();

  // error + retry
  const refetch = jest.fn();
  mockDiscover = { data: undefined, isLoading: false, isError: true, refetch };
  scr = render(<DiscoverScreen />);
  await waitFor(() => expect(scr.getByTestId("discover-error")).toBeTruthy());
  fireEvent.press(scr.getByTestId("discover-retry"));
  expect(refetch).toHaveBeenCalled();
  scr.unmount();

  // empty
  mockDiscover = ok([]);
  scr = render(<DiscoverScreen />);
  await waitFor(() => expect(scr.getByTestId("discover-empty")).toBeTruthy());
  scr.unmount();

  // no-results + clear
  mockDiscover = ok([{ id: 1, slug: "vet-co", name: "Vet Co", capabilities: ["vet"] }]);
  scr = render(<DiscoverScreen />);
  await waitFor(() => expect(scr.getByTestId("discover-card-1")).toBeTruthy());
  fireEvent.changeText(scr.getByPlaceholderText("Search providers"), "zzz");
  expect(scr.getByTestId("discover-no-results")).toBeTruthy();
  fireEvent.press(scr.getByTestId("discover-clear-filters"));
  expect(scr.getByTestId("discover-card-1")).toBeTruthy();
  scr.unmount();

  // denied banner + list still works
  mockDiscover = ok([{ id: 1, slug: "vet-co", name: "Vet Co", capabilities: ["vet"] }]);
  scr = render(<DiscoverScreen />);
  await waitFor(() => expect(scr.getByTestId("discover-denied-banner")).toBeTruthy());
  expect(scr.getByTestId("discover-card-1")).toBeTruthy();
});

test("card tap opens the provider profile by slug (and selects it)", async () => {
  mockDiscover = ok([{ id: 1, slug: "happy-paws", name: "Happy Paws", capabilities: ["vet"] }]);
  const { getByTestId } = render(<DiscoverScreen />);
  await waitFor(() => expect(getByTestId("discover-card-1")).toBeTruthy());
  fireEvent.press(getByTestId("discover-card-1"));
  expect(mockPush).toHaveBeenCalledWith({
    pathname: "/service/provider",
    params: { slug: "happy-paws" },
  });
});

// ───────────────────────── interim legacy routing bridge ─────────────────────────
// Types the storefront can't serve yet (adoption/insurance/transport) open their working
// legacy screen; storefront wins for any bookable/shop capability (incl. mixed providers).
test("adoption-only provider taps through to the adoption screen (with providerId)", async () => {
  mockDiscover = ok([
    { id: 7, slug: "rescue", name: "Rescue Co", capabilities: ["adoption"] },
  ]);
  const { getByTestId } = render(<DiscoverScreen />);
  await waitFor(() => expect(getByTestId("discover-card-7")).toBeTruthy());
  fireEvent.press(getByTestId("discover-card-7"));
  expect(mockPush).toHaveBeenCalledWith({
    pathname: "/service/adoption",
    params: { providerId: 7 },
  });
});

test("insurance-only provider routes to the insurance screen (no param)", async () => {
  mockDiscover = ok([
    { id: 8, slug: "safe-pet", name: "Safe Pet", capabilities: ["insurance"] },
  ]);
  const { getByTestId } = render(<DiscoverScreen />);
  await waitFor(() => expect(getByTestId("discover-card-8")).toBeTruthy());
  fireEvent.press(getByTestId("discover-card-8"));
  expect(mockPush).toHaveBeenCalledWith({ pathname: "/service/insurance" });
});

test("transport-only provider routes to the transport screen (no param)", async () => {
  mockDiscover = ok([
    { id: 9, slug: "pet-taxi", name: "Pet Taxi", capabilities: ["transport"] },
  ]);
  const { getByTestId } = render(<DiscoverScreen />);
  await waitFor(() => expect(getByTestId("discover-card-9")).toBeTruthy());
  fireEvent.press(getByTestId("discover-card-9"));
  expect(mockPush).toHaveBeenCalledWith({ pathname: "/service/transport" });
});

test("bookable (vet) and shop providers still open the storefront", async () => {
  mockDiscover = ok([
    { id: 1, slug: "vet-co", name: "Vet Co", capabilities: ["vet"] },
    { id: 2, slug: "shop-co", name: "Shop Co", capabilities: ["shop"] },
  ]);
  const { getByTestId } = render(<DiscoverScreen />);
  await waitFor(() => expect(getByTestId("discover-card-1")).toBeTruthy());
  fireEvent.press(getByTestId("discover-card-1"));
  expect(mockPush).toHaveBeenCalledWith({
    pathname: "/service/provider",
    params: { slug: "vet-co" },
  });
  fireEvent.press(getByTestId("discover-card-2"));
  expect(mockPush).toHaveBeenCalledWith({
    pathname: "/service/provider",
    params: { slug: "shop-co" },
  });
});

test("mixed provider (vet + adoption) → storefront wins", async () => {
  mockDiscover = ok([
    { id: 5, slug: "mixed", name: "Mixed Co", capabilities: ["vet", "adoption"] },
  ]);
  const { getByTestId } = render(<DiscoverScreen />);
  await waitFor(() => expect(getByTestId("discover-card-5")).toBeTruthy());
  fireEvent.press(getByTestId("discover-card-5"));
  expect(mockPush).toHaveBeenCalledWith({
    pathname: "/service/provider",
    params: { slug: "mixed" },
  });
});

test("provider with empty / unknown capabilities falls back to the storefront", async () => {
  mockDiscover = ok([
    { id: 3, slug: "empty", name: "Empty Co", capabilities: [] },
    { id: 4, slug: "weird", name: "Weird Co", capabilities: ["mystery"] },
  ]);
  const { getByTestId } = render(<DiscoverScreen />);
  await waitFor(() => expect(getByTestId("discover-card-3")).toBeTruthy());
  fireEvent.press(getByTestId("discover-card-3"));
  expect(mockPush).toHaveBeenCalledWith({
    pathname: "/service/provider",
    params: { slug: "empty" },
  });
  fireEvent.press(getByTestId("discover-card-4"));
  expect(mockPush).toHaveBeenCalledWith({
    pathname: "/service/provider",
    params: { slug: "weird" },
  });
});

// ─────────────────────────────────── P3 ───────────────────────────────────
test("phone default view is the LIST (map mounts only after toggling)", async () => {
  mockDiscover = ok([
    { id: 1, slug: "a", name: "A Co", capabilities: ["vet"], lat: "-34.6", lng: "-58.4" },
  ]);
  const { getByTestId, queryByTestId } = render(<DiscoverScreen />);
  await waitFor(() => expect(getByTestId("discover-card-1")).toBeTruthy());
  // list is the initial mode: the map is not mounted, the toggle is available
  expect(queryByTestId("discover-map")).toBeNull();
  expect(getByTestId("discover-view-toggle")).toBeTruthy();
});

test("list⇄map toggle switches between the list and the map (iOS)", async () => {
  mockDiscover = ok([
    { id: 1, slug: "a", name: "A Co", capabilities: ["vet"], lat: "-34.6", lng: "-58.4" },
  ]);
  const { getByTestId, queryByTestId } = render(<DiscoverScreen />);
  await waitFor(() => expect(getByTestId("discover-view-toggle")).toBeTruthy());
  // list by default → no map
  expect(queryByTestId("discover-map")).toBeNull();
  // → map
  fireEvent.press(getByTestId("discover-view-map"));
  expect(getByTestId("discover-map")).toBeTruthy();
  expect(getByTestId("discover-card-1")).toBeTruthy(); // list is in the sheet
  // → back to list
  fireEvent.press(getByTestId("discover-view-list"));
  expect(queryByTestId("discover-map")).toBeNull();
});

test("marker press highlights that card (no navigation)", async () => {
  mockDiscover = ok([
    { id: 1, slug: "a", name: "A Co", capabilities: ["vet"], lat: "-34.6", lng: "-58.4" },
    { id: 2, slug: "b", name: "B Co", capabilities: ["vet"], lat: "-34.7", lng: "-58.5" },
  ]);
  const { getByTestId, queryByTestId } = render(<DiscoverScreen />);
  await waitFor(() => expect(getByTestId("discover-view-toggle")).toBeTruthy());
  fireEvent.press(getByTestId("discover-view-map"));

  fireEvent.press(getByTestId("map-marker-2"));
  expect(getByTestId("discover-card-2-selected")).toBeTruthy();
  expect(queryByTestId("discover-card-1-selected")).toBeNull();
  expect(mockPush).not.toHaveBeenCalled(); // pin tap does not navigate
});

test("selecting a card highlights its pin (map selectedIndex updates)", async () => {
  mockDiscover = ok([
    { id: 1, slug: "a", name: "A Co", capabilities: ["vet"], lat: "-34.6", lng: "-58.4" },
    { id: 2, slug: "b", name: "B Co", capabilities: ["vet"], lat: "-34.7", lng: "-58.5" },
  ]);
  const { getByTestId } = render(<DiscoverScreen />);
  await waitFor(() => expect(getByTestId("discover-view-toggle")).toBeTruthy());
  fireEvent.press(getByTestId("discover-view-map"));
  expect(getByTestId("map-selected-index").props.children).toBe("-1");

  fireEvent.press(getByTestId("discover-card-2"));
  expect(getByTestId("map-selected-index").props.children).toBe("1"); // index of id 2
  expect(mockPush).toHaveBeenCalled(); // card tap still navigates
});

test("providers without coordinates stay in the list but off the map (+ note)", async () => {
  mockDiscover = ok([
    { id: 1, slug: "a", name: "A Co", capabilities: ["vet"], lat: "-34.6", lng: "-58.4" },
    { id: 2, slug: "b", name: "B Co", capabilities: ["vet"], lat: null, lng: null },
  ]);
  const { getByTestId, queryByTestId } = render(<DiscoverScreen />);
  await waitFor(() => expect(getByTestId("discover-view-toggle")).toBeTruthy());
  fireEvent.press(getByTestId("discover-view-map"));

  // both cards present in the sheet
  expect(getByTestId("discover-card-1")).toBeTruthy();
  expect(getByTestId("discover-card-2")).toBeTruthy();
  // only the located one has a pin
  expect(getByTestId("map-marker-1")).toBeTruthy();
  expect(queryByTestId("map-marker-2")).toBeNull();
  // subtle "1 of 2 shown on map" note
  expect(getByTestId("discover-offmap-note")).toBeTruthy();
});

test("wide screens render a side-by-side split with list + map (iOS)", async () => {
  mockWide = true;
  mockDiscover = ok([
    { id: 1, slug: "a", name: "A Co", capabilities: ["vet"], lat: "-34.6", lng: "-58.4" },
  ]);
  const { getByTestId, queryByTestId } = render(<DiscoverScreen />);
  await waitFor(() => expect(getByTestId("discover-split")).toBeTruthy());
  expect(getByTestId("discover-card-1")).toBeTruthy(); // list column
  expect(getByTestId("discover-map")).toBeTruthy(); // map column (real on iOS)
  expect(queryByTestId("discover-view-toggle")).toBeNull(); // no toggle in split
});

test("Android degrades: no map toggle, list-only, no crash", async () => {
  setPlatform("android");
  mockDiscover = ok([
    { id: 1, slug: "a", name: "A Co", capabilities: ["vet"], lat: "-34.6", lng: "-58.4" },
  ]);
  const { getByTestId, queryByTestId } = render(<DiscoverScreen />);
  await waitFor(() => expect(getByTestId("discover-card-1")).toBeTruthy());
  expect(queryByTestId("discover-view-toggle")).toBeNull();
  expect(queryByTestId("discover-map")).toBeNull();
});

test("web wide split shows the map placeholder (no engine), never a blank map", async () => {
  setPlatform("web");
  mockWide = true;
  mockDiscover = ok([
    { id: 1, slug: "a", name: "A Co", capabilities: ["vet"], lat: "-34.6", lng: "-58.4" },
  ]);
  const { getByTestId, queryByTestId } = render(<DiscoverScreen />);
  await waitFor(() => expect(getByTestId("discover-split")).toBeTruthy());
  expect(getByTestId("discover-card-1")).toBeTruthy();
  expect(getByTestId("discover-map-placeholder")).toBeTruthy();
  expect(queryByTestId("discover-map")).toBeNull();
});

test("P2 filters still apply in map mode", async () => {
  mockDiscover = ok([
    { id: 1, slug: "vet-co", name: "Vet Co", capabilities: ["vet"], lat: "-34.6", lng: "-58.4" },
    { id: 2, slug: "shop-co", name: "Shop Co", capabilities: ["shop"], lat: "-34.7", lng: "-58.5" },
  ]);
  const { getByTestId, queryByTestId } = render(<DiscoverScreen />);
  await waitFor(() => expect(getByTestId("discover-view-toggle")).toBeTruthy());
  fireEvent.press(getByTestId("discover-view-map"));
  // both visible in map mode
  expect(getByTestId("discover-card-1")).toBeTruthy();
  expect(getByTestId("discover-card-2")).toBeTruthy();
  // apply Shop category → only the shop remains, and only its pin
  fireEvent.press(getByTestId("discover-cat-shop"));
  expect(getByTestId("discover-card-2")).toBeTruthy();
  expect(queryByTestId("discover-card-1")).toBeNull();
  expect(getByTestId("map-marker-2")).toBeTruthy();
  expect(queryByTestId("map-marker-1")).toBeNull();
});

// ─────────────────────────── showHeader prop (tab shell) ───────────────────────────
test("showHeader={false} suppresses the internal header but keeps chips + search", async () => {
  mockDiscover = ok([{ id: 1, slug: "a", name: "A Co", capabilities: ["vet"] }]);
  const { getByTestId, getByPlaceholderText, queryByText } = render(
    <ServicesDiscovery variant="landing" showHeader={false} />,
  );
  await waitFor(() => expect(getByTestId("discover-card-1")).toBeTruthy());
  // Internal header (title + subtitle) is gone…
  expect(queryByText("Services")).toBeNull();
  expect(queryByText("Find trusted pet care near you")).toBeNull();
  // …but the discovery controls still render.
  expect(getByTestId("discover-cat-all")).toBeTruthy();
  expect(getByPlaceholderText("Search providers")).toBeTruthy();
});

test("showHeader defaults to true for the landing variant (title shown)", async () => {
  mockDiscover = ok([{ id: 1, slug: "a", name: "A Co", capabilities: ["vet"] }]);
  const { getByText } = render(<ServicesDiscovery variant="landing" />);
  await waitFor(() => expect(getByText("Services")).toBeTruthy());
});
