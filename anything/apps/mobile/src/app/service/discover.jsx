import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Image,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as Location from "expo-location";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  Store,
  ChevronRight,
  MapPin,
  Navigation,
} from "lucide-react-native";
import { COLORS } from "@/constants/colors";
import { TYPE, RADIUS, SPACING, MATERIALS, BLUR } from "@/constants/theme";
import { Card, PressableScale, GlassSurface } from "@/components/ui";
import { RefreshableScrollView } from "@/components/RefreshableScrollView";
import { useDiscoverProviders } from "@/hooks/useProviders";
import RatingBadge from "@/components/Providers/RatingBadge";
import ProviderListControls, {
  useProviderListFilter,
  PROVIDER_SORTS,
} from "@/components/Providers/ProviderListControls";
import { deriveOpenNow } from "@/utils/providerHours";
import { isValidCoord } from "@/utils/walkBuddies";

// Unified Services discovery (Services Hub P2). ONE merged, deduped list of PUBLISHED
// providers across capabilities — a provider that does vet + grooming appears ONCE with
// both capability chips. Category / search / sort / open-now all run CLIENT-SIDE over the
// single P1 discover fetch (real data only, no mocks). Map + web split are P3; pet-friendly
// places are a later, self-sourced phase and are deliberately NOT wired here.
//
// Category → capability sets. "Veterinary" umbrella merges the old vet/grooming/telehealth
// silos (founder's IA). "shops" pairs shop + pharmacy. Room is left for a "places" category
// later; it is intentionally not added yet.
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

export default function DiscoverScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams();

  const initialCategory =
    typeof params.category === "string" &&
    CATEGORIES.some((c) => c.key === params.category)
      ? params.category
      : "all";

  const [category, setCategory] = useState(initialCategory);
  const [openNow, setOpenNow] = useState(false);
  const [coord, setCoord] = useState(null);
  const [denied, setDenied] = useState(false);

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
        if (
          active &&
          isValidCoord(pos?.coords?.latitude, pos?.coords?.longitude)
        ) {
          setCoord({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        }
      } catch {
        if (active) setDenied(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // ONE fetch of ALL published providers; when location is granted we pass lat/lng so the
  // P1 projection returns distance_km (enables Nearest + the distance line on cards).
  const { data: providers, isLoading, isError, refetch } = useDiscoverProviders(
    coord ? { lat: coord.lat, lng: coord.lng } : {},
  );

  const raw = useMemo(() => providers ?? [], [providers]);

  // Category + open-now filter BEFORE search/sort. Open-now is best-effort: a provider
  // whose hours are missing/unparseable (deriveOpenNow → null) is kept, never hidden.
  const preFiltered = useMemo(() => {
    let list = raw.filter((p) => categoryMatches(p, category));
    if (openNow) {
      list = list.filter((p) => deriveOpenNow(p?.hours_json) !== false);
    }
    return list;
  }, [raw, category, openNow]);

  const { query, setQuery, sort, setSort, filtered } =
    useProviderListFilter(preFiltered);

  // Nearest is only offered when we actually have the device location.
  const sorts = useMemo(
    () =>
      coord
        ? [...PROVIDER_SORTS, { key: "nearest", labelKey: "discover.sortNearest" }]
        : PROVIDER_SORTS,
    [coord],
  );

  const hasProviders = raw.length > 0;

  const openProvider = (slug) => {
    router.push({ pathname: "/service/provider", params: { slug } });
  };

  const clearFilters = () => {
    setCategory("all");
    setOpenNow(false);
    setQuery("");
    setSort("relevance");
  };

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
          <Text
            style={[TYPE.footnote, { color: COLORS.mutedBrown, marginTop: 1 }]}
          >
            {t("discover.subtitle")}
          </Text>
        </View>
      </GlassSurface>

      <RefreshableScrollView
        refetch={refetch}
        contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 80 }}
      >
        {isLoading ? (
          <View
            testID="discover-loading"
            style={{ paddingVertical: 48, alignItems: "center" }}
          >
            <ActivityIndicator color={COLORS.coral} />
          </View>
        ) : isError ? (
          <ErrorState onRetry={refetch} t={t} />
        ) : !hasProviders ? (
          <EmptyState
            testID="discover-empty"
            title={t("discover.emptyTitle")}
            body={t("discover.emptyBody")}
          />
        ) : (
          <>
            {denied ? (
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
                <Text
                  style={[
                    TYPE.footnote,
                    { color: COLORS.mutedBrown, flex: 1, fontWeight: "500" },
                  ]}
                >
                  {t("places.locationDenied")}
                </Text>
              </Card>
            ) : null}

            {/* Category chips */}
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
                        {
                          fontWeight: "700",
                          color: selected ? "#fff" : COLORS.warmBrown,
                        },
                      ]}
                    >
                      {t(`discover.cat.${c.key}`)}
                    </Text>
                  </PressableScale>
                );
              })}
            </ScrollView>

            {/* Search + sort (shared control) */}
            <ProviderListControls
              query={query}
              setQuery={setQuery}
              sort={sort}
              setSort={setSort}
              sorts={sorts}
              placeholder={t("discover.searchPlaceholder")}
            />

            {/* Open-now toggle */}
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
                    {
                      fontWeight: "700",
                      color: openNow ? COLORS.coral : COLORS.mutedBrown,
                    },
                  ]}
                >
                  {t("discover.openNow")}
                </Text>
              </PressableScale>
            </View>

            {filtered.length === 0 ? (
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
                    <Text
                      style={[TYPE.subhead, { color: "#fff", fontWeight: "800" }]}
                    >
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
                  onPress={() => openProvider(p.slug)}
                />
              ))
            )}
          </>
        )}
      </RefreshableScrollView>
    </View>
  );
}

function ResultCard({ provider, onPress, t }) {
  const caps = Array.isArray(provider.capabilities) ? provider.capabilities : [];
  const km = formatKm(provider.distance_km);
  return (
    <PressableScale
      testID={`discover-card-${provider.id}`}
      onPress={onPress}
      style={{ marginBottom: SPACING.md + 2 }}
    >
      <Card
        level="sm"
        borderColor={COLORS.peach}
        style={{
          padding: SPACING.lg,
          flexDirection: "row",
          alignItems: "center",
          gap: SPACING.md + 2,
        }}
      >
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

          {/* Capability chips — a merged provider shows all its capabilities. */}
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
                  <Text
                    style={[
                      TYPE.caption,
                      { color: COLORS.coral, fontWeight: "700" },
                    ]}
                  >
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
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 3 }}
              >
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
