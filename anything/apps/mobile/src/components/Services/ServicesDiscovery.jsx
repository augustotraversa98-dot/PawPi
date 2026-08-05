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
// This body backs BOTH the Services TAB LANDING (variant "landing" — a tab root, no back
// arrow) and the pushed /service/discover screen (variant "screen" — with a back arrow).
//
// MAP ENGINE: iOS uses Apple Maps (react-native-maps PROVIDER_DEFAULT — free, no key).
// Android has no Google Maps key configured and web maps aren't wired, so the map DEGRADES
// to a clean "coming soon" placeholder there (never a blank/gray map or a crash) and the
// narrow list⇄map toggle is hidden — the list is always fully usable. See DiscoverMap.

// One chip per service type: the "all" chip shows everything, each other chip filters
// provider.capabilities to that service. labelKey reuses the existing discover.cap.* /
// discover.cat.all catalog (no new strings). categoryMatches drives BOTH the list and the
// map markers, so a chip filters the pins and the cards together.
const CATEGORIES = [
  { key: "all", capabilities: null, labelKey: "discover.cat.all" },
  { key: "vet", capabilities: ["vet"], labelKey: "discover.cap.vet" },
  { key: "telehealth", capabilities: ["telehealth"], labelKey: "discover.cap.telehealth" },
  { key: "groomer", capabilities: ["groomer"], labelKey: "discover.cap.groomer" },
  { key: "walker", capabilities: ["walker"], labelKey: "discover.cap.walker" },
  { key: "daycare", capabilities: ["daycare"], labelKey: "discover.cap.daycare" },
  { key: "sitter", capabilities: ["sitter"], labelKey: "discover.cap.sitter" },
  { key: "trainer", capabilities: ["trainer"], labelKey: "discover.cap.trainer" },
  { key: "shop", capabilities: ["shop", "pharmacy"], labelKey: "discover.cap.shop" },
  { key: "adoption", capabilities: ["adoption"], labelKey: "discover.cap.adoption" },
  { key: "transport", capabilities: ["transport"], labelKey: "discover.cap.transport" },
  { key: "insurance", capabilities: ["insurance"], labelKey: "discover.cap.insurance" },
];

// Backward-compat for the old grouped chip keys still used in deep links (e.g. the retired
// grid pushed ?category=veterinary / ?category=shops). Resolve → the closest single-service
// chip; anything unrecognized falls back to "all".
const CATEGORY_ALIASES = { veterinary: "vet", shops: "shop" };

function resolveInitialCategory(raw) {
  if (typeof raw === "string") {
    if (CATEGORIES.some((c) => c.key === raw)) return raw;
    if (CATEGORY_ALIASES[raw]) return CATEGORY_ALIASES[raw];
  }
  return "all";
}

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

// Interim routing bridge (storefront parity for these is deferred to P6). The storefront
// (/service/provider) fully serves bookable + shop providers today, so it WINS for any
// provider that has one of these — including mixed providers.
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
// Types the storefront can't serve yet open their existing, working legacy screen instead
// of dead-ending. Adoption's screen reads a providerId; insurance/transport take no param.
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

  const { data: providers, isLoading, isError, refetch } = useDiscoverProviders(
    coord ? { lat: coord.lat, lng: coord.lng } : {},
  );

  const raw = useMemo(() => providers ?? [], [providers]);

  const preFiltered = useMemo(() => {
    let list = raw.filter((p) => categoryMatches(p, category));
    if (openNow) list = list.filter((p) => deriveOpenNow(p?.hours_json) !== false);
    return list;
  }, [raw, category, openNow]);

  // Broaden search to the SERVICE TYPE too: append each capability slug plus its localized
  // label so typing "vet" / "veterinaria" or "grooming" / "peluquería" matches a provider
  // whose name/bio doesn't contain the word. Name/bio/provider_type matching is unchanged.
  const extraText = useCallback(
    (p) => [
      ...(Array.isArray(p.capabilities) ? p.capabilities : []),
      ...(Array.isArray(p.capabilities)
        ? p.capabilities.map((c) => t(`discover.cap.${c}`))
        : []),
    ],
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
    const caps = Array.isArray(p.capabilities) ? p.capabilities : [];
    // Storefront serves bookable + shop providers today and wins for mixed providers. Only
    // when a provider has NONE of those do we consider the interim legacy bridge.
    if (!caps.some((c) => STOREFRONT_CAPS.includes(c))) {
      const bridgeCap = caps.find((c) => LEGACY_BRIDGE[c]);
      if (bridgeCap) {
        router.push(
          bridgeCap === "adoption"
            ? { pathname: LEGACY_BRIDGE.adoption, params: { providerId: p.id } }
            : { pathname: LEGACY_BRIDGE[bridgeCap] },
        );
        return;
      }
    }
    // Storefront (default + fallback for unknown/absent caps).
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
              {t(c.labelKey)}
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

  // Landing = the Services TAB ROOT: no back arrow, title is the tab name. Screen = the
  // pushed /service/discover: back arrow + Discover title. When showHeader is false the
  // parent (the Services tab shell with its [Discover | My Activity] toggle) owns the top
  // chrome, so we suppress this internal header AND its Activity icon entirely — the chips,
  // search and list/map render directly under the parent's header.
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
