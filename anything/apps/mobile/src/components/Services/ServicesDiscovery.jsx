import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Image,
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
import {
  SERVICE_CATEGORIES,
  PLACE_CATEGORIES,
  PROVIDER_CATEGORY_KEYS,
  PLACE_CATEGORY_KEYS,
  resolveInitialCategory,
} from "@/constants/servicesCategories";

// UNIFIED Services discovery (Services Hub P2 + P3, now merged over providers + pet-friendly PLACES).
// ONE search / filter / list / map over the unified /api/services/discover feed:
//   • mobile (narrow): full-screen map + a draggable bottom-sheet list + a list⇄map toggle,
//     with the category chips pinned over the map;
//   • wide screens (web / iPad): a true side-by-side split (list left, map right);
//   • two-way pin↔card highlight.
//
// Category (unified taxonomy) + neighborhood are SERVER-side filters (passed to the API); search (q),
// the sorts (rating / reviews / nearest) and open-now stay CLIENT-side over the fetched items so
// type-ahead + service-type matching keep working. open-now applies to PROVIDERS only — places have
// no hours, so they are always included.
//
// This body backs BOTH the Services TAB LANDING (variant "landing" — a tab root, no back arrow) and
// the pushed /service/discover screen (variant "screen" — with a back arrow).
//
// MAP ENGINE: iOS uses Apple Maps (react-native-maps PROVIDER_DEFAULT — free, no key). Android has no
// Google Maps key and web maps aren't wired, so the map DEGRADES to a clean "coming soon" placeholder
// there (never a blank/gray map or a crash) and the narrow list⇄map toggle is hidden. See DiscoverMap.

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

  const [category, setCategory] = useState(() =>
    resolveInitialCategory(initialCategory),
  );
  const [neighborhood, setNeighborhood] = useState(null);
  const [openNow, setOpenNow] = useState(false);
  const [coord, setCoord] = useState(null);
  const [denied, setDenied] = useState(false);
  const [mode, setMode] = useState("list"); // narrow-screen toggle: "list" | "map" (list default)
  const [selectedId, setSelectedId] = useState(null);
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

  // Category + neighborhood are SERVER-side (passed to the API); the returned items are already
  // scoped to the right source(s). lat/lng attach distance_km + nearest-first ordering.
  const { data: items, isLoading, isError, refetch } = useServicesDiscover({
    category,
    neighborhood,
    ...(coord ? { lat: coord.lat, lng: coord.lng } : {}),
  });

  const raw = useMemo(() => items ?? [], [items]);

  // open-now (client-side) hides only providers PROVEN closed; places (no hours) always stay.
  const preFiltered = useMemo(() => {
    if (!openNow) return raw;
    return raw.filter(
      (it) => it.type === "place" || deriveOpenNow(it?.hours_json) !== false,
    );
  }, [raw, openNow]);

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

  // Neighborhood options accumulate across loads (a server-side neighborhood filter shrinks the
  // returned set, so we remember every place-neighborhood ever seen to keep the selector stable +
  // clearable). Only shown for "all" or a place category — neighborhoods don't apply to providers.
  const seenNeighborhoods = useRef(new Set());
  const neighborhoods = useMemo(() => {
    for (const it of raw) {
      if (it.type === "place" && it.neighborhood) {
        seenNeighborhoods.current.add(it.neighborhood);
      }
    }
    return Array.from(seenNeighborhoods.current).sort((a, b) => a.localeCompare(b));
  }, [raw]);
  const showNeighborhoods =
    (category === "all" || PLACE_CATEGORY_KEYS.has(category)) &&
    neighborhoods.length > 0;

  // Map data: only the filtered items that actually have a location (providers OR places).
  const withCoords = useMemo(() => filtered.filter(hasCoords), [filtered]);
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

  const mapEngineOk = isMapEngineOk();
  const showToggle = !isWide && mapEngineOk;
  const layout = isWide ? "split" : mode === "map" && mapEngineOk ? "map" : "list";

  const hasItems = raw.length > 0;

  const onSelectCategory = (key) => {
    setCategory(key);
    // A provider-only category can't be scoped by neighborhood — clear it so a stale area filter
    // never lingers (hidden) under a provider view.
    if (PROVIDER_CATEGORY_KEYS.has(key)) setNeighborhood(null);
    setSelectedId(null);
  };

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

  const onMarkerPress = (_i, point) => {
    setSelectedId(point.id); // tapping a pin highlights its card
    sheetRef.current?.snapToIndex?.(1); // bring the sheet up so the card is visible
  };

  const clearFilters = () => {
    setCategory("all");
    setNeighborhood(null);
    setOpenNow(false);
    setQuery("");
    setSort("relevance");
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
        marginBottom: SPACING.md,
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

  // Unified category chips: All, then the "Services" group (provider categories), then the "Places"
  // group (place categories). Group labels are inline non-interactive dividers.
  const categoryChips = (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginBottom: SPACING.md }}
      contentContainerStyle={{ gap: SPACING.sm, alignItems: "center" }}
    >
      <Chip
        testID="discover-cat-all"
        label={t("discover.cat.all")}
        selected={category === "all"}
        onPress={() => onSelectCategory("all")}
      />
      <GroupLabel text={t("discover.groupServices")} />
      {SERVICE_CATEGORIES.map((c) => (
        <Chip
          key={c.key}
          testID={`discover-cat-${c.key}`}
          label={t(c.labelKey)}
          selected={category === c.key}
          onPress={() => onSelectCategory(c.key)}
        />
      ))}
      <GroupLabel text={t("discover.groupPlaces")} />
      {PLACE_CATEGORIES.map((c) => (
        <Chip
          key={c.key}
          testID={`discover-cat-${c.key}`}
          label={t(c.labelKey)}
          selected={category === c.key}
          onPress={() => onSelectCategory(c.key)}
        />
      ))}
    </ScrollView>
  );

  // Lightweight "by area" filter — only for place-bearing views. Clearable via "All areas".
  const neighborhoodChips = showNeighborhoods ? (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginBottom: SPACING.md }}
      contentContainerStyle={{ gap: SPACING.sm, alignItems: "center" }}
    >
      <GroupLabel text={t("discover.byArea")} />
      <Chip
        testID="discover-area-all"
        label={t("discover.allAreas")}
        selected={neighborhood == null}
        onPress={() => setNeighborhood(null)}
      />
      {neighborhoods.map((n) => (
        <Chip
          key={n}
          testID={`discover-area-${n}`}
          label={n}
          selected={neighborhood === n}
          onPress={() => setNeighborhood(n)}
        />
      ))}
    </ScrollView>
  ) : null;

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
    filtered.length === 0 ? (
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
      filtered.map((it) => (
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
    filtered.length > 0 && withCoords.length < filtered.length ? (
      <Text
        testID="discover-offmap-note"
        style={[
          TYPE.caption,
          { color: COLORS.mutedBrown, fontWeight: "600", marginBottom: SPACING.sm },
        ]}
      >
        {withCoords.length === 0
          ? t("discover.noneOnMap")
          : t("discover.shownOnMap", { count: withCoords.length, total: filtered.length })}
      </Text>
    ) : null;

  const mapNode = (
    <DiscoverMap
      markers={markers}
      selectedIndex={selectedIndex}
      onMarkerPress={onMarkerPress}
      height={winHeight}
      t={t}
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
            {categoryChips}
            {neighborhoodChips}
            {searchAndSort}
            {offMapNote}
            {results}
          </RefreshableScrollView>
        </View>
        <View style={{ flex: 1 }}>{mapNode}</View>
      </View>
    );
  } else if (layout === "map") {
    // Narrow iOS map mode: full-screen map + pinned chips + draggable sheet list.
    body = (
      <View style={{ flex: 1 }}>
        {mapNode}
        <View
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
          {categoryChips}
          {neighborhoodChips}
          {offMapNote}
        </View>
        <BottomSheet ref={sheetRef} index={1} snapPoints={snapPoints}>
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
        {categoryChips}
        {neighborhoodChips}
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
    </View>
  );
}

// A category / area chip.
function Chip({ testID, label, selected, onPress }) {
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={{
        paddingHorizontal: SPACING.md + 2,
        paddingVertical: SPACING.sm,
        borderRadius: RADIUS.chip,
        backgroundColor: selected ? COLORS.coral : COLORS.card,
        borderWidth: 1,
        borderColor: COLORS.peach,
      }}
    >
      <Text
        style={[
          TYPE.subhead,
          { fontWeight: "700", color: selected ? "#fff" : COLORS.warmBrown },
        ]}
      >
        {label}
      </Text>
    </PressableScale>
  );
}

// Non-interactive group divider between the Services and Places chip sets.
function GroupLabel({ text }) {
  return (
    <Text
      style={[
        TYPE.caption,
        {
          color: COLORS.mutedBrown,
          fontWeight: "800",
          textTransform: "uppercase",
          letterSpacing: 0.4,
          paddingHorizontal: SPACING.xs,
        },
      ]}
    >
      {text}
    </Text>
  );
}

// iOS → the real Apple map; everywhere else → a clean placeholder (no key/engine), never a
// blank/gray map or crash.
function DiscoverMap({ markers, selectedIndex, onMarkerPress, height, t }) {
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
      interactive
      height={height}
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
