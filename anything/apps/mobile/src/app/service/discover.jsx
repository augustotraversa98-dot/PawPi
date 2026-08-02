import React, { useEffect, useMemo, useRef, useState } from "react";
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
import { useRouter, useLocalSearchParams } from "expo-router";
import * as Location from "expo-location";
import { useTranslation } from "react-i18next";
import BottomSheet, { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import {
  ArrowLeft,
  Store,
  ChevronRight,
  MapPin,
  Navigation,
  Map as MapIcon,
  List as ListIcon,
} from "lucide-react-native";
import { COLORS } from "@/constants/colors";
import { TYPE, RADIUS, SPACING, MATERIALS, BLUR } from "@/constants/theme";
import { Card, PressableScale, GlassSurface } from "@/components/ui";
import { RefreshableScrollView } from "@/components/RefreshableScrollView";
import MapLocationView from "@/components/Map/MapLocationView";
import { useDiscoverProviders } from "@/hooks/useProviders";
import { useIsWideScreen } from "@/hooks/useIsWideScreen";
import RatingBadge from "@/components/Providers/RatingBadge";
import ProviderListControls, {
  useProviderListFilter,
  PROVIDER_SORTS,
} from "@/components/Providers/ProviderListControls";
import { deriveOpenNow } from "@/utils/providerHours";

// Unified Services discovery (Services Hub P2 + P3). ONE merged, deduped list of PUBLISHED
// providers across capabilities, now with a MAP:
//   • mobile (narrow): full-screen map + a draggable bottom-sheet list + a list⇄map toggle,
//     with the category chips pinned over the map;
//   • wide screens (web / iPad): a true side-by-side split (list left, map right);
//   • two-way pin↔card highlight.
// Category / search / sort / open-now (P2) keep working in every mode. Pet-friendly places
// are still deferred (self-sourced, later); the storefront is P4.
//
// MAP ENGINE: iOS uses Apple Maps (react-native-maps PROVIDER_DEFAULT — free, no key).
// Android has no Google Maps key configured and web maps aren't wired, so the map DEGRADES
// to a clean "coming soon" placeholder there (never a blank/gray map or a crash) and the
// narrow list⇄map toggle is hidden — the list is always fully usable. See DiscoverMap.

const CATEGORIES = [
  { key: "all", capabilities: null },
  { key: "veterinary", capabilities: ["vet", "groomer", "telehealth"] },
  { key: "shops", capabilities: ["shop", "pharmacy"] },
];

function categoryMatches(provider, category) {
  const def = CATEGORIES.find((c) => c.key === category) ?? CATEGORIES[0];
  if (!def.capabilities) return true; // "all"
  const caps = Array.isArray(provider?.capabilities) ? provider.capabilities : [];
  return caps.some((c) => def.capabilities.includes(c));
}

function formatKm(km) {
  if (km == null) return null;
  return km < 10 ? km.toFixed(1) : String(Math.round(km));
}

// Coords come back from the P1 projection as numeric(9,6) — porsager surfaces them as
// strings, so coerce and validate before mapping. A provider without a location has null.
function hasCoords(p) {
  const lat = Number(p?.lat);
  const lng = Number(p?.lng);
  return (
    p?.lat != null &&
    p?.lng != null &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}

// Only iOS has a working, keyless map engine today (Apple Maps). Android has no Google
// Maps key and web maps aren't wired → placeholder. A function (not a module const) so the
// platform is read at render time.
const isMapEngineOk = () => Platform.OS === "ios";

export default function DiscoverScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams();
  const { height: winHeight } = useWindowDimensions();
  const isWide = useIsWideScreen();

  const initialCategory =
    typeof params.category === "string" &&
    CATEGORIES.some((c) => c.key === params.category)
      ? params.category
      : "all";

  const [category, setCategory] = useState(initialCategory);
  const [openNow, setOpenNow] = useState(false);
  const [coord, setCoord] = useState(null);
  const [denied, setDenied] = useState(false);
  const [mode, setMode] = useState("list"); // narrow-screen toggle: "list" | "map"
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

  const { data: providers, isLoading, isError, refetch } = useDiscoverProviders(
    coord ? { lat: coord.lat, lng: coord.lng } : {},
  );

  const raw = useMemo(() => providers ?? [], [providers]);

  const preFiltered = useMemo(() => {
    let list = raw.filter((p) => categoryMatches(p, category));
    if (openNow) list = list.filter((p) => deriveOpenNow(p?.hours_json) !== false);
    return list;
  }, [raw, category, openNow]);

  const { query, setQuery, sort, setSort, filtered } =
    useProviderListFilter(preFiltered);

  const sorts = useMemo(
    () =>
      coord
        ? [...PROVIDER_SORTS, { key: "nearest", labelKey: "discover.sortNearest" }]
        : PROVIDER_SORTS,
    [coord],
  );

  // Map data: only the filtered providers that actually have a location.
  const withCoords = useMemo(() => filtered.filter(hasCoords), [filtered]);
  const markers = useMemo(
    () =>
      withCoords.map((p) => ({
        lat: Number(p.lat),
        lng: Number(p.lng),
        id: p.id,
        title: p.name,
      })),
    [withCoords],
  );
  const selectedIndex = useMemo(
    () => withCoords.findIndex((p) => p.id === selectedId),
    [withCoords, selectedId],
  );

  const mapEngineOk = isMapEngineOk();
  const showToggle = !isWide && mapEngineOk;
  const layout = isWide ? "split" : mode === "map" && mapEngineOk ? "map" : "list";

  const hasProviders = raw.length > 0;

  const openProvider = (p) => {
    setSelectedId(p.id); // selecting a card highlights its pin
    router.push({ pathname: "/service/provider", params: { slug: p.slug } });
  };

  const onMarkerPress = (_i, point) => {
    setSelectedId(point.id); // tapping a pin highlights its card
    sheetRef.current?.snapToIndex?.(1); // bring the sheet up so the card is visible
  };

  const clearFilters = () => {
    setCategory("all");
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

  const categoryChips = (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginBottom: SPACING.md }}
      contentContainerStyle={{ gap: SPACING.sm }}
    >
      {CATEGORIES.map((c) => {
        const selected = category === c.key;
        return (
          <PressableScale
            key={c.key}
            testID={`discover-cat-${c.key}`}
            onPress={() => setCategory(c.key)}
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
              {t(`discover.cat.${c.key}`)}
            </Text>
          </PressableScale>
        );
      })}
    </ScrollView>
  );

  const searchAndSort = (
    <>
      <ProviderListControls
        query={query}
        setQuery={setQuery}
        sort={sort}
        setSort={setSort}
        sorts={sorts}
        placeholder={t("discover.searchPlaceholder")}
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
      filtered.map((p) => (
        <ResultCard
          key={p.id}
          provider={p}
          t={t}
          selected={p.id === selectedId}
          onPress={() => openProvider(p)}
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
  } else if (!hasProviders) {
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
        {searchAndSort}
        {results}
      </RefreshableScrollView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
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
        <PressableScale
          onPress={() => router.back()}
          accessibilityLabel={t("common.back")}
          style={{ marginRight: SPACING.md + 2 }}
        >
          <ArrowLeft size={22} color={COLORS.warmBrown} />
        </PressableScale>
        <View style={{ flex: 1 }}>
          <Text style={[TYPE.title, { color: COLORS.warmBrown }]}>
            {t("discover.title")}
          </Text>
          <Text style={[TYPE.footnote, { color: COLORS.mutedBrown, marginTop: 1 }]}>
            {t("discover.subtitle")}
          </Text>
        </View>
      </GlassSurface>

      {body}
    </View>
  );
}

// iOS → the real Apple map; everywhere else → a clean placeholder (no key/engine), never a
// blank/gray map or crash. Kept out of the main component so the react-native-maps import
// is only exercised where it renders.
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

function ResultCard({ provider, onPress, t, selected }) {
  const caps = Array.isArray(provider.capabilities) ? provider.capabilities : [];
  const km = formatKm(provider.distance_km);
  return (
    <PressableScale
      testID={`discover-card-${provider.id}`}
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
        {/* Selected marker for the pin↔card two-way highlight (also a test hook). */}
        {selected ? (
          <View testID={`discover-card-${provider.id}-selected`} />
        ) : null}
        {provider.logo_url ? (
          <Image
            source={{ uri: provider.logo_url }}
            style={{
              width: 52,
              height: 52,
              borderRadius: RADIUS.control - 2,
              backgroundColor: COLORS.sand,
            }}
          />
        ) : (
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
            <Store size={24} color={COLORS.coral} />
          </View>
        )}

        <View style={{ flex: 1 }}>
          <Text
            style={[TYPE.headline, { color: COLORS.warmBrown, fontWeight: "800" }]}
            numberOfLines={1}
          >
            {provider.name}
          </Text>

          {caps.length > 0 ? (
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: SPACING.xs,
                marginTop: SPACING.xs,
              }}
            >
              {caps.map((c) => (
                <View
                  key={c}
                  testID={`discover-cap-${provider.id}-${c}`}
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
            <RatingBadge
              avgRating={provider.avg_rating}
              reviewCount={provider.review_count}
            />
            {km != null ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                <Navigation size={12} color={COLORS.mutedBrown} />
                <Text style={[TYPE.footnote, { color: COLORS.mutedBrown }]}>
                  {t("discover.distanceKm", { km })}
                </Text>
              </View>
            ) : null}
          </View>

          {provider.bio ? (
            <Text
              style={[
                TYPE.subhead,
                { color: COLORS.mutedBrown, fontWeight: "500", marginTop: SPACING.xs },
              ]}
              numberOfLines={2}
            >
              {provider.bio}
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
