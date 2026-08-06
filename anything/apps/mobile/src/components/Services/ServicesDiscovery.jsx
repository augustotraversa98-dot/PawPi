import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Location from "expo-location";
import { useTranslation } from "react-i18next";
import BottomSheet, { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import {
  ArrowLeft,
  Store,
  MapPin,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Check,
  X,
  Navigation,
  Map as MapIcon,
  List as ListIcon,
} from "lucide-react-native";
import { COLORS } from "@/constants/colors";
import { TYPE, RADIUS, SPACING, MATERIALS, BLUR } from "@/constants/theme";
import { Card, PressableScale, GlassSurface } from "@/components/ui";
import { RefreshableScrollView } from "@/components/RefreshableScrollView";
import MapLocationView from "@/components/Map/MapLocationView";
import { useServicesDiscover } from "@/hooks/useServicesDiscover";
import { useIsWideScreen } from "@/hooks/useIsWideScreen";
import RatingBadge from "@/components/Providers/RatingBadge";
import ProviderListControls, {
  useProviderListFilter,
  PROVIDER_SORTS,
} from "@/components/Providers/ProviderListControls";
import { deriveOpenNow } from "@/utils/providerHours";
import { geocodeLocation } from "@/utils/geocoding";
import {
  SERVICE_CATEGORIES,
  PLACE_CATEGORIES,
  PROVIDER_CATEGORY_KEYS,
  PLACE_CATEGORY_KEYS,
  resolveInitialCategory,
} from "@/constants/servicesCategories";

// See the PR description for the filter/map overhaul overview (compact pickers, multi-select,
// location search, live viewport filtering, pin select-to-top).
// UNIFIED Services discovery (Services Hub P2 + P3, merged over providers + pet-friendly PLACES).
// ONE search / filter / list / map over the unified /api/services/discover feed:
//   • mobile (narrow): full-screen map + a draggable bottom-sheet list + a list⇄map toggle,
//     with a SLIM filter bar (Category + Area buttons) pinned over the map;
//   • wide screens (web / iPad): a true side-by-side split (list left, map right);
//   • two-way pin↔card highlight.
//
// UX: category + area are picked from two COMPACT FILTER BUTTONS that open pickers (no more long
// scrolling chip rows). Categories are filtered CLIENT-side (multi-select union); the Area picker is
// a location search + near-me geo (no enumerated neighborhoods). search (q), the sorts (rating /
// reviews / nearest) and open-now stay CLIENT-side. open-now applies to
// PROVIDERS only — places have no hours, so they are always included. "Search near me" requests the
// device location and switches the sort to Nearest so results bias to nearby.
//
// This body backs BOTH the Services TAB LANDING (variant "landing" — a tab root, no back arrow) and
// the pushed /service/discover screen (variant "screen" — with a back arrow).
//
// MAP ENGINE: iOS uses Apple Maps (react-native-maps PROVIDER_DEFAULT — free, no key). Android has no
// Google Maps key and web maps aren't wired, so the map DEGRADES to a clean "coming soon" placeholder
// there (never a blank/gray map or a crash) and the narrow list⇄map toggle is hidden. See DiscoverMap.

// category key → its i18n label key (for the Category button label + the picker options).
const CATEGORY_LABEL_KEY = { all: "discover.cat.all" };
for (const c of SERVICE_CATEGORIES) CATEGORY_LABEL_KEY[c.key] = c.labelKey;
for (const c of PLACE_CATEGORIES) CATEGORY_LABEL_KEY[c.key] = c.labelKey;

// provider category key → backing capability, for CLIENT-side multi-select union filtering.
const CATEGORY_CAPABILITY = {};
for (const c of SERVICE_CATEGORIES) CATEGORY_CAPABILITY[c.key] = c.capability;

// When the user searches a free-text LOCATION, bound results to this radius (km) around it so the
// list shows what's near that place (device/near-me geo stays unbounded).
const LOCATION_SEARCH_RADIUS_KM = 25;

function formatKm(km) {
  if (km == null) return null;
  const n = Number(km);
  if (!Number.isFinite(n)) return null;
  return n < 10 ? n.toFixed(1) : String(Math.round(n));
}

// Coords come back as numeric — porsager surfaces them as strings, so coerce and validate before
// mapping. An item without a location has null lat/lng.
function hasCoords(it) {
  const lat = Number(it?.lat);
  const lng = Number(it?.lng);
  return (
    it?.lat != null &&
    it?.lng != null &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}

// Is an item inside the map's visible region? region is react-native-maps' { latitude, longitude,
// latitudeDelta, longitudeDelta } (center + full span). Used by the LIVE viewport filter to narrow the
// list to what's on screen as the map pans. Coord-less items are never "in" a viewport.
function inRegion(it, region) {
  if (!region) return true;
  const lat = Number(it?.lat);
  const lng = Number(it?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return (
    Math.abs(lat - region.latitude) <= region.latitudeDelta / 2 &&
    Math.abs(lng - region.longitude) <= region.longitudeDelta / 2
  );
}

// Only iOS has a working, keyless map engine today (Apple Maps). Android has no Google Maps key and
// web maps aren't wired → placeholder. A function (not a module const) so the platform is read at
// render time.
const isMapEngineOk = () => Platform.OS === "ios";

// Provider routing bridge (UNCHANGED from the provider-only pane). The storefront (/service/provider)
// serves bookable + shop providers and WINS for any provider that has one (incl. mixed providers).
const STOREFRONT_CAPS = [
  "vet",
  "telehealth",
  "groomer",
  "walker",
  "sitter",
  "daycare",
  "trainer",
  "shop",
  "pharmacy",
];
// Types the storefront can't serve yet open their existing legacy screen instead of dead-ending.
const LEGACY_BRIDGE = {
  adoption: "/service/adoption",
  insurance: "/service/insurance",
  transport: "/service/transport",
};

export default function ServicesDiscovery({
  variant = "screen",
  initialCategory,
  showHeader = true,
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const { height: winHeight } = useWindowDimensions();
  const isWide = useIsWideScreen();
  const isLanding = variant === "landing";

  // Multi-select categories: an array of taxonomy keys ([] = "All" = everything). Seeded from a
  // ?category deep link (a single resolved key) when present.
  const [selectedCats, setSelectedCats] = useState(() => {
    const init = resolveInitialCategory(initialCategory);
    return init === "all" ? [] : [init];
  });
  const [nearMe, setNearMe] = useState(false);
  // Free-text location search (Area picker). `locationLabel` (short name, e.g. "Pilar") also flags
  // that the active geo came from a searched location → radius-bound + recenter the map.
  const [locationLabel, setLocationLabel] = useState(null);
  const [locationQuery, setLocationQuery] = useState("");
  const [geocoding, setGeocoding] = useState(false);
  const [locationNotFound, setLocationNotFound] = useState(false);
  const [openNow, setOpenNow] = useState(false);
  const [coord, setCoord] = useState(null);
  const [denied, setDenied] = useState(false);
  const [mode, setMode] = useState("list"); // narrow-screen toggle: "list" | "map" (list default)
  const [selectedId, setSelectedId] = useState(null);
  const [catPickerOpen, setCatPickerOpen] = useState(false);
  const [areaPickerOpen, setAreaPickerOpen] = useState(false);
  // LIVE viewport: the current map region narrows the list + pins to what's on screen (map/split only).
  // Updated on every settled pan/zoom, DEBOUNCED so rapid gestures don't thrash the list.
  const [viewportRegion, setViewportRegion] = useState(null);
  const regionDebounceRef = useRef(null);
  // The two picker groups are collapsible so the list stays short (both open by default).
  const [servicesExpanded, setServicesExpanded] = useState(true);
  const [placesExpanded, setPlacesExpanded] = useState(true);
  const sheetRef = useRef(null);
  const snapPoints = useMemo(() => ["25%", "55%", "90%"], []);

  // Ask for location once. Denied → the list still works; distance/Nearest turn off.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          if (active) setDenied(true);
          return;
        }
        const pos = await Location.getCurrentPositionAsync({});
        const la = pos?.coords?.latitude;
        const ln = pos?.coords?.longitude;
        if (active && Number.isFinite(la) && Number.isFinite(ln)) {
          setCoord({ lat: la, lng: ln });
        }
      } catch {
        if (active) setDenied(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Categories are MULTI-SELECT and filtered CLIENT-side (see categoryFiltered), so we fetch the BASE
  // set (category 'all' = both sources) once and let the union filter drive the list AND the map pins
  // instantly. lat/lng attach distance_km + nearest ordering.
  const { data: items, isLoading, isError, refetch } = useServicesDiscover({
    ...(coord ? { lat: coord.lat, lng: coord.lng } : {}),
    // A searched location bounds results to its radius; device/near-me geo stays unbounded.
    ...(locationLabel && coord ? { radius: LOCATION_SEARCH_RADIUS_KM } : {}),
  });

  const raw = useMemo(() => items ?? [], [items]);

  // Multi-select UNION: no selection = All = everything; otherwise a PROVIDER matches when any of its
  // capabilities is in a selected provider-category, and a PLACE matches when its category is a
  // selected place-category.
  const categoryFiltered = useMemo(() => {
    if (selectedCats.length === 0) return raw;
    const caps = new Set();
    const placeCats = new Set();
    for (const key of selectedCats) {
      if (PROVIDER_CATEGORY_KEYS.has(key)) caps.add(CATEGORY_CAPABILITY[key]);
      else if (PLACE_CATEGORY_KEYS.has(key)) placeCats.add(key);
    }
    return raw.filter((it) => {
      if (it.type === "place") return placeCats.has(it.category);
      const c = Array.isArray(it.capabilities) ? it.capabilities : [];
      return c.some((x) => caps.has(x));
    });
  }, [raw, selectedCats]);

  // open-now (client-side) hides only providers PROVEN closed; places (no hours) always stay.
  const preFiltered = useMemo(() => {
    if (!openNow) return categoryFiltered;
    return categoryFiltered.filter(
      (it) => it.type === "place" || deriveOpenNow(it?.hours_json) !== false,
    );
  }, [categoryFiltered, openNow]);

  // Broaden search to the SERVICE TYPE / PLACE CATEGORY too: append each provider capability slug +
  // its localized label, or the place category slug + its label, so typing "vet"/"veterinaria" or
  // "cafe"/"café" matches even when the name doesn't contain the word.
  const extraText = useCallback(
    (it) => {
      if (it.type === "place") {
        return [
          it.category,
          it.category ? t(`discover.placeCat.${it.category}`) : null,
        ].filter(Boolean);
      }
      const caps = Array.isArray(it.capabilities) ? it.capabilities : [];
      return [...caps, ...caps.map((c) => t(`discover.cap.${c}`))];
    },
    [t],
  );

  const { query, setQuery, sort, setSort, filtered } = useProviderListFilter(
    preFiltered,
    { extraText },
  );

  const sorts = useMemo(
    () =>
      coord
        ? [...PROVIDER_SORTS, { key: "nearest", labelKey: "discover.sortNearest" }]
        : PROVIDER_SORTS,
    [coord],
  );

  const mapEngineOk = isMapEngineOk();
  const showToggle = !isWide && mapEngineOk;
  const layout = isWide ? "split" : mode === "map" && mapEngineOk ? "map" : "list";
  // Viewport filtering only bites when the map is actually on screen (map mode / wide split); list-only
  // mode always shows the full filtered set.
  const mapVisible = layout === "split" || layout === "map";

  // What the list + map actually show: the filtered set, LIVE-narrowed to the current map viewport
  // while the map is visible (both list AND pins follow the viewport), then the selected item (if any)
  // hoisted to the TOP so a tapped pin surfaces its card first. No viewport → full filtered set.
  const displayItems = useMemo(() => {
    const base =
      mapVisible && viewportRegion
        ? filtered.filter((it) => inRegion(it, viewportRegion))
        : filtered;
    if (!selectedId) return base;
    const idx = base.findIndex((it) => it.id === selectedId);
    if (idx <= 0) return base;
    const copy = base.slice();
    const [sel] = copy.splice(idx, 1);
    copy.unshift(sel);
    return copy;
  }, [filtered, viewportRegion, mapVisible, selectedId]);

  // Map data: only the shown items that actually have a location (providers OR places).
  const withCoords = useMemo(() => displayItems.filter(hasCoords), [displayItems]);
  const markers = useMemo(
    () =>
      withCoords.map((it) => ({
        lat: Number(it.lat),
        lng: Number(it.lng),
        id: it.id,
        title: it.name,
      })),
    [withCoords],
  );
  const selectedIndex = useMemo(
    () => withCoords.findIndex((it) => it.id === selectedId),
    [withCoords, selectedId],
  );

  const hasItems = raw.length > 0;

  // ── filter selection ──────────────────────────────────────────────────────
  // Toggle one category on/off (multi-select). The picker STAYS OPEN so several can be picked.
  const toggleCategory = (key) => {
    setSelectedCats((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
    setSelectedId(null);
  };
  // Reset categories to "All" (the quick-clear ✕ + the picker's "All" row).
  const clearCategories = () => {
    setSelectedCats([]);
    setSelectedId(null);
  };

  const onSelectAllAreas = () => {
    setNearMe(false);
    setLocationLabel(null);
    setLocationNotFound(false);
    setAreaPickerOpen(false);
  };

  // "Search near me": request the device location, then bias results to nearby by attaching the
  // device lat/lng (existing geo path) and switching the sort to Nearest.
  const onSelectNearMe = async () => {
    setAreaPickerOpen(false);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setDenied(true);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({});
      const la = pos?.coords?.latitude;
      const ln = pos?.coords?.longitude;
      if (Number.isFinite(la) && Number.isFinite(ln)) {
        setCoord({ lat: la, lng: ln });
        setNearMe(true);
        setLocationLabel(null);
        setLocationNotFound(false);
        setSort("nearest");
      }
    } catch {
      setDenied(true);
    }
  };

  // "Search a location": geocode the typed text via Nominatim (never fabricates coordinates). On a
  // hit, set the discovery geo to that point (radius-bounded + Nearest sort) and recenter the map;
  // on a miss, keep the picker open and show a "location not found" message.
  const onSubmitLocation = async () => {
    const q = locationQuery.trim();
    if (!q || geocoding) return;
    setGeocoding(true);
    setLocationNotFound(false);
    const result = await geocodeLocation(q);
    setGeocoding(false);
    if (!result) {
      setLocationNotFound(true);
      return;
    }
    setCoord({ lat: result.lat, lng: result.lng });
    setLocationLabel(result.label);
    setNearMe(false);
    setSort("nearest");
    setLocationQuery("");
    setAreaPickerOpen(false);
  };

  // Category button: "All" (none), the single category's label (one), or "N selected" (many).
  const categoryActive = selectedCats.length > 0;
  const categoryLabel =
    selectedCats.length === 0
      ? t("discover.cat.all")
      : selectedCats.length === 1
        ? t(CATEGORY_LABEL_KEY[selectedCats[0]])
        : t("discover.nSelected", { count: selectedCats.length });
  const servicesSelectedCount = SERVICE_CATEGORIES.filter((c) =>
    selectedCats.includes(c.key),
  ).length;
  const placesSelectedCount = PLACE_CATEGORIES.filter((c) =>
    selectedCats.includes(c.key),
  ).length;

  const areaActive = nearMe || locationLabel != null;
  const areaLabel =
    locationLabel != null
      ? locationLabel
      : nearMe
        ? t("discover.searchNearMe")
        : t("discover.allAreas");

  const openItem = (it) => {
    setSelectedId(it.id); // selecting a card highlights its pin
    if (it.type === "place") {
      router.push({ pathname: "/service/place", params: { id: it.id } });
      return;
    }
    // Provider bridge (unchanged). Storefront serves bookable + shop providers and wins for mixed
    // providers; only a provider with NONE of those uses the interim legacy bridge.
    const caps = Array.isArray(it.capabilities) ? it.capabilities : [];
    if (!caps.some((c) => STOREFRONT_CAPS.includes(c))) {
      const bridgeCap = caps.find((c) => LEGACY_BRIDGE[c]);
      if (bridgeCap) {
        router.push(
          bridgeCap === "adoption"
            ? { pathname: LEGACY_BRIDGE.adoption, params: { providerId: it.id } }
            : { pathname: LEGACY_BRIDGE[bridgeCap] },
        );
        return;
      }
    }
    router.push({ pathname: "/service/provider", params: { slug: it.slug } });
  };

  // Tapping a pin: raise the sheet, highlight the pin's card, and (via displayItems) hoist that item
  // to the TOP of the list so it's the first card. Drill-in still happens by tapping the list card.
  const onMarkerPress = (_i, point) => {
    setSelectedId(point.id);
    sheetRef.current?.snapToIndex?.(1); // bring the sheet up so the card is visible
  };

  // Map pan/zoom settled: LIVE-narrow the list + pins to what's on screen. React only to USER gestures
  // (ignore the initial/programmatic region set), DEBOUNCED ~400ms so a fast drag settles once.
  const onMapRegionChange = (region, details) => {
    if (!details?.isGesture) return;
    if (regionDebounceRef.current) clearTimeout(regionDebounceRef.current);
    regionDebounceRef.current = setTimeout(() => setViewportRegion(region), 400);
  };
  // Drop the pending debounce on unmount so a late timer can't set state on a gone component.
  useEffect(
    () => () => {
      if (regionDebounceRef.current) clearTimeout(regionDebounceRef.current);
    },
    [],
  );

  const clearFilters = () => {
    setSelectedCats([]);
    setNearMe(false);
    setLocationLabel(null);
    setLocationNotFound(false);
    setOpenNow(false);
    setQuery("");
    setSort("relevance");
    setViewportRegion(null);
  };

  // ─────────────────────────── shared render pieces ───────────────────────────
  const deniedBanner = denied ? (
    <Card
      testID="discover-denied-banner"
      level="none"
      borderColor={COLORS.peach}
      style={{
        padding: SPACING.md,
        marginBottom: SPACING.md,
        flexDirection: "row",
        alignItems: "center",
        gap: SPACING.sm,
      }}
    >
      <MapPin size={16} color={COLORS.mutedBrown} />
      <Text style={[TYPE.footnote, { color: COLORS.mutedBrown, flex: 1, fontWeight: "500" }]}>
        {t("places.locationDenied")}
      </Text>
    </Card>
  ) : null;

  const toggle = showToggle ? (
    <View
      testID="discover-view-toggle"
      style={{
        flexDirection: "row",
        alignSelf: "flex-start",
        borderRadius: RADIUS.chip,
        borderWidth: 1,
        borderColor: COLORS.peach,
        overflow: "hidden",
        marginBottom: SPACING.sm,
      }}
    >
      {[
        { key: "list", label: t("discover.viewList"), Icon: ListIcon },
        { key: "map", label: t("discover.viewMap"), Icon: MapIcon },
      ].map(({ key, label, Icon }) => {
        const active = mode === key;
        return (
          <PressableScale
            key={key}
            testID={`discover-view-${key}`}
            onPress={() => setMode(key)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
              paddingHorizontal: SPACING.md,
              paddingVertical: SPACING.sm,
              backgroundColor: active ? COLORS.coral : COLORS.card,
            }}
          >
            <Icon size={15} color={active ? "#fff" : COLORS.mutedBrown} />
            <Text
              style={[
                TYPE.footnote,
                { fontWeight: "700", color: active ? "#fff" : COLORS.mutedBrown },
              ]}
            >
              {label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  ) : null;

  // Slim filter bar: two compact buttons (Category + Area) that open pickers. Highlighted coral when
  // a non-default value is selected. Shown in BOTH list and map views.
  const filterBar = (
    <View
      style={{
        flexDirection: "row",
        gap: SPACING.sm,
        marginBottom: SPACING.md,
      }}
    >
      <FilterButton
        testID="discover-filter-category"
        label={categoryLabel}
        active={categoryActive}
        accessibilityLabel={`${t("discover.filterCategory")}: ${categoryLabel}`}
        onPress={() => setCatPickerOpen(true)}
        onClear={clearCategories}
        clearLabel={t("discover.clear")}
      />
      <FilterButton
        testID="discover-filter-area"
        label={areaLabel}
        active={areaActive}
        accessibilityLabel={`${t("discover.byArea")}: ${areaLabel}`}
        onPress={() => setAreaPickerOpen(true)}
      />
    </View>
  );

  const searchAndSort = (
    <>
      <ProviderListControls
        query={query}
        setQuery={setQuery}
        sort={sort}
        setSort={setSort}
        sorts={sorts}
        placeholder={t("discover.searchUnifiedPlaceholder")}
      />
      <View style={{ marginBottom: SPACING.md + 2 }}>
        <PressableScale
          testID="discover-opennow"
          onPress={() => setOpenNow((v) => !v)}
          accessibilityRole="button"
          accessibilityState={{ selected: openNow }}
          style={{
            alignSelf: "flex-start",
            paddingHorizontal: SPACING.md,
            paddingVertical: SPACING.xs + 2,
            borderRadius: RADIUS.chip,
            borderWidth: 1,
            borderColor: openNow ? COLORS.coral : COLORS.peach,
            backgroundColor: openNow ? COLORS.coral + "18" : COLORS.card,
          }}
        >
          <Text
            style={[
              TYPE.footnote,
              { fontWeight: "700", color: openNow ? COLORS.coral : COLORS.mutedBrown },
            ]}
          >
            {t("discover.openNow")}
          </Text>
        </PressableScale>
      </View>
    </>
  );

  const results =
    displayItems.length === 0 ? (
      <EmptyState
        testID="discover-no-results"
        title={t("discover.noResultsTitle")}
        body={t("discover.noResultsBody")}
        action={
          <PressableScale
            testID="discover-clear-filters"
            onPress={clearFilters}
            style={{
              marginTop: SPACING.md,
              paddingHorizontal: SPACING.lg,
              paddingVertical: SPACING.sm + 2,
              borderRadius: RADIUS.chip,
              backgroundColor: COLORS.coral,
            }}
          >
            <Text style={[TYPE.subhead, { color: "#fff", fontWeight: "800" }]}>
              {t("discover.clearFilters")}
            </Text>
          </PressableScale>
        }
      />
    ) : (
      displayItems.map((it) => (
        <ResultCard
          key={`${it.type}-${it.id}`}
          item={it}
          t={t}
          selected={it.id === selectedId}
          onPress={() => openItem(it)}
        />
      ))
    );

  // Subtle "how many are on the map" note (never fabricate a pin).
  const offMapNote =
    displayItems.length > 0 && withCoords.length < displayItems.length ? (
      <Text
        testID="discover-offmap-note"
        style={[
          TYPE.caption,
          { color: COLORS.mutedBrown, fontWeight: "600", marginBottom: SPACING.sm },
        ]}
      >
        {withCoords.length === 0
          ? t("discover.noneOnMap")
          : t("discover.shownOnMap", { count: withCoords.length, total: displayItems.length })}
      </Text>
    ) : null;

  const mapNode = (
    <DiscoverMap
      markers={markers}
      selectedIndex={selectedIndex}
      onMarkerPress={onMarkerPress}
      onRegionChange={onMapRegionChange}
      height={winHeight}
      t={t}
      center={locationLabel && coord ? coord : null}
    />
  );

  // ───────────────────────────────── body ─────────────────────────────────
  let body;
  if (isLoading) {
    body = (
      <View testID="discover-loading" style={{ paddingVertical: 48, alignItems: "center" }}>
        <ActivityIndicator color={COLORS.coral} />
      </View>
    );
  } else if (isError) {
    body = <ErrorState onRetry={refetch} t={t} />;
  } else if (!hasItems) {
    body = (
      <EmptyState
        testID="discover-empty"
        title={t("discover.emptyTitle")}
        body={t("discover.emptyBody")}
      />
    );
  } else if (layout === "split") {
    // Wide: list left, map right.
    body = (
      <View testID="discover-split" style={{ flex: 1, flexDirection: "row" }}>
        <View style={{ flex: 1, borderRightWidth: 1, borderColor: MATERIALS.glassBorder }}>
          <RefreshableScrollView
            refetch={refetch}
            contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 80 }}
          >
            {deniedBanner}
            {filterBar}
            {searchAndSort}
            {offMapNote}
            {results}
          </RefreshableScrollView>
        </View>
        <View style={{ flex: 1 }}>{mapNode}</View>
      </View>
    );
  } else if (layout === "map") {
    // Narrow iOS map mode: full-screen map + a SLIM pinned overlay + draggable sheet list. The
    // overlay is just the toggle + filter bar + off-map note, so it covers only a thin top strip.
    body = (
      <View style={{ flex: 1 }}>
        {mapNode}
        <View
          testID="discover-map-overlay"
          pointerEvents="box-none"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            paddingTop: SPACING.sm,
            paddingHorizontal: SPACING.lg,
          }}
        >
          {toggle}
          {filterBar}
          {offMapNote}
        </View>
        <BottomSheet ref={sheetRef} index={0} snapPoints={snapPoints}>
          <BottomSheetScrollView
            contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 60 }}
          >
            {searchAndSort}
            {results}
          </BottomSheetScrollView>
        </BottomSheet>
      </View>
    );
  } else {
    // Narrow list mode (default; also the only mode on Android / web-narrow).
    body = (
      <RefreshableScrollView
        refetch={refetch}
        contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 80 }}
      >
        {deniedBanner}
        {toggle}
        {filterBar}
        {searchAndSort}
        {results}
      </RefreshableScrollView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
      {showHeader ? (
        <GlassSurface
          intensity={BLUR.thick}
          style={{ borderBottomWidth: 1, borderColor: MATERIALS.glassBorder }}
          contentStyle={{
            paddingTop: insets.top,
            paddingHorizontal: SPACING.xl,
            paddingBottom: SPACING.md + 2,
            flexDirection: "row",
            alignItems: "center",
          }}
        >
          {isLanding ? null : (
            <PressableScale
              onPress={() => router.back()}
              accessibilityLabel={t("common.back")}
              style={{ marginRight: SPACING.md + 2 }}
            >
              <ArrowLeft size={22} color={COLORS.warmBrown} />
            </PressableScale>
          )}
          <View style={{ flex: 1 }}>
            <Text style={[TYPE.title, { color: COLORS.warmBrown }]}>
              {isLanding ? t("tabs.services") : t("discover.title")}
            </Text>
            <Text style={[TYPE.footnote, { color: COLORS.mutedBrown, marginTop: 1 }]}>
              {t("discover.subtitle")}
            </Text>
          </View>
        </GlassSurface>
      ) : null}

      {body}

      {/* Category picker: MULTI-SELECT. Options are COMPACT wrapped pills (many visible at once). "All"
          is a distinct pill at top that clears the selection; the Services + Places groups are
          collapsible (with a per-group selected count). Toggling a pill keeps the picker open. */}
      <PickerModal
        visible={catPickerOpen}
        testID="discover-category-picker"
        title={t("discover.categoryPickerTitle")}
        onClose={() => setCatPickerOpen(false)}
        insets={insets}
      >
        <View style={PILL_WRAP}>
          <CategoryPill
            testID="discover-catopt-all"
            label={t("discover.cat.all")}
            selected={selectedCats.length === 0}
            onPress={clearCategories}
          />
        </View>
        <GroupHeader
          testID="discover-catgroup-services"
          label={t("discover.groupServices")}
          count={servicesSelectedCount}
          expanded={servicesExpanded}
          onPress={() => setServicesExpanded((v) => !v)}
        />
        {servicesExpanded ? (
          <View style={PILL_WRAP}>
            {SERVICE_CATEGORIES.map((c) => (
              <CategoryPill
                key={c.key}
                testID={`discover-catopt-${c.key}`}
                label={t(c.labelKey)}
                selected={selectedCats.includes(c.key)}
                onPress={() => toggleCategory(c.key)}
              />
            ))}
          </View>
        ) : null}
        <GroupHeader
          testID="discover-catgroup-places"
          label={t("discover.groupPlaces")}
          count={placesSelectedCount}
          expanded={placesExpanded}
          onPress={() => setPlacesExpanded((v) => !v)}
        />
        {placesExpanded ? (
          <View style={PILL_WRAP}>
            {PLACE_CATEGORIES.map((c) => (
              <CategoryPill
                key={c.key}
                testID={`discover-catopt-${c.key}`}
                label={t(c.labelKey)}
                selected={selectedCats.includes(c.key)}
                onPress={() => toggleCategory(c.key)}
              />
            ))}
          </View>
        ) : null}
      </PickerModal>

      {/* Area picker: free-text location search + All areas + Search near me (no enumerated
          neighborhoods — they don't scale as the catalog grows). */}
      <PickerModal
        visible={areaPickerOpen}
        testID="discover-area-picker"
        title={t("discover.areaPickerTitle")}
        onClose={() => setAreaPickerOpen(false)}
        insets={insets}
      >
        {/* Free-text location search (geocoded via Nominatim on submit). */}
        <Text
          style={[
            TYPE.caption,
            {
              color: COLORS.mutedBrown,
              fontWeight: "800",
              textTransform: "uppercase",
              letterSpacing: 0.4,
              marginBottom: SPACING.xs,
              paddingHorizontal: SPACING.xs,
            },
          ]}
        >
          {t("discover.searchLocation")}
        </Text>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: SPACING.sm,
            backgroundColor: COLORS.card,
            borderRadius: 14,
            borderWidth: 1.5,
            borderColor: COLORS.peach,
            paddingHorizontal: SPACING.md,
            marginBottom: SPACING.sm,
          }}
        >
          <MapPin size={16} color={COLORS.mutedBrown} />
          <TextInput
            testID="discover-location-input"
            value={locationQuery}
            onChangeText={(v) => {
              setLocationQuery(v);
              if (locationNotFound) setLocationNotFound(false);
            }}
            onSubmitEditing={onSubmitLocation}
            placeholder={t("discover.searchLocationPlaceholder")}
            placeholderTextColor={COLORS.mutedBrown}
            autoCorrect={false}
            returnKeyType="search"
            editable={!geocoding}
            style={[TYPE.subhead, { flex: 1, color: COLORS.warmBrown, paddingVertical: 12 }]}
          />
          {geocoding ? <ActivityIndicator size="small" color={COLORS.coral} /> : null}
        </View>
        {locationNotFound ? (
          <Text
            testID="discover-location-notfound"
            style={[
              TYPE.footnote,
              { color: COLORS.coral, fontWeight: "600", marginBottom: SPACING.sm, paddingHorizontal: SPACING.xs },
            ]}
          >
            {t("discover.locationNotFound")}
          </Text>
        ) : null}

        <PickerOption
          testID="discover-areaopt-all"
          label={t("discover.allAreas")}
          selected={!nearMe && locationLabel == null}
          onPress={onSelectAllAreas}
        />
        <PickerOption
          testID="discover-areaopt-near"
          label={t("discover.searchNearMe")}
          selected={nearMe}
          icon={Navigation}
          onPress={onSelectNearMe}
        />
      </PickerModal>
    </View>
  );
}

// A compact filter button that opens a picker. Highlighted coral when a non-default value is set.
// When `onClear` is given and the button is active, the trailing chevron becomes a ✕ that clears the
// filter directly (a quick escape without opening the picker).
function FilterButton({ testID, label, active, onPress, onClear, clearLabel, accessibilityLabel }) {
  const showClear = active && onClear;
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: active }}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingHorizontal: SPACING.md,
        paddingVertical: SPACING.sm,
        borderRadius: RADIUS.chip,
        borderWidth: 1,
        borderColor: active ? COLORS.coral : COLORS.peach,
        backgroundColor: active ? COLORS.coral : COLORS.card,
      }}
    >
      <Text
        style={[
          TYPE.footnote,
          { fontWeight: "700", color: active ? "#fff" : COLORS.warmBrown },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
      {showClear ? (
        <TouchableOpacity
          testID={`${testID}-clear`}
          onPress={onClear}
          accessibilityRole="button"
          accessibilityLabel={clearLabel}
          hitSlop={8}
        >
          <X size={14} color="#fff" />
        </TouchableOpacity>
      ) : (
        <ChevronDown size={14} color={active ? "#fff" : COLORS.mutedBrown} />
      )}
    </PressableScale>
  );
}

// A collapsible group header inside the category picker: label + selected-count + expand/collapse
// chevron. Tapping toggles the group's option list.
function GroupHeader({ testID, label, count, expanded, onPress }) {
  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: SPACING.xs,
        marginTop: SPACING.sm,
        marginBottom: SPACING.xs,
        paddingHorizontal: SPACING.xs,
      }}
    >
      <Text
        style={[
          TYPE.caption,
          {
            color: COLORS.mutedBrown,
            fontWeight: "800",
            textTransform: "uppercase",
            letterSpacing: 0.4,
          },
        ]}
      >
        {label}
      </Text>
      {count > 0 ? (
        <Text
          testID={`${testID}-count`}
          style={[TYPE.caption, { color: COLORS.coral, fontWeight: "800" }]}
        >
          {`(${count})`}
        </Text>
      ) : null}
      <View style={{ flex: 1 }} />
      {expanded ? (
        <ChevronUp size={16} color={COLORS.mutedBrown} />
      ) : (
        <ChevronDown size={16} color={COLORS.mutedBrown} />
      )}
    </TouchableOpacity>
  );
}

// Bottom-sheet picker container (RN Modal + dim backdrop + handle + title + scrollable options),
// matching the app's existing PetPickerSheet anatomy.
function PickerModal({ visible, testID, title, onClose, insets, children }) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <TouchableOpacity
          testID={testID ? `${testID}-backdrop` : undefined}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(59,36,27,0.45)",
          }}
          activeOpacity={1}
          onPress={onClose}
        />
        <View
          testID={testID}
          style={{
            backgroundColor: COLORS.cream,
            borderTopLeftRadius: 30,
            borderTopRightRadius: 30,
            maxHeight: "80%",
            paddingBottom: (insets?.bottom ?? 0) + 8,
          }}
        >
          <View style={{ alignItems: "center", paddingTop: 12, paddingBottom: 2 }}>
            <View style={{ width: 38, height: 4, borderRadius: 2, backgroundColor: COLORS.peach }} />
          </View>
          <Text
            style={{
              fontSize: 18,
              fontWeight: "800",
              color: COLORS.warmBrown,
              textAlign: "center",
              paddingVertical: 12,
            }}
          >
            {title}
          </Text>
          <ScrollView
            style={{ paddingHorizontal: 16 }}
            contentContainerStyle={{ paddingBottom: 8 }}
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// One selectable row in a picker: label (+ optional leading icon) and a Check when selected.
function PickerOption({ testID, label, selected, onPress, icon: Icon }) {
  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        padding: 14,
        borderRadius: 16,
        marginBottom: 8,
        backgroundColor: COLORS.card,
        borderWidth: 1.5,
        borderColor: selected ? COLORS.coral : COLORS.peach,
      }}
    >
      {Icon ? <Icon size={18} color={COLORS.coral} /> : null}
      <Text
        style={{
          flex: 1,
          fontSize: 15,
          fontWeight: "700",
          color: selected ? COLORS.warmBrown : COLORS.mutedBrown,
        }}
      >
        {label}
      </Text>
      {selected ? <Check size={20} color={COLORS.coral} /> : null}
    </TouchableOpacity>
  );
}

// Row of category pills wraps to as many lines as needed so many categories are visible at once.
const PILL_WRAP = {
  flexDirection: "row",
  flexWrap: "wrap",
  gap: SPACING.sm,
  marginBottom: SPACING.xs,
};

// A COMPACT, content-sized category chip for the category picker's wrapped grid (multi-select).
// Selected → coral border + tint + Check; otherwise a quiet peach outline.
function CategoryPill({ testID, label, selected, onPress }) {
  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: SPACING.md,
        paddingVertical: SPACING.sm,
        borderRadius: RADIUS.chip,
        borderWidth: 1.5,
        borderColor: selected ? COLORS.coral : COLORS.peach,
        backgroundColor: selected ? COLORS.coral + "18" : COLORS.card,
      }}
    >
      <Text
        style={[
          TYPE.footnote,
          { fontWeight: "700", color: selected ? COLORS.coral : COLORS.mutedBrown },
        ]}
      >
        {label}
      </Text>
      {selected ? <Check size={14} color={COLORS.coral} /> : null}
    </TouchableOpacity>
  );
}

// iOS → the real Apple map; everywhere else → a clean placeholder (no key/engine), never a
// blank/gray map or crash.
function DiscoverMap({ markers, selectedIndex, onMarkerPress, onRegionChange, height, t, center }) {
  if (!isMapEngineOk()) {
    return (
      <Card
        testID="discover-map-placeholder"
        level="none"
        borderColor={COLORS.peach}
        style={{
          flex: 1,
          minHeight: 200,
          margin: SPACING.lg,
          padding: SPACING.xxl,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <MapIcon size={30} color={COLORS.mutedBrown} />
        <Text
          style={[
            TYPE.headline,
            { color: COLORS.warmBrown, fontWeight: "800", marginTop: SPACING.md },
          ]}
        >
          {t("discover.mapComingSoonTitle")}
        </Text>
        <Text
          style={[
            TYPE.subhead,
            {
              color: COLORS.mutedBrown,
              fontWeight: "500",
              marginTop: SPACING.xs,
              textAlign: "center",
            },
          ]}
        >
          {t("discover.mapComingSoonBody")}
        </Text>
      </Card>
    );
  }
  return (
    <MapLocationView
      testID="discover-map"
      points={markers}
      selectedIndex={selectedIndex}
      onMarkerPress={onMarkerPress}
      onRegionChange={onRegionChange}
      interactive
      height={height}
      center={center}
    />
  );
}


// One unified result — a PROVIDER or a PLACE. Cards show name, category/capabilities, rating
// (RatingBadge) and distance. Providers show their capability chips; places show a single category
// chip. logo/photo are not in the unified projection, so a typed icon placeholder is shown.
function ResultCard({ item, onPress, t, selected }) {
  const isPlace = item.type === "place";
  const caps = Array.isArray(item.capabilities) ? item.capabilities : [];
  const km = formatKm(item.distance_km);
  return (
    <PressableScale
      testID={`discover-card-${item.id}`}
      onPress={onPress}
      accessibilityState={{ selected: !!selected }}
      style={{ marginBottom: SPACING.md + 2 }}
    >
      <Card
        level="sm"
        borderColor={selected ? COLORS.coral : COLORS.peach}
        style={{
          padding: SPACING.lg,
          flexDirection: "row",
          alignItems: "center",
          gap: SPACING.md + 2,
          borderWidth: selected ? 2 : undefined,
        }}
      >
        {selected ? <View testID={`discover-card-${item.id}-selected`} /> : null}
        <View
          style={{
            width: 52,
            height: 52,
            borderRadius: RADIUS.control - 2,
            backgroundColor: COLORS.sand,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          {isPlace ? (
            <MapPin size={24} color={COLORS.coral} />
          ) : (
            <Store size={24} color={COLORS.coral} />
          )}
        </View>

        <View style={{ flex: 1 }}>
          <Text
            style={[TYPE.headline, { color: COLORS.warmBrown, fontWeight: "800" }]}
            numberOfLines={1}
          >
            {item.name}
          </Text>

          {/* Providers → capability chips; places → one category chip. */}
          {isPlace ? (
            item.category ? (
              <View
                style={{ flexDirection: "row", flexWrap: "wrap", gap: SPACING.xs, marginTop: SPACING.xs }}
              >
                <View
                  testID={`discover-placecat-${item.id}-${item.category}`}
                  style={{
                    paddingHorizontal: SPACING.sm,
                    paddingVertical: 2,
                    borderRadius: RADIUS.chip,
                    backgroundColor: COLORS.coral + "14",
                    borderWidth: 1,
                    borderColor: COLORS.peach,
                  }}
                >
                  <Text style={[TYPE.caption, { color: COLORS.coral, fontWeight: "700" }]}>
                    {t(`discover.placeCat.${item.category}`)}
                  </Text>
                </View>
              </View>
            ) : null
          ) : caps.length > 0 ? (
            <View
              style={{ flexDirection: "row", flexWrap: "wrap", gap: SPACING.xs, marginTop: SPACING.xs }}
            >
              {caps.map((c) => (
                <View
                  key={c}
                  testID={`discover-cap-${item.id}-${c}`}
                  style={{
                    paddingHorizontal: SPACING.sm,
                    paddingVertical: 2,
                    borderRadius: RADIUS.chip,
                    backgroundColor: COLORS.coral + "14",
                    borderWidth: 1,
                    borderColor: COLORS.peach,
                  }}
                >
                  <Text style={[TYPE.caption, { color: COLORS.coral, fontWeight: "700" }]}>
                    {t(`discover.cap.${c}`)}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: SPACING.md,
              marginTop: SPACING.xs,
            }}
          >
            <RatingBadge avgRating={item.avg_rating} reviewCount={item.review_count} />
            {km != null ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                <Navigation size={12} color={COLORS.mutedBrown} />
                <Text style={[TYPE.footnote, { color: COLORS.mutedBrown }]}>
                  {t("discover.distanceKm", { km })}
                </Text>
              </View>
            ) : null}
          </View>

          {item.address ? (
            <Text
              style={[
                TYPE.subhead,
                { color: COLORS.mutedBrown, fontWeight: "500", marginTop: SPACING.xs },
              ]}
              numberOfLines={1}
            >
              {item.address}
            </Text>
          ) : null}
        </View>

        <ChevronRight size={20} color={COLORS.mutedBrown} />
      </Card>
    </PressableScale>
  );
}

function EmptyState({ title, body, testID, action }) {
  return (
    <Card
      testID={testID}
      level="none"
      borderColor={COLORS.peach}
      style={{ padding: SPACING.xxl + SPACING.xs, alignItems: "center" }}
    >
      <Store size={32} color={COLORS.mutedBrown} />
      <Text
        style={[
          TYPE.headline,
          { color: COLORS.warmBrown, fontWeight: "800", marginTop: SPACING.md },
        ]}
      >
        {title}
      </Text>
      <Text
        style={[
          TYPE.subhead,
          {
            color: COLORS.mutedBrown,
            fontWeight: "500",
            marginTop: SPACING.xs + 2,
            textAlign: "center",
          },
        ]}
      >
        {body}
      </Text>
      {action ?? null}
    </Card>
  );
}

function ErrorState({ onRetry, t }) {
  return (
    <Card
      testID="discover-error"
      level="none"
      borderColor={COLORS.peach}
      style={{ padding: SPACING.xxl + SPACING.xs, alignItems: "center" }}
    >
      <Store size={32} color={COLORS.mutedBrown} />
      <Text
        style={[
          TYPE.headline,
          { color: COLORS.warmBrown, fontWeight: "800", marginTop: SPACING.md },
        ]}
      >
        {t("discover.loadErrorTitle")}
      </Text>
      <Text
        style={[
          TYPE.subhead,
          {
            color: COLORS.mutedBrown,
            fontWeight: "500",
            marginTop: SPACING.xs + 2,
            textAlign: "center",
          },
        ]}
      >
        {t("discover.loadErrorBody")}
      </Text>
      <PressableScale
        testID="discover-retry"
        onPress={onRetry}
        style={{
          marginTop: SPACING.md,
          paddingHorizontal: SPACING.lg,
          paddingVertical: SPACING.sm + 2,
          borderRadius: RADIUS.chip,
          backgroundColor: COLORS.coral,
        }}
      >
        <Text style={[TYPE.subhead, { color: "#fff", fontWeight: "800" }]}>
          {t("common.retry")}
        </Text>
      </PressableScale>
    </Card>
  );
}
