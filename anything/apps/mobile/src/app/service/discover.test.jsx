// Unified Services discovery (providers + pet-friendly PLACES) over /api/services/discover:
//   • merged list of BOTH types; provider cards show capability chips, place cards a category chip;
//   • COMPACT FILTER BUTTONS (Category + Area) open pickers; selecting routes SERVER-side to the
//     right source (mock is category-aware) and highlights the button;
//   • "Search near me" requests geolocation and applies the Nearest sort;
//   • client-side q search + sorts (rating/reviews/nearest) + open-now (providers only);
//   • drill-in by type: place → /service/place, provider → storefront / legacy bridge;
//   • P3 map: SLIM overlay (toggle + filter bar), sheet defaults to the lowest snap, markers for
//     BOTH types, pin↔card highlight, wide split, Android/web degrade; five states.
// The discovery hook, router, expo-location, MapLocationView, the bottom sheet and i18n are mocked.
// i18n resolves REAL en.json.

import React from "react";
import * as RN from "react-native";
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";

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
let mockRegion; // region a test wants the map to report on the next "fire region" press
jest.mock("@/components/Map/MapLocationView", () => {
  const { View, Text, TouchableOpacity } = require("react-native");
  return ({ points = [], onMarkerPress, onRegionChange, selectedIndex, center, testID }) => (
    <View testID={testID}>
      <Text testID="map-selected-index">{String(selectedIndex)}</Text>
      <Text testID="map-center">{center ? `${center.lat},${center.lng}` : "none"}</Text>
      {/* Simulate a user pan settling on `mockRegion` (gesture) vs a programmatic move (no gesture). */}
      <TouchableOpacity
        testID="map-fire-region"
        onPress={() => onRegionChange && onRegionChange(mockRegion, { isGesture: true })}
      >
        <Text>region</Text>
      </TouchableOpacity>
      <TouchableOpacity
        testID="map-fire-region-programmatic"
        onPress={() => onRegionChange && onRegionChange(mockRegion, { isGesture: false })}
      >
        <Text>region-programmatic</Text>
      </TouchableOpacity>
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
let mockGeocode; // (query) => { lat, lng, label } | null
jest.mock("@/utils/geocoding", () => ({
  geocodeLocation: (...a) => mockGeocode(...a),
}));
// Bottom sheet stub: render children plainly AND expose the default `index` so the test can assert
// the sheet opens at the lower peek snap.
jest.mock("@gorhom/bottom-sheet", () => {
  const React = require("react");
  const { View, Text } = require("react-native");
  const BottomSheet = React.forwardRef(({ children, index }, ref) => {
    React.useImperativeHandle(ref, () => ({ snapToIndex: jest.fn() }));
    return (
      <View>
        <Text testID="discover-sheet-index">{String(index)}</Text>
        {children}
      </View>
    );
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

// The pane fetches the BASE set once (categories + area are filtered CLIENT-side, no server params),
// so the resolver always returns all four; category/area narrowing is exercised client-side.
function categoryAware() {
  return ok([VET, SHOP, CAFE, PARK]);
}

function setPlatform(os) {
  Object.defineProperty(RN.Platform, "OS", { configurable: true, get: () => os });
}

// Helpers to drive the compact filter pickers. Categories are MULTI-SELECT, so the picker stays open
// on toggle and is dismissed via its backdrop.
const openCatPicker = (scr) => fireEvent.press(scr.getByTestId("discover-filter-category"));
const closeCatPicker = (scr) =>
  fireEvent.press(scr.getByTestId("discover-category-picker-backdrop"));
const toggleCat = (scr, key) => fireEvent.press(scr.getByTestId(`discover-catopt-${key}`));
const pickOneCategory = (scr, key) => {
  openCatPicker(scr);
  toggleCat(scr, key);
  closeCatPicker(scr);
};
const openAreaPicker = (scr) => fireEvent.press(scr.getByTestId("discover-filter-area"));

beforeEach(() => {
  mockPush.mockReset();
  mockParams = {};
  lastOpts = undefined;
  mockReq.mockResolvedValue({ status: "denied" }); // default: no location
  mockPos.mockResolvedValue({ coords: { latitude: 0, longitude: 0 } });
  setPlatform("ios");
  mockWide = false;
  mockResolve = categoryAware;
  mockGeocode = jest.fn(async () => null); // default: no match; tests override
  mockRegion = { latitude: 0, longitude: 0, latitudeDelta: 1, longitudeDelta: 1 };
});

afterEach(() => {
  setPlatform("ios");
  mockWide = false;
});

// ─────────────────────────── unified list + card shape ───────────────────────────
test("merged list renders BOTH types: provider (capability chip) + place (category chip)", async () => {
  const { getByTestId } = render(<DiscoverScreen />);
  await waitFor(() => expect(getByTestId("discover-card-1")).toBeTruthy());
  expect(getByTestId("discover-card-cafe-x")).toBeTruthy();
  expect(getByTestId("discover-cap-1-vet")).toBeTruthy();
  expect(getByTestId("discover-placecat-cafe-x-cafe")).toBeTruthy();
});

// ─────────────────────────── compact filter buttons ───────────────────────────
test("the filter bar shows two compact buttons, not the old long chip rows", async () => {
  const { getByTestId, queryByTestId } = render(<DiscoverScreen />);
  await waitFor(() => expect(getByTestId("discover-card-1")).toBeTruthy());
  expect(getByTestId("discover-filter-category")).toBeTruthy();
  expect(getByTestId("discover-filter-area")).toBeTruthy();
  // old chip testIDs are gone
  expect(queryByTestId("discover-cat-vet")).toBeNull();
  expect(queryByTestId("discover-area-Palermo")).toBeNull();
  // default (All) → neither button highlighted
  expect(getByTestId("discover-filter-category").props.accessibilityState.selected).toBe(false);
  expect(getByTestId("discover-filter-area").props.accessibilityState.selected).toBe(false);
});

test("Category button opens the picker; selecting filters the list + highlights the button", async () => {
  const scr = render(<DiscoverScreen />);
  await waitFor(() => expect(scr.getByTestId("discover-card-1")).toBeTruthy());

  // tapping opens the picker
  fireEvent.press(scr.getByTestId("discover-filter-category"));
  expect(scr.getByTestId("discover-category-picker")).toBeTruthy();

  // toggle Vet → client-side union shows providers only; button highlighted + labelled
  fireEvent.press(scr.getByTestId("discover-catopt-vet"));
  expect(scr.getByTestId("discover-card-1")).toBeTruthy();
  expect(scr.queryByTestId("discover-card-cafe-x")).toBeNull();
  const catBtn = scr.getByTestId("discover-filter-category");
  expect(catBtn.props.accessibilityState.selected).toBe(true);
  expect(catBtn.props.accessibilityLabel).toBe("Category: Vet");
});

test("category picker lists All + the Stores & Vets services + Places (care categories moved to Care)", async () => {
  const scr = render(<DiscoverScreen />);
  await waitFor(() => expect(scr.getByTestId("discover-card-1")).toBeTruthy());
  fireEvent.press(scr.getByTestId("discover-filter-category"));
  // Stores & Vets scope (ticket D1): non-care services + all places.
  for (const key of [
    "all",
    "vet", "telehealth", "grooming", "shop", "adoption", "transport", "insurance",
    "restaurant", "cafe", "bakery", "brewery", "bar", "park", "hotel", "market",
  ]) {
    expect(scr.getByTestId(`discover-catopt-${key}`)).toBeTruthy();
  }
  // Care categories (walker/daycare/sitter/trainer) no longer appear here — they live in the Care hub.
  for (const key of ["walking", "daycare", "sitting", "training"]) {
    expect(scr.queryByTestId(`discover-catopt-${key}`)).toBeNull();
  }
});

test("place category option → places only", async () => {
  const scr = render(<DiscoverScreen />);
  await waitFor(() => expect(scr.getByTestId("discover-card-1")).toBeTruthy());
  pickOneCategory(scr, "cafe");
  expect(scr.getByTestId("discover-card-cafe-x")).toBeTruthy();
  expect(scr.queryByTestId("discover-card-1")).toBeNull();
});

test("multi-select shows the UNION across types (list + map pins)", async () => {
  // all four have coords so map-pin exclusion is meaningful
  mockResolve = () =>
    ok([
      { type: "provider", id: 1, slug: "vet-co", name: "Vet Co", capabilities: ["vet"], lat: "-34.6", lng: "-58.4" },
      { type: "provider", id: 2, slug: "shop-co", name: "Shop Co", capabilities: ["shop"], lat: "-34.6", lng: "-58.5" },
      { type: "place", id: "cafe-x", name: "Cafe X", category: "cafe", lat: "-34.58", lng: "-58.42" },
      { type: "place", id: "park-y", name: "Park Y", category: "park", lat: "-34.55", lng: "-58.45" },
    ]);
  const scr = render(<DiscoverScreen />);
  await waitFor(() => expect(scr.getByTestId("discover-card-1")).toBeTruthy());

  openCatPicker(scr);
  toggleCat(scr, "vet");
  toggleCat(scr, "cafe");
  closeCatPicker(scr);

  // union: vet provider + cafe place; shop provider + park place are excluded
  expect(scr.getByTestId("discover-card-1")).toBeTruthy();
  expect(scr.getByTestId("discover-card-cafe-x")).toBeTruthy();
  expect(scr.queryByTestId("discover-card-2")).toBeNull();
  expect(scr.queryByTestId("discover-card-park-y")).toBeNull();
  expect(scr.getByTestId("discover-filter-category").props.accessibilityLabel).toBe("Category: 2 selected");

  // map pins reflect the same union
  fireEvent.press(scr.getByTestId("discover-view-map"));
  expect(scr.getByTestId("map-marker-1")).toBeTruthy();
  expect(scr.getByTestId("map-marker-cafe-x")).toBeTruthy();
  expect(scr.queryByTestId("map-marker-2")).toBeNull();
  expect(scr.queryByTestId("map-marker-park-y")).toBeNull();
});

test("picker groups collapse and expand (per-group selected count)", async () => {
  const scr = render(<DiscoverScreen />);
  await waitFor(() => expect(scr.getByTestId("discover-card-1")).toBeTruthy());
  openCatPicker(scr);
  // both groups expanded by default
  expect(scr.getByTestId("discover-catopt-vet")).toBeTruthy();
  expect(scr.getByTestId("discover-catopt-cafe")).toBeTruthy();

  // select two Services → the Services group shows a "(2)" count
  toggleCat(scr, "vet");
  toggleCat(scr, "shop");
  expect(scr.getByTestId("discover-catgroup-services-count").props.children).toBe("(2)");

  // collapse Services → its options hide; Places stays expanded
  fireEvent.press(scr.getByTestId("discover-catgroup-services"));
  expect(scr.queryByTestId("discover-catopt-vet")).toBeNull();
  expect(scr.getByTestId("discover-catopt-cafe")).toBeTruthy();

  // expand again → options return
  fireEvent.press(scr.getByTestId("discover-catgroup-services"));
  expect(scr.getByTestId("discover-catopt-vet")).toBeTruthy();
});

test("Clear (✕ on the button) resets categories to All", async () => {
  const scr = render(<DiscoverScreen />);
  await waitFor(() => expect(scr.getByTestId("discover-card-1")).toBeTruthy());
  openCatPicker(scr);
  toggleCat(scr, "vet");
  toggleCat(scr, "shop");
  closeCatPicker(scr);
  expect(scr.getByTestId("discover-filter-category").props.accessibilityLabel).toBe("Category: 2 selected");

  fireEvent.press(scr.getByTestId("discover-filter-category-clear"));
  const btn = scr.getByTestId("discover-filter-category");
  expect(btn.props.accessibilityState.selected).toBe(false);
  expect(btn.props.accessibilityLabel).toBe("Category: All");
  // everything is back
  expect(scr.getByTestId("discover-card-1")).toBeTruthy();
  expect(scr.getByTestId("discover-card-cafe-x")).toBeTruthy();
});

test("the picker's 'All' row also clears the selection", async () => {
  const scr = render(<DiscoverScreen />);
  await waitFor(() => expect(scr.getByTestId("discover-card-1")).toBeTruthy());
  openCatPicker(scr);
  toggleCat(scr, "vet");
  fireEvent.press(scr.getByTestId("discover-catopt-all"));
  closeCatPicker(scr);
  expect(scr.getByTestId("discover-filter-category").props.accessibilityLabel).toBe("Category: All");
  expect(scr.getByTestId("discover-card-cafe-x")).toBeTruthy();
});

test("a zero-result category selection shows no-results with a working Clear filters", async () => {
  // the fixtures have no 'bakery', so selecting only bakery yields nothing
  const scr = render(<DiscoverScreen />);
  await waitFor(() => expect(scr.getByTestId("discover-card-1")).toBeTruthy());
  pickOneCategory(scr, "bakery");
  expect(scr.getByTestId("discover-no-results")).toBeTruthy();
  fireEvent.press(scr.getByTestId("discover-clear-filters"));
  expect(scr.getByTestId("discover-card-1")).toBeTruthy();
  expect(scr.getByTestId("discover-card-cafe-x")).toBeTruthy();
});

// ─────────────────────────── area picker ───────────────────────────
test("Area picker offers ONLY the location search + All areas + Search near me (no enumerated neighborhoods)", async () => {
  const scr = render(<DiscoverScreen />);
  await waitFor(() => expect(scr.getByTestId("discover-card-cafe-x")).toBeTruthy());

  openAreaPicker(scr);
  expect(scr.getByTestId("discover-area-picker")).toBeTruthy();
  expect(scr.getByTestId("discover-location-input")).toBeTruthy();
  expect(scr.getByTestId("discover-areaopt-all")).toBeTruthy();
  expect(scr.getByTestId("discover-areaopt-near")).toBeTruthy();
  // the old data-derived neighborhood rows are gone (they don't scale as the catalog grows)
  expect(scr.queryByTestId("discover-areaopt-Palermo")).toBeNull();
  expect(scr.queryByTestId("discover-areaopt-Belgrano")).toBeNull();
  // and no neighborhood is passed server-side anymore
  expect(lastOpts.neighborhood).toBeUndefined();
});

test("area picker 'Search near me' requests geolocation and applies the Nearest sort", async () => {
  mockReq.mockResolvedValue({ status: "granted" });
  mockPos.mockResolvedValue({ coords: { latitude: -34.6, longitude: -58.4 } });
  mockResolve = () =>
    ok([
      { type: "provider", id: 1, slug: "far", name: "Far One", capabilities: ["vet"], distance_km: 9.2 },
      { type: "place", id: "near", name: "Near One", category: "cafe", distance_km: 0.8 },
    ]);
  const scr = render(<DiscoverScreen />);
  await waitFor(() => expect(scr.getByText("Far One")).toBeTruthy());

  openAreaPicker(scr);
  fireEvent.press(scr.getByTestId("discover-areaopt-near"));
  await waitFor(() => expect(mockReq).toHaveBeenCalled());

  const { Text } = require("react-native");
  const order = () =>
    scr
      .UNSAFE_getAllByType(Text)
      .map((n) => (typeof n.props.children === "string" ? n.props.children : null))
      .filter((s) => s === "Far One" || s === "Near One");
  await waitFor(() => expect(order()[0]).toBe("Near One")); // nearest first
  // Area button reflects the near-me selection.
  expect(scr.getByTestId("discover-filter-area").props.accessibilityLabel).toBe("Area: Search near me");
  expect(scr.getByTestId("discover-filter-area").props.accessibilityState.selected).toBe(true);
});

test("Area picker: searching a location geocodes, biases geo + radius, recenters the map, labels the button", async () => {
  mockGeocode = jest.fn(async () => ({ lat: -34.46, lng: -58.91, label: "Pilar" }));
  const scr = render(<DiscoverScreen />);
  await waitFor(() => expect(scr.getByTestId("discover-card-1")).toBeTruthy());

  openAreaPicker(scr);
  fireEvent.changeText(scr.getByTestId("discover-location-input"), "Pilar, Buenos Aires");
  fireEvent(scr.getByTestId("discover-location-input"), "submitEditing");

  await waitFor(() => expect(mockGeocode).toHaveBeenCalledWith("Pilar, Buenos Aires"));
  // geo applied to the discovery query (lat/lng + radius-bounded)
  await waitFor(() => expect(lastOpts.lat).toBe(-34.46));
  expect(lastOpts.lng).toBe(-58.91);
  expect(lastOpts.radius).toBe(25);
  // the Area button is labelled with the chosen location + highlighted
  const areaBtn = scr.getByTestId("discover-filter-area");
  expect(areaBtn.props.accessibilityLabel).toBe("Area: Pilar");
  expect(areaBtn.props.accessibilityState.selected).toBe(true);
  // the map recenters on the searched location
  fireEvent.press(scr.getByTestId("discover-view-map"));
  expect(scr.getByTestId("map-center").props.children).toBe("-34.46,-58.91");
});

test("Area picker: a location with no match shows 'location not found' and never fabricates coords", async () => {
  mockGeocode = jest.fn(async () => null);
  const scr = render(<DiscoverScreen />);
  await waitFor(() => expect(scr.getByTestId("discover-card-1")).toBeTruthy());

  openAreaPicker(scr);
  fireEvent.changeText(scr.getByTestId("discover-location-input"), "asdfghjkl");
  fireEvent(scr.getByTestId("discover-location-input"), "submitEditing");

  await waitFor(() => expect(scr.getByTestId("discover-location-notfound")).toBeTruthy());
  // picker stays open; no location applied; no geo radius
  expect(scr.getByTestId("discover-area-picker")).toBeTruthy();
  expect(scr.getByTestId("discover-filter-area").props.accessibilityLabel).toBe("Area: All areas");
  expect(lastOpts.radius).toBeUndefined();
});

test("Area picker: choosing All areas clears a searched location", async () => {
  mockGeocode = jest.fn(async () => ({ lat: -34.46, lng: -58.91, label: "Pilar" }));
  const scr = render(<DiscoverScreen />);
  await waitFor(() => expect(scr.getByTestId("discover-card-1")).toBeTruthy());

  openAreaPicker(scr);
  fireEvent.changeText(scr.getByTestId("discover-location-input"), "Pilar");
  fireEvent(scr.getByTestId("discover-location-input"), "submitEditing");
  await waitFor(() =>
    expect(scr.getByTestId("discover-filter-area").props.accessibilityLabel).toBe("Area: Pilar"),
  );

  openAreaPicker(scr);
  fireEvent.press(scr.getByTestId("discover-areaopt-all"));
  expect(scr.getByTestId("discover-filter-area").props.accessibilityLabel).toBe("Area: All areas");
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

// ─────────────────────────── map includes places ───────────────────────────
test("map markers include BOTH providers and places that have coords", async () => {
  const { getByTestId, queryByTestId } = render(<DiscoverScreen />);
  await waitFor(() => expect(getByTestId("discover-view-toggle")).toBeTruthy());
  fireEvent.press(getByTestId("discover-view-map"));
  expect(getByTestId("map-marker-1")).toBeTruthy();
  expect(getByTestId("map-marker-cafe-x")).toBeTruthy();
  expect(queryByTestId("map-marker-park-y")).toBeNull();
  expect(getByTestId("discover-offmap-note")).toBeTruthy();
});

// ─────────────────────────── map overlay + sheet snap ───────────────────────────
test("map overlay is the slim bar (toggle + filter buttons + note), not the chip rows", async () => {
  const { getByTestId, queryByTestId } = render(<DiscoverScreen />);
  await waitFor(() => expect(getByTestId("discover-view-toggle")).toBeTruthy());
  fireEvent.press(getByTestId("discover-view-map"));
  expect(getByTestId("discover-map-overlay")).toBeTruthy();
  expect(getByTestId("discover-filter-category")).toBeTruthy();
  expect(getByTestId("discover-filter-area")).toBeTruthy();
  expect(queryByTestId("discover-cat-vet")).toBeNull(); // old chip rows gone
});

test("map bottom sheet defaults to the lowest peek snap (index 0)", async () => {
  const { getByTestId } = render(<DiscoverScreen />);
  await waitFor(() => expect(getByTestId("discover-view-toggle")).toBeTruthy());
  fireEvent.press(getByTestId("discover-view-map"));
  expect(getByTestId("discover-sheet-index").props.children).toBe("0");
});

test("pins reflect the filtered set: a category filter removes the other type's pin", async () => {
  const scr = render(<DiscoverScreen />);
  await waitFor(() => expect(scr.getByTestId("discover-card-1")).toBeTruthy());
  fireEvent.press(scr.getByTestId("discover-view-map"));
  // both located items have a pin
  expect(scr.getByTestId("map-marker-1")).toBeTruthy(); // provider Vet Co
  expect(scr.getByTestId("map-marker-cafe-x")).toBeTruthy(); // place Cafe X
  // filter to cafe → only the place pin remains
  pickOneCategory(scr, "cafe");
  expect(scr.getByTestId("map-marker-cafe-x")).toBeTruthy();
  expect(scr.queryByTestId("map-marker-1")).toBeNull();
});

test("panning the map LIVE-narrows the list + pins to the viewport (debounced), no button", async () => {
  // A tight viewport around Vet Co (-34.6,-58.4) that excludes Cafe X (-34.58,-58.42).
  mockRegion = { latitude: -34.6, longitude: -58.4, latitudeDelta: 0.02, longitudeDelta: 0.02 };
  const scr = render(<DiscoverScreen />);
  await waitFor(() => expect(scr.getByTestId("discover-card-1")).toBeTruthy());
  fireEvent.press(scr.getByTestId("discover-view-map"));

  // both located items visible; the old "Search this area" button is gone for good
  expect(scr.getByTestId("discover-card-1")).toBeTruthy();
  expect(scr.getByTestId("discover-card-cafe-x")).toBeTruthy();
  expect(scr.queryByTestId("discover-search-area")).toBeNull();

  jest.useFakeTimers();
  fireEvent.press(scr.getByTestId("map-fire-region"));
  // debounce not yet elapsed → list unchanged
  expect(scr.getByTestId("discover-card-cafe-x")).toBeTruthy();
  act(() => jest.advanceTimersByTime(400));
  jest.useRealTimers();

  // after the debounce the list + pins narrow to the viewport (Vet Co in, Cafe X out), no tap needed
  expect(scr.getByTestId("discover-card-1")).toBeTruthy();
  expect(scr.queryByTestId("discover-card-cafe-x")).toBeNull();
  expect(scr.getByTestId("map-marker-1")).toBeTruthy();
  expect(scr.queryByTestId("map-marker-cafe-x")).toBeNull();
  // still no button
  expect(scr.queryByTestId("discover-search-area")).toBeNull();
});

test("a programmatic region change (no gesture) does NOT narrow the list", async () => {
  mockRegion = { latitude: -34.6, longitude: -58.4, latitudeDelta: 0.02, longitudeDelta: 0.02 };
  const scr = render(<DiscoverScreen />);
  await waitFor(() => expect(scr.getByTestId("discover-card-1")).toBeTruthy());
  fireEvent.press(scr.getByTestId("discover-view-map"));

  jest.useFakeTimers();
  // a non-gesture region settle (initial mount / programmatic recenter) is ignored
  fireEvent.press(scr.getByTestId("map-fire-region-programmatic"));
  act(() => jest.advanceTimersByTime(400));
  // both still shown — no viewport narrowing
  expect(scr.getByTestId("discover-card-1")).toBeTruthy();
  expect(scr.getByTestId("discover-card-cafe-x")).toBeTruthy();

  // a real user gesture DOES narrow it
  fireEvent.press(scr.getByTestId("map-fire-region"));
  act(() => jest.advanceTimersByTime(400));
  jest.useRealTimers();
  expect(scr.queryByTestId("discover-card-cafe-x")).toBeNull();
});

test("tapping a pin raises the sheet, highlights the item, and moves it to the TOP of the list (no callout)", async () => {
  // Cafe X is NOT first in the fetched order, so hoisting-to-top is observable.
  mockResolve = () =>
    ok([
      { type: "provider", id: 1, slug: "vet-co", name: "Vet Co", capabilities: ["vet"], lat: "-34.6", lng: "-58.4" },
      { type: "place", id: "cafe-x", name: "Cafe X", category: "cafe", lat: "-34.58", lng: "-58.42" },
    ]);
  const scr = render(<DiscoverScreen />);
  await waitFor(() => expect(scr.getByTestId("discover-card-1")).toBeTruthy());
  fireEvent.press(scr.getByTestId("discover-view-map"));

  // the old pin mini-card / "See more" callout no longer exists
  expect(scr.queryByTestId("discover-map-card")).toBeNull();
  // Vet Co is first before any pin tap
  const idsBefore = scr
    .getAllByTestId(/^discover-card-(1|cafe-x)$/)
    .map((n) => n.props.testID);
  expect(idsBefore[0]).toBe("discover-card-1");

  fireEvent.press(scr.getByTestId("map-marker-cafe-x"));

  // highlighted (pin↔card), no callout, no navigation on the pin tap itself
  expect(scr.getByTestId("discover-card-cafe-x-selected")).toBeTruthy();
  expect(scr.queryByTestId("discover-map-card")).toBeNull();
  expect(scr.queryByTestId("discover-map-seemore")).toBeNull();
  expect(mockPush).not.toHaveBeenCalled();
  // the tapped item is now first in the list
  const idsAfter = scr
    .getAllByTestId(/^discover-card-(1|cafe-x)$/)
    .map((n) => n.props.testID);
  expect(idsAfter[0]).toBe("discover-card-cafe-x");

  // drill-in still happens by tapping the list card (existing routing)
  fireEvent.press(scr.getByTestId("discover-card-cafe-x"));
  expect(mockPush).toHaveBeenCalledWith({ pathname: "/service/place", params: { id: "cafe-x" } });
});

// ─────────────────────────── sorts (mixed types) ───────────────────────────
test("Top rated / Most reviewed reorder the merged list; Nearest only with location", async () => {
  const { getByText, queryByText, UNSAFE_getAllByType } = render(<DiscoverScreen />);
  await waitFor(() => expect(getByText("Vet Co")).toBeTruthy());
  expect(queryByText("Nearest")).toBeNull();
  const { Text } = require("react-native");
  const order = () =>
    UNSAFE_getAllByType(Text)
      .map((n) => (typeof n.props.children === "string" ? n.props.children : null))
      .filter((s) => s === "Vet Co" || s === "Cafe X");
  fireEvent.press(getByText("Top rated"));
  expect(order()[0]).toBe("Vet Co");
  fireEvent.press(getByText("Most reviewed"));
  expect(order()[0]).toBe("Cafe X");
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
  expect(getByTestId("discover-card-1")).toBeTruthy();
  expect(queryByTestId("discover-card-2")).toBeNull();
  expect(getByTestId("discover-card-3")).toBeTruthy();
  expect(getByTestId("discover-card-cafe-z")).toBeTruthy();
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
  const { getByTestId } = render(<DiscoverScreen />);
  await waitFor(() => expect(getByTestId("discover-view-toggle")).toBeTruthy());
  fireEvent.press(getByTestId("discover-view-map"));

  fireEvent.press(getByTestId("map-marker-cafe-x"));
  expect(getByTestId("discover-card-cafe-x-selected")).toBeTruthy();
  expect(mockPush).not.toHaveBeenCalled();

  fireEvent.press(getByTestId("discover-card-1"));
  expect(getByTestId("map-selected-index").props.children).toBe("0");
  expect(mockPush).toHaveBeenCalled();
});

test("wide screens render a side-by-side split with list + map (iOS)", async () => {
  mockWide = true;
  const { getByTestId, queryByTestId } = render(<DiscoverScreen />);
  await waitFor(() => expect(getByTestId("discover-split")).toBeTruthy());
  expect(getByTestId("discover-card-1")).toBeTruthy();
  expect(getByTestId("discover-map")).toBeTruthy();
  expect(queryByTestId("discover-view-toggle")).toBeNull();
  // the filter bar still renders in the split
  expect(getByTestId("discover-filter-category")).toBeTruthy();
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
test("initialCategory seeds the selection (alias veterinary→vet); place category too", async () => {
  mockParams = { category: "veterinary" };
  let scr = render(<DiscoverScreen />);
  await waitFor(() => expect(scr.getByTestId("discover-card-1")).toBeTruthy());
  // seeded to the vet category → client-side filter shows providers only, button pre-selected
  expect(scr.queryByTestId("discover-card-cafe-x")).toBeNull();
  expect(scr.getByTestId("discover-filter-category").props.accessibilityLabel).toBe("Category: Vet");
  scr.unmount();

  mockParams = { category: "cafe" };
  scr = render(<DiscoverScreen />);
  await waitFor(() => expect(scr.getByTestId("discover-card-cafe-x")).toBeTruthy());
  expect(scr.queryByTestId("discover-card-1")).toBeNull();
});

test("a legacy care deep-link (?category=walker) falls back to All on Stores & Vets (ticket D1)", async () => {
  mockParams = { category: "walker" };
  const scr = render(<DiscoverScreen />);
  await waitFor(() => expect(scr.getByTestId("discover-card-1")).toBeTruthy());
  // Not seeded to a hidden care chip → the category button stays "All", nothing pre-filtered.
  expect(scr.getByTestId("discover-filter-category").props.accessibilityLabel).toBe("Category: All");
  // Both a provider and a place remain visible (no care filter applied).
  expect(scr.getByTestId("discover-card-cafe-x")).toBeTruthy();
});

// ─────────────────────────── showHeader (tab shell) ───────────────────────────
test("showHeader={false} suppresses the internal header but keeps the filter bar + search", async () => {
  const { getByTestId, getByPlaceholderText, queryByText } = render(
    <ServicesDiscovery variant="landing" showHeader={false} />,
  );
  await waitFor(() => expect(getByTestId("discover-card-1")).toBeTruthy());
  expect(queryByText("Find trusted pet care near you")).toBeNull();
  expect(getByTestId("discover-filter-category")).toBeTruthy();
  expect(getByPlaceholderText("Search services & places")).toBeTruthy();
});

test("showHeader defaults to true for the landing variant (header shown)", async () => {
  const { getByText } = render(<ServicesDiscovery variant="landing" />);
  await waitFor(() =>
    expect(getByText("Find trusted pet care near you")).toBeTruthy(),
  );
});
