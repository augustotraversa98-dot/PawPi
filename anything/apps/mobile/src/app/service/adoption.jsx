import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Image,
  ActivityIndicator,
  Modal,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import * as Location from "expo-location";
import {
  ArrowLeft,
  PawPrint,
  Heart,
  X,
  Check,
  SlidersHorizontal,
  MapPin,
} from "lucide-react-native";
import { COLORS } from "@/constants/colors";
import { TYPE, RADIUS, SPACING, MATERIALS, BLUR } from "@/constants/theme";
import { Card, PressableScale, GlassSurface } from "@/components/ui";
import { RefreshableScrollView } from "@/components/RefreshableScrollView";
import {
  useDiscoverProviders,
  useAdoptableBrowse,
  useAdoptableListing,
  useMyAdoptionApplications,
  useAdoptionFavorites,
} from "@/hooks/useProviders";
import { isValidCoord } from "@/utils/walkBuddies";
// Shared adoption listing views (ticket 2.97) — the SAME card + detail/apply modal used by the
// business storefront's Adoption tab, so both surfaces render one design.
import {
  DogProfileCard,
  ListingDetailModal,
} from "@/components/adoption/AdoptionListingViews";

// ADOPTION (ticket 2.12) — REPLACES the old "Coming soon" Adoption signpost. The owner
// discovers adoption PLACES (shelters/rescues = providers with the 'adoption' capability),
// browses their adoptable DOGS rendered in the EXISTING dog-profile format (the same rich
// card shape the rest of the app uses for pets), FAVORITES a dog, APPLIES, CHATS with the
// shelter (reuses 2.5), and pays the adoption FEE / DONATES (reuses 2.3). On shelter approval
// the dog becomes the owner's own pet. Discovery is the SHARED
// /api/providers/discover?type=adoption (capability match, 2.1). Real data only; empty →
// empty states; NO fake listings. RLS (0038) is the real guard.
//
// Restyled to Liquid Glass (ticket N3, 2026-07-29) — visual/motion only, on top of the
// Wave 9 adoption-browse work (2.86/2.87: the grid card variant, age·size·gender row,
// distance label, "See more", the rich detail page). No behavior, data, hooks, test hooks, or
// copy changed.

const TAB_KEYS = ["browse", "favorites", "applications"];

export default function AdoptionScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const TAB_LABELS = {
    browse: t("adoption.tabBrowse"),
    favorites: t("adoption.tabFavorites"),
    applications: t("adoption.tabApplications"),
  };
  const params = useLocalSearchParams();
  // Deep-link into a specific tab (e.g. an adoption notification → "applications"). Defaults to
  // "browse" for any unknown/absent value.
  const [tab, setTab] = useState(
    ["browse", "favorites", "applications"].includes(params.tab)
      ? params.tab
      : "browse",
  );
  const [openListing, setOpenListing] = useState(null); // { listing, place }

  // Deep-link (ticket 2.30): an "Adopt me" feed/discovery card passes { listingId,
  // providerId }. Open THAT dog's detail on mount via the PUBLIC single-listing GET
  // (ticket 2.56) — a direct fetch that resolves the exact dog even when it isn't in
  // the currently-loaded browse list. The place identity rides in the listing payload
  // (provider_name/slug/logo); we still prefer the richer discovery place row when
  // it's already cached. A published+available dog opens; a gone/adopted/removed one
  // returns null (404) → a graceful "no longer available" notice, no crash. No param
  // → the normal hub. No param → the single fetch stays disabled.
  const deepListingId = params.listingId ? String(params.listingId) : null;
  const deepProviderId = params.providerId ? String(params.providerId) : null;
  // Shares the same query key as BrowseTab's discover (cached, no extra fetch).
  const { data: deepPlaces } = useDiscoverProviders("adoption");
  const { data: deepListing, isLoading: deepLoading, isFetched: deepFetched } =
    useAdoptableListing(deepProviderId, deepListingId);
  const [deepHandled, setDeepHandled] = useState(false);

  useEffect(() => {
    if (deepHandled || !deepListingId || !deepProviderId) return;
    if (deepLoading || !deepFetched) return; // wait for the single-listing fetch
    if (deepListing) {
      const place =
        (deepPlaces || []).find((p) => String(p.id) === deepProviderId) || {
          id: Number(deepProviderId),
          name: deepListing.provider_name,
          slug: deepListing.provider_slug,
          logo_url: deepListing.provider_logo_url,
        };
      setOpenListing({ listing: deepListing, place });
    } else {
      Alert.alert(
        t("adoption.noLongerAvailableTitle"),
        t("adoption.noLongerAvailableBody"),
      );
    }
    setDeepHandled(true);
  }, [
    deepHandled,
    deepListingId,
    deepProviderId,
    deepListing,
    deepLoading,
    deepFetched,
    deepPlaces,
  ]);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
      <GlassSurface
        intensity={BLUR.thick}
        style={{ borderBottomWidth: 1, borderColor: MATERIALS.glassBorder }}
        contentStyle={{
          paddingTop: insets.top,
          paddingHorizontal: SPACING.xl,
          paddingBottom: SPACING.md,
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <PressableScale onPress={() => router.back()} style={{ marginRight: SPACING.md }}>
          <ArrowLeft size={22} color={COLORS.warmBrown} />
        </PressableScale>
        <View style={{ flex: 1 }}>
          <Text style={[TYPE.title, { color: COLORS.warmBrown }]}>
            {t("adoption.title")}
          </Text>
          <Text style={[TYPE.footnote, { color: COLORS.mutedBrown, marginTop: 1 }]}>
            {t("adoption.subtitle")}
          </Text>
        </View>
      </GlassSurface>

      <View style={{ flexDirection: "row", gap: SPACING.sm, padding: SPACING.lg, paddingBottom: SPACING.xs }}>
        {TAB_KEYS.map((key) => {
          const selected = tab === key;
          return (
            <PressableScale
              key={key}
              onPress={() => setTab(key)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={{
                paddingHorizontal: SPACING.lg - 2,
                paddingVertical: SPACING.sm,
                borderRadius: RADIUS.chip,
                borderWidth: 1,
                borderColor: selected ? COLORS.coral : COLORS.peach,
                backgroundColor: selected ? COLORS.coral + "18" : COLORS.card,
              }}
            >
              <Text
                style={[
                  TYPE.subhead,
                  { color: selected ? COLORS.coral : COLORS.warmBrown },
                ]}
              >
                {TAB_LABELS[key]}
              </Text>
            </PressableScale>
          );
        })}
      </View>

      {tab === "browse" ? (
        <BrowseTab onOpenListing={setOpenListing} />
      ) : tab === "favorites" ? (
        <FavoritesTab onOpenListing={setOpenListing} />
      ) : (
        <ApplicationsTab />
      )}

      <ListingDetailModal
        data={openListing}
        onClose={() => setOpenListing(null)}
        router={router}
      />
    </View>
  );
}

// Empty filters = browse everything. Each key maps to a /api/adoption/listings query param.
const EMPTY_FILTERS = {
  gender: null,
  size: null,
  energy_level: null,
  vaccination_status: null,
  good_with_kids: null,
  good_with_cats: null,
  good_with_dogs: null,
  age_min: null,
  age_max: null,
  provider_id: null,
};

function activeFilterCount(f) {
  return Object.values(f).filter((v) => v !== null && v !== "").length;
}

// The unified browse (ticket 2.86): a responsive grid of adoptable dogs, NEAREST-FIRST using the
// device location vs each shelter's primary lat/lng (2.81), with composable filters. Permission
// denied / no coords → the server falls back to most-recent (no crash, no empty grid).
function BrowseTab({ onOpenListing }) {
  const { t } = useTranslation();
  const [coords, setCoords] = useState(null); // { lat, lng } | null
  const [located, setLocated] = useState(false); // attempted location yet?
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          const pos = await Location.getCurrentPositionAsync({});
          const lat = pos?.coords?.latitude;
          const lng = pos?.coords?.longitude;
          if (active && isValidCoord(lat, lng)) setCoords({ lat, lng });
        }
      } catch {
        /* denied / unavailable → fall back to most-recent */
      } finally {
        if (active) setLocated(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const query = useMemo(
    () => ({
      ...filters,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
    }),
    [filters, coords],
  );

  const { data, isLoading, isError, refetch } = useAdoptableBrowse(query);
  const listings = data?.listings ?? [];
  const nearest = data?.sort === "nearest";
  const count = activeFilterCount(filters);

  return (
    <RefreshableScrollView
      refetch={refetch}
      contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 80 }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: SPACING.md,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <MapPin size={14} color={COLORS.mutedBrown} />
          <Text style={[TYPE.subhead, { fontWeight: "800", color: COLORS.mutedBrown }]}>
            {nearest ? t("adoption.nearestFirst") : t("adoption.recentlyAdded")}
          </Text>
        </View>
        <PressableScale
          testID="open-filters"
          onPress={() => setFiltersOpen(true)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            borderRadius: RADIUS.chip,
            borderWidth: 1,
            borderColor: count > 0 ? COLORS.coral : COLORS.peach,
            backgroundColor: count > 0 ? COLORS.coral + "18" : COLORS.card,
            paddingHorizontal: SPACING.md,
            paddingVertical: 7,
          }}
        >
          <SlidersHorizontal size={15} color={count > 0 ? COLORS.coral : COLORS.warmBrown} />
          <Text style={[TYPE.subhead, { color: count > 0 ? COLORS.coral : COLORS.warmBrown }]}>
            {count > 0 ? t("adoption.filtersCount", { count }) : t("adoption.filters")}
          </Text>
        </PressableScale>
      </View>

      {isLoading || !located ? (
        <Loading />
      ) : isError ? (
        <EmptyState title={t("adoption.couldNotLoadDogs")} body={t("adoption.pullDownRetry")} />
      ) : listings.length === 0 ? (
        <EmptyState
          title={count > 0 ? t("adoption.noMatches") : t("adoption.noDogsNearYet")}
          body={
            count > 0
              ? t("adoption.noMatchesBody")
              : t("adoption.noDogsNearBody")
          }
        />
      ) : (
        <View
          style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}
        >
          {listings.map((listing) => (
            <View key={listing.id} style={{ width: "48.5%" }}>
              <DogProfileCard
                listing={listing}
                grid
                onPress={() =>
                  onOpenListing({
                    listing,
                    place: {
                      id: listing.provider_id,
                      name: listing.provider_name,
                      slug: listing.provider_slug,
                      logo_url: listing.provider_logo_url,
                    },
                  })
                }
              />
            </View>
          ))}
        </View>
      )}

      <AdoptionFilterSheet
        visible={filtersOpen}
        filters={filters}
        onApply={(next) => {
          setFilters(next);
          setFiltersOpen(false);
        }}
        onClear={() => {
          setFilters(EMPTY_FILTERS);
          setFiltersOpen(false);
        }}
        onClose={() => setFiltersOpen(false)}
      />
    </RefreshableScrollView>
  );
}

// Filter sheet (ticket 2.86): pet attributes (gender, size, age range, energy, good-with,
// vaccination). Filters compose; "Clear all" resets. Distance/city are handled by the device
// location + the radius default; provider filter is set from a listing's shelter elsewhere.
const GENDERS = ["male", "female"];
const SIZES = ["small", "medium", "large", "xlarge"];
const ENERGY = ["low", "medium", "high"];
const VACC = ["up_to_date", "partial", "unknown"];

function AdoptionFilterSheet({ visible, filters, onApply, onClear, onClose }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(filters);
  useEffect(() => {
    if (visible) setDraft(filters);
  }, [visible, filters]);

  const toggle = (key, value) =>
    setDraft((d) => ({ ...d, [key]: d[key] === value ? null : value }));
  const toggleBool = (key) =>
    setDraft((d) => ({ ...d, [key]: d[key] === true ? null : true }));

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
        <GlassSurface
          intensity={BLUR.thick}
          style={{ borderBottomWidth: 1, borderColor: MATERIALS.glassBorder }}
          contentStyle={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            padding: SPACING.lg,
          }}
        >
          <PressableScale onPress={onClose} testID="filters-close">
            <X size={22} color={COLORS.warmBrown} />
          </PressableScale>
          <Text style={[TYPE.headline, { color: COLORS.warmBrown }]}>{t("adoption.filters")}</Text>
          <PressableScale onPress={onClear} testID="filters-clear">
            <Text style={[TYPE.body, { fontWeight: "700", color: COLORS.coral }]}>{t("adoption.clearAll")}</Text>
          </PressableScale>
        </GlassSurface>

        <RefreshableScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 40 }}>
          <FilterGroup label={t("adoption.filter.gender")}>
            {GENDERS.map((g) => (
              <FilterPill key={g} label={g} active={draft.gender === g} onPress={() => toggle("gender", g)} />
            ))}
          </FilterGroup>
          <FilterGroup label={t("adoption.filter.size")}>
            {SIZES.map((s) => (
              <FilterPill key={s} label={s} active={draft.size === s} onPress={() => toggle("size", s)} />
            ))}
          </FilterGroup>
          <FilterGroup label={t("adoption.filter.age")}>
            <FilterPill label={t("adoption.age.puppy")} active={draft.age_max === 1} onPress={() => setDraft((d) => ({ ...d, age_min: null, age_max: d.age_max === 1 ? null : 1 }))} />
            <FilterPill label={t("adoption.age.young")} active={draft.age_min === 1 && draft.age_max === 3} onPress={() => setDraft((d) => (d.age_min === 1 && d.age_max === 3 ? { ...d, age_min: null, age_max: null } : { ...d, age_min: 1, age_max: 3 }))} />
            <FilterPill label={t("adoption.age.adult")} active={draft.age_min === 3 && draft.age_max == null} onPress={() => setDraft((d) => (d.age_min === 3 && d.age_max == null ? { ...d, age_min: null } : { ...d, age_min: 3, age_max: null }))} />
          </FilterGroup>
          <FilterGroup label={t("adoption.filter.energy")}>
            {ENERGY.map((e) => (
              <FilterPill key={e} label={`${e} energy`} active={draft.energy_level === e} onPress={() => toggle("energy_level", e)} />
            ))}
          </FilterGroup>
          <FilterGroup label={t("adoption.filter.goodWith")}>
            <FilterPill label={t("adoption.goodWith.kids")} active={draft.good_with_kids === true} onPress={() => toggleBool("good_with_kids")} />
            <FilterPill label={t("adoption.goodWith.cats")} active={draft.good_with_cats === true} onPress={() => toggleBool("good_with_cats")} />
            <FilterPill label={t("adoption.goodWith.dogs")} active={draft.good_with_dogs === true} onPress={() => toggleBool("good_with_dogs")} />
          </FilterGroup>
          <FilterGroup label={t("adoption.filter.vaccination")}>
            {VACC.map((v) => (
              <FilterPill key={v} label={v.replace(/_/g, " ")} active={draft.vaccination_status === v} onPress={() => toggle("vaccination_status", v)} />
            ))}
          </FilterGroup>
        </RefreshableScrollView>

        <View style={{ padding: SPACING.lg, borderTopWidth: 1, borderTopColor: MATERIALS.hairline }}>
          <PressableScale
            testID="filters-apply"
            onPress={() => onApply(draft)}
            style={{ backgroundColor: COLORS.coral, borderRadius: RADIUS.control, paddingVertical: 16, alignItems: "center" }}
          >
            <Text style={[TYPE.headline, { color: "#fff" }]}>{t("adoption.showDogs")}</Text>
          </PressableScale>
        </View>
      </View>
    </Modal>
  );
}

function FilterGroup({ label, children }) {
  return (
    <View style={{ marginBottom: SPACING.xl }}>
      <Text style={[TYPE.subhead, { fontWeight: "800", color: COLORS.warmBrown, marginBottom: SPACING.sm + 2 }]}>
        {label}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm }}>{children}</View>
    </View>
  );
}

function FilterPill({ label, active, onPress }) {
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={{
        paddingHorizontal: SPACING.md + 2,
        paddingVertical: SPACING.sm + 1,
        borderRadius: RADIUS.chip,
        borderWidth: 1,
        borderColor: active ? COLORS.coral : COLORS.peach,
        backgroundColor: active ? COLORS.coral + "18" : COLORS.card,
      }}
    >
      <Text style={[TYPE.subhead, { color: active ? COLORS.coral : COLORS.warmBrown, textTransform: "capitalize" }]}>
        {label}
      </Text>
    </PressableScale>
  );
}

function FavoritesTab({ onOpenListing }) {
  const { t } = useTranslation();
  const { data: favorites, isLoading, isError, refetch } = useAdoptionFavorites();
  return (
    <RefreshableScrollView refetch={refetch} contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 80 }}>
      <SectionLabel>{t("adoption.savedDogs")}</SectionLabel>
      {isLoading ? (
        <Loading />
      ) : isError ? (
        <EmptyState title={t("adoption.couldNotLoadFavorites")} body={t("adoption.pullDownRetry")} />
      ) : !favorites || favorites.length === 0 ? (
        <EmptyState
          title={t("adoption.noFavoritesYet")}
          body={t("adoption.noFavoritesBody")}
        />
      ) : (
        favorites.map((fav) => (
          <FavoriteRow
            key={fav.id}
            fav={fav}
            onPress={() =>
              onOpenListing({
                listing: {
                  id: fav.listing_id,
                  name: fav.listing_name,
                  breed: fav.listing_breed,
                  photo_urls: fav.listing_photo_urls,
                  adoption_fee_cents: 0,
                },
                place: { id: fav.provider_id, name: fav.provider_name },
              })
            }
          />
        ))
      )}
    </RefreshableScrollView>
  );
}

function FavoriteRow({ fav, onPress }) {
  const photo = Array.isArray(fav.listing_photo_urls) ? fav.listing_photo_urls[0] : null;
  return (
    <PressableScale onPress={onPress}>
      <Card
        level="sm"
        radius={RADIUS.card}
        borderColor={COLORS.peach}
        style={{
          padding: SPACING.md + 2,
          marginBottom: SPACING.md,
          flexDirection: "row",
          alignItems: "center",
          gap: SPACING.md,
        }}
      >
        {photo ? (
          <Image source={{ uri: photo }} style={{ width: 56, height: 56, borderRadius: RADIUS.md - 4, backgroundColor: COLORS.sand }} />
        ) : (
          <View style={{ width: 56, height: 56, borderRadius: RADIUS.md - 4, backgroundColor: COLORS.sand, justifyContent: "center", alignItems: "center" }}>
            <PawPrint size={22} color={COLORS.coral} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={[TYPE.body, { fontWeight: "800", color: COLORS.warmBrown }]} numberOfLines={1}>
            {fav.listing_name}
          </Text>
          <Text style={[TYPE.footnote, { color: COLORS.mutedBrown, marginTop: 2 }]} numberOfLines={1}>
            {[fav.listing_breed, fav.provider_name].filter(Boolean).join(" · ")}
          </Text>
        </View>
        <Heart size={18} color={COLORS.coral} fill={COLORS.coral} />
      </Card>
    </PressableScale>
  );
}

function ApplicationsTab() {
  const { t } = useTranslation();
  const { data: apps, isLoading, isError, refetch } = useMyAdoptionApplications();
  return (
    <RefreshableScrollView refetch={refetch} contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 80 }}>
      <SectionLabel>{t("adoption.yourApplications")}</SectionLabel>
      {isLoading ? (
        <Loading />
      ) : isError ? (
        <EmptyState title={t("adoption.couldNotLoadApplications")} body={t("adoption.pullDownRetry")} />
      ) : !apps || apps.length === 0 ? (
        <EmptyState
          title={t("adoption.noApplicationsYet")}
          body={t("adoption.noApplicationsBody")}
        />
      ) : (
        apps.map((a) => <ApplicationCard key={a.id} app={a} />)
      )}
    </RefreshableScrollView>
  );
}

function ApplicationCard({ app }) {
  const { t } = useTranslation();
  const approved = app.status === "approved";
  return (
    <Card
      level="sm"
      radius={RADIUS.card}
      borderColor={COLORS.peach}
      style={{ padding: SPACING.lg, marginBottom: SPACING.md }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={[TYPE.headline, { color: COLORS.warmBrown }]} numberOfLines={1}>
          {app.listing_name || t("adoption.dogFallback")}
        </Text>
        <StatusPill status={app.status} />
      </View>
      <Text style={[TYPE.footnote, { color: COLORS.mutedBrown, marginTop: 4 }]}>
        {[app.listing_breed, app.provider_name].filter(Boolean).join(" · ")}
      </Text>
      {approved ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: SPACING.sm + 2 }}>
          <Check size={16} color="#3FA34D" />
          <Text style={[TYPE.footnote, { color: "#3FA34D", fontWeight: "700" }]}>
            {t("adoption.approvedNote")}
          </Text>
        </View>
      ) : null}
    </Card>
  );
}

function StatusPill({ status }) {
  const { t } = useTranslation();
  const map = {
    submitted: { label: t("adoption.status.submitted"), color: COLORS.mutedBrown },
    under_review: { label: t("adoption.status.underReview"), color: COLORS.coral },
    approved: { label: t("adoption.status.approved"), color: "#3FA34D" },
    declined: { label: t("adoption.status.declined"), color: COLORS.terracotta },
  };
  const s = map[status] || { label: status, color: COLORS.mutedBrown };
  return (
    <View style={{ backgroundColor: s.color + "22", borderRadius: RADIUS.chip, paddingHorizontal: SPACING.sm + 2, paddingVertical: 3 }}>
      <Text style={[TYPE.caption, { fontWeight: "800", color: s.color, letterSpacing: 0 }]}>{s.label}</Text>
    </View>
  );
}

function Loading({ small }) {
  return (
    <View style={{ paddingVertical: small ? 16 : 48, alignItems: "center" }}>
      <ActivityIndicator color={COLORS.coral} />
    </View>
  );
}

function SectionLabel({ children }) {
  return (
    <Text
      style={[
        TYPE.subhead,
        {
          fontWeight: "800",
          color: COLORS.mutedBrown,
          marginBottom: SPACING.lg - 2,
          letterSpacing: 0.6,
        },
      ]}
    >
      {children}
    </Text>
  );
}

function EmptyState({ title, body }) {
  return (
    <Card
      level="sm"
      radius={RADIUS.card}
      borderColor={COLORS.peach}
      style={{
        padding: SPACING.xxl + SPACING.xs,
        alignItems: "center",
      }}
    >
      <PawPrint size={32} color={COLORS.mutedBrown} />
      <Text style={[TYPE.headline, { color: COLORS.warmBrown, marginTop: SPACING.md }]}>
        {title}
      </Text>
      <Text style={[TYPE.subhead, { color: COLORS.mutedBrown, fontWeight: "500", marginTop: SPACING.xs + 2, textAlign: "center" }]}>
        {body}
      </Text>
    </Card>
  );
}
