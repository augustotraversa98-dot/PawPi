import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Modal,
  Alert,
  Linking,
  ScrollView,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as Location from "expo-location";
import { Video, ResizeMode } from "expo-av";
import MapLocationView from "@/components/Map/MapLocationView";
import {
  ArrowLeft,
  PawPrint,
  ChevronRight,
  Heart,
  X,
  MessageSquare,
  Check,
  SlidersHorizontal,
  MapPin,
} from "lucide-react-native";
import { COLORS } from "@/constants/colors";
import { RefreshableScrollView } from "@/components/RefreshableScrollView";
import { ModerationMenu } from "@/components/moderation/ModerationMenu";
import {
  useDiscoverProviders,
  useAdoptableBrowse,
  useAdoptableListing,
  useApplyForAdoption,
  useMyAdoptionApplications,
  useAdoptionFavorites,
  useToggleAdoptionFavorite,
  useAdoptionCheckout,
  useStartThread,
} from "@/hooks/useProviders";
import { isValidCoord } from "@/utils/walkBuddies";

// ADOPTION (ticket 2.12) — REPLACES the old "Coming soon" Adoption signpost. The owner
// discovers adoption PLACES (shelters/rescues = providers with the 'adoption' capability),
// browses their adoptable DOGS rendered in the EXISTING dog-profile format (the same rich
// card shape the rest of the app uses for pets), FAVORITES a dog, APPLIES, CHATS with the
// shelter (reuses 2.5), and pays the adoption FEE / DONATES (reuses 2.3). On shelter approval
// the dog becomes the owner's own pet. Discovery is the SHARED
// /api/providers/discover?type=adoption (capability match, 2.1). Real data only; empty →
// empty states; NO fake listings. RLS (0038) is the real guard.

const TABS = [
  { key: "browse", label: "Browse" },
  { key: "favorites", label: "Favorites" },
  { key: "applications", label: "Applications" },
];

function money(cents, currency = "ARS") {
  if (cents == null) return "";
  if (cents === 0) return "Free";
  return `${currency} ${(cents / 100).toFixed(2)}`;
}

function ageLabel(years, months) {
  const y = years || 0;
  const m = months || 0;
  if (!y && !m) return "Age unknown";
  const parts = [];
  if (y) parts.push(`${y}y`);
  if (m) parts.push(`${m}m`);
  return parts.join(" ");
}

export default function AdoptionScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams();
  const [tab, setTab] = useState("browse");
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
        "No longer available",
        "This dog has found a home or the listing was removed.",
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
      <View
        style={{
          paddingTop: insets.top,
          paddingHorizontal: 20,
          paddingBottom: 14,
          backgroundColor: COLORS.card,
          flexDirection: "row",
          alignItems: "center",
          borderBottomWidth: 1,
          borderBottomColor: COLORS.peach,
        }}
      >
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 14 }}>
          <ArrowLeft size={22} color={COLORS.warmBrown} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 22, fontWeight: "800", color: COLORS.warmBrown }}>
            Adoption 🐶
          </Text>
          <Text style={{ fontSize: 12, color: COLORS.mutedBrown, marginTop: 1 }}>
            Find a dog to bring home
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: "row", gap: 8, padding: 16, paddingBottom: 4 }}>
        {TABS.map((t) => {
          const selected = tab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              onPress={() => setTab(t.key)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: selected ? COLORS.coral : COLORS.peach,
                backgroundColor: selected ? COLORS.coral + "18" : COLORS.card,
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "700",
                  color: selected ? COLORS.coral : COLORS.warmBrown,
                }}
              >
                {t.label}
              </Text>
            </TouchableOpacity>
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
      contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <MapPin size={14} color={COLORS.mutedBrown} />
          <Text style={{ fontSize: 12, fontWeight: "700", color: COLORS.mutedBrown }}>
            {nearest ? "NEAREST FIRST" : "RECENTLY ADDED"}
          </Text>
        </View>
        <TouchableOpacity
          testID="open-filters"
          onPress={() => setFiltersOpen(true)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: count > 0 ? COLORS.coral : COLORS.peach,
            backgroundColor: count > 0 ? COLORS.coral + "18" : COLORS.card,
            paddingHorizontal: 12,
            paddingVertical: 7,
          }}
        >
          <SlidersHorizontal size={15} color={count > 0 ? COLORS.coral : COLORS.warmBrown} />
          <Text style={{ fontSize: 13, fontWeight: "700", color: count > 0 ? COLORS.coral : COLORS.warmBrown }}>
            Filters{count > 0 ? ` (${count})` : ""}
          </Text>
        </TouchableOpacity>
      </View>

      {isLoading || !located ? (
        <Loading />
      ) : isError ? (
        <EmptyState title="Couldn't load dogs" body="Something went wrong. Pull down to try again." />
      ) : listings.length === 0 ? (
        <EmptyState
          title={count > 0 ? "No matches" : "No dogs near you yet"}
          body={
            count > 0
              ? "Try widening or clearing your filters."
              : "Check back soon — shelters and rescues are joining PawPi."
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

// The dog-profile card (ticket 2.86): the cover photo on TOP, then — BELOW it, so the dog is fully
// visible (NOT overlaid) — the name, a basic-info row (age · size · gender), the distance, and a
// "See more" affordance. `grid` renders the compact half-width variant for the browse grid.
function DogProfileCard({ listing, onPress, grid = false }) {
  const photo = Array.isArray(listing.photo_urls) ? listing.photo_urls[0] : null;
  const photoH = grid ? 140 : 180;
  const info = [ageLabel(listing.age_years, listing.age_months), listing.size, listing.gender]
    .filter(Boolean)
    .join(" · ");
  const km = listing.distance_km;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.9}
      style={{
        backgroundColor: COLORS.card,
        borderRadius: grid ? 18 : 22,
        marginBottom: 14,
        borderWidth: 1,
        borderColor: COLORS.peach,
        overflow: "hidden",
      }}
    >
      <View>
        {photo ? (
          <Image source={{ uri: photo }} style={{ width: "100%", height: photoH, backgroundColor: COLORS.sand }} />
        ) : (
          <View
            style={{
              width: "100%",
              height: photoH,
              backgroundColor: COLORS.sand,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <PawPrint size={grid ? 30 : 40} color={COLORS.coral} />
          </View>
        )}
        {listing.is_urgent ? (
          <View
            testID={`urgent-${listing.id}`}
            style={{
              position: "absolute",
              top: 8,
              left: 8,
              backgroundColor: "#C2410C",
              borderRadius: 999,
              paddingHorizontal: 10,
              paddingVertical: 4,
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 10 }}>URGENT</Text>
          </View>
        ) : null}
      </View>

      <View style={{ padding: grid ? 12 : 16 }}>
        <Text style={{ fontSize: grid ? 16 : 19, fontWeight: "800", color: COLORS.warmBrown }} numberOfLines={1}>
          {listing.name}
        </Text>
        <Text style={{ fontSize: 12.5, color: COLORS.mutedBrown, marginTop: 2 }} numberOfLines={1}>
          {info || "Details inside"}
        </Text>
        {km != null ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 }}>
            <MapPin size={12} color={COLORS.mutedBrown} />
            <Text style={{ fontSize: 12, color: COLORS.mutedBrown }}>
              {km < 1 ? "Less than 1 km away" : `${Math.round(km)} km away`}
            </Text>
          </View>
        ) : null}
        {!grid ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
            {listing.placement_type === "foster" ? <Chip label="Foster" /> : null}
            {listing.placement_type === "both" ? <Chip label="Adopt or foster" /> : null}
            {listing.energy_level ? <Chip label={`${listing.energy_level} energy`} /> : null}
            {listing.good_with_kids === true ? <Chip label="Good with kids" /> : null}
          </View>
        ) : null}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
          <Text style={{ fontSize: 12.5, color: COLORS.coral, fontWeight: "700" }} numberOfLines={1}>
            {money(listing.adoption_fee_cents, listing.currency)}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
            <Text style={{ fontSize: 12.5, fontWeight: "700", color: COLORS.warmBrown }}>See more</Text>
            <ChevronRight size={16} color={COLORS.warmBrown} />
          </View>
        </View>
      </View>
    </TouchableOpacity>
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
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            padding: 16,
            borderBottomWidth: 1,
            borderBottomColor: COLORS.peach,
          }}
        >
          <TouchableOpacity onPress={onClose} testID="filters-close">
            <X size={22} color={COLORS.warmBrown} />
          </TouchableOpacity>
          <Text style={{ fontSize: 16, fontWeight: "800", color: COLORS.warmBrown }}>Filters</Text>
          <TouchableOpacity onPress={onClear} testID="filters-clear">
            <Text style={{ fontSize: 14, fontWeight: "700", color: COLORS.coral }}>Clear all</Text>
          </TouchableOpacity>
        </View>

        <RefreshableScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          <FilterGroup label="Gender">
            {GENDERS.map((g) => (
              <FilterPill key={g} label={g} active={draft.gender === g} onPress={() => toggle("gender", g)} />
            ))}
          </FilterGroup>
          <FilterGroup label="Size">
            {SIZES.map((s) => (
              <FilterPill key={s} label={s} active={draft.size === s} onPress={() => toggle("size", s)} />
            ))}
          </FilterGroup>
          <FilterGroup label="Age">
            <FilterPill label="Puppy (≤1y)" active={draft.age_max === 1} onPress={() => setDraft((d) => ({ ...d, age_min: null, age_max: d.age_max === 1 ? null : 1 }))} />
            <FilterPill label="Young (1–3y)" active={draft.age_min === 1 && draft.age_max === 3} onPress={() => setDraft((d) => (d.age_min === 1 && d.age_max === 3 ? { ...d, age_min: null, age_max: null } : { ...d, age_min: 1, age_max: 3 }))} />
            <FilterPill label="Adult (3y+)" active={draft.age_min === 3 && draft.age_max == null} onPress={() => setDraft((d) => (d.age_min === 3 && d.age_max == null ? { ...d, age_min: null } : { ...d, age_min: 3, age_max: null }))} />
          </FilterGroup>
          <FilterGroup label="Energy">
            {ENERGY.map((e) => (
              <FilterPill key={e} label={`${e} energy`} active={draft.energy_level === e} onPress={() => toggle("energy_level", e)} />
            ))}
          </FilterGroup>
          <FilterGroup label="Good with">
            <FilterPill label="Kids" active={draft.good_with_kids === true} onPress={() => toggleBool("good_with_kids")} />
            <FilterPill label="Cats" active={draft.good_with_cats === true} onPress={() => toggleBool("good_with_cats")} />
            <FilterPill label="Dogs" active={draft.good_with_dogs === true} onPress={() => toggleBool("good_with_dogs")} />
          </FilterGroup>
          <FilterGroup label="Vaccination">
            {VACC.map((v) => (
              <FilterPill key={v} label={v.replace(/_/g, " ")} active={draft.vaccination_status === v} onPress={() => toggle("vaccination_status", v)} />
            ))}
          </FilterGroup>
        </RefreshableScrollView>

        <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: COLORS.peach }}>
          <TouchableOpacity
            testID="filters-apply"
            onPress={() => onApply(draft)}
            style={{ backgroundColor: COLORS.coral, borderRadius: 16, paddingVertical: 16, alignItems: "center" }}
          >
            <Text style={{ fontSize: 16, fontWeight: "800", color: "#fff" }}>Show dogs</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function FilterGroup({ label, children }) {
  return (
    <View style={{ marginBottom: 20 }}>
      <Text style={{ fontSize: 13, fontWeight: "800", color: COLORS.warmBrown, marginBottom: 10 }}>
        {label}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{children}</View>
    </View>
  );
}

function FilterPill({ label, active, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 9,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: active ? COLORS.coral : COLORS.peach,
        backgroundColor: active ? COLORS.coral + "18" : COLORS.card,
      }}
    >
      <Text style={{ fontSize: 13, fontWeight: "700", color: active ? COLORS.coral : COLORS.warmBrown, textTransform: "capitalize" }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function ListingDetailModal({ data, onClose, router }) {
  const listing = data?.listing;
  const place = data?.place;
  const apply = useApplyForAdoption();
  const { mutate: startThread, isPending: startingThread } = useStartThread();
  const checkout = useAdoptionCheckout();
  // Foster-vs-adopt intent (ticket 2.57) — only shown when the listing allows BOTH.
  const [placement, setPlacement] = useState("adopt");

  const doApply = async () => {
    try {
      const requestedPlacement =
        listing.placement_type === "foster"
          ? "foster"
          : listing.placement_type === "both"
            ? placement
            : null;
      await apply.mutateAsync({
        listing_id: listing.id,
        answers: {},
        requested_placement: requestedPlacement,
      });
      Alert.alert(
        "Application sent",
        `The shelter will review your application for ${listing.name}. You can chat with them anytime.`,
      );
    } catch (e) {
      Alert.alert("Couldn't apply", e.message || "Please try again.");
    }
  };

  const doChat = () => {
    if (startingThread) return;
    startThread(
      { providerId: place.id },
      {
        onSuccess: (res) => {
          const thread = res?.thread;
          if (!thread) return;
          onClose();
          router.push({
            pathname: "/provider-chat",
            params: {
              threadId: String(thread.id),
              providerName: place.name || "Shelter",
              ownerUserId: String(thread.owner_user_id),
            },
          });
        },
        onError: (e) => Alert.alert("Couldn't open chat", e.message || "Please try again."),
      },
    );
  };

  const doPay = async (kind, amountCents) => {
    try {
      const res = await checkout.mutateAsync({
        provider_id: place.id,
        kind,
        amount_cents: amountCents,
        source_ref: `adoption-listing-${listing.id}`,
      });
      if (res.checkoutUrl) {
        Linking.openURL(res.checkoutUrl).catch(() => {});
        Alert.alert("Payment started", "Complete it in the checkout window.");
      } else {
        Alert.alert("Thank you", "Your payment is being processed.");
      }
    } catch (e) {
      // Surfaces the backend's 503 "payments not configured" message verbatim.
      Alert.alert("Payments not available", e.message || "Please try again later.");
    }
  };

  return (
    <Modal
      visible={!!data}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      {listing ? (
        <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              padding: 16,
              borderBottomWidth: 1,
              borderBottomColor: COLORS.peach,
              backgroundColor: COLORS.card,
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: "800", color: COLORS.warmBrown, flex: 1 }} numberOfLines={1}>
              {listing.name}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              {/* Report this adoption listing (T4). */}
              <ModerationMenu targetType="adoption_listing" targetId={listing.id} iconSize={18} />
              <TouchableOpacity onPress={onClose}>
                <X size={22} color={COLORS.warmBrown} />
              </TouchableOpacity>
            </View>
          </View>

          <RefreshableScrollView contentContainerStyle={{ paddingBottom: 40 }}>
            {listing.is_urgent ? (
              <View testID="detail-urgent" style={{ margin: 16, marginBottom: 0, backgroundColor: "#C2410C", borderRadius: 12, padding: 12 }}>
                <Text style={{ color: "#fff", fontWeight: "800" }}>
                  Urgent{listing.urgent_reason ? `: ${listing.urgent_reason}` : ""}
                </Text>
              </View>
            ) : null}

            <DogProfileDetail listing={listing} place={place} />

            <View style={{ padding: 16, gap: 12 }}>
              {/* Placement: shown only when the listing allows BOTH adopt + foster. */}
              {listing.placement_type === "both" ? (
                <View>
                  <Text style={{ color: COLORS.mutedBrown, fontWeight: "700", marginBottom: 6 }}>
                    I'd like to:
                  </Text>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <TouchableOpacity
                      testID="placement-adopt"
                      onPress={() => setPlacement("adopt")}
                      style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: placement === "adopt" ? COLORS.coral : COLORS.peach, backgroundColor: placement === "adopt" ? COLORS.coral + "18" : COLORS.card }}
                    >
                      <Text style={{ color: placement === "adopt" ? COLORS.coral : COLORS.warmBrown, fontWeight: "700" }}>Adopt</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      testID="placement-foster"
                      onPress={() => setPlacement("foster")}
                      style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: placement === "foster" ? COLORS.coral : COLORS.peach, backgroundColor: placement === "foster" ? COLORS.coral + "18" : COLORS.card }}
                    >
                      <Text style={{ color: placement === "foster" ? COLORS.coral : COLORS.warmBrown, fontWeight: "700" }}>Foster</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : listing.placement_type === "foster" ? (
                <Text testID="placement-foster-only" style={{ color: COLORS.mutedBrown, fontWeight: "700" }}>
                  This dog is available to foster.
                </Text>
              ) : null}

              <PrimaryButton
                label={
                  apply.isPending
                    ? "Sending…"
                    : listing.placement_type === "foster" ||
                        (listing.placement_type === "both" && placement === "foster")
                      ? "Apply to foster"
                      : "Apply to adopt"
                }
                onPress={doApply}
                disabled={apply.isPending}
              />
              <SecondaryButton
                label={startingThread ? "Opening…" : "Chat with shelter"}
                icon={MessageSquare}
                onPress={doChat}
                disabled={startingThread}
              />
              <SecondaryButton
                label={
                  listing.adoption_fee_cents > 0
                    ? `Pay adoption fee · ${money(listing.adoption_fee_cents, listing.currency)}`
                    : "No adoption fee"
                }
                onPress={() =>
                  listing.adoption_fee_cents > 0 &&
                  doPay("adoption_fee", listing.adoption_fee_cents)
                }
                disabled={checkout.isPending || listing.adoption_fee_cents <= 0}
              />
              <SecondaryButton
                label="Donate to this place"
                onPress={() =>
                  Alert.prompt
                    ? Alert.prompt(
                        "Donate",
                        "Amount in ARS",
                        (val) => {
                          const cents = Math.round(parseFloat(val) * 100);
                          if (Number.isFinite(cents) && cents > 0) doPay("donation", cents);
                        },
                        "plain-text",
                        "",
                        "numeric",
                      )
                    : doPay("donation", 1000)
                }
                disabled={checkout.isPending}
              />
            </View>
          </RefreshableScrollView>
        </View>
      ) : (
        <View />
      )}
    </Modal>
  );
}

// Swipeable media gallery (ticket 2.87): all photo_urls[] as paged images + the intro video_url as a
// final page (expo-av, native controls). Empty → a neutral paw placeholder (never fake media).
function MediaGallery({ photos, video }) {
  const [page, setPage] = useState(0);
  const width = Dimensions.get("window").width;
  const items = [
    ...(Array.isArray(photos) ? photos.filter(Boolean).map((uri) => ({ type: "photo", uri })) : []),
    ...(video ? [{ type: "video", uri: video }] : []),
  ];

  if (items.length === 0) {
    return (
      <View
        style={{ width: "100%", height: 280, backgroundColor: COLORS.sand, justifyContent: "center", alignItems: "center" }}
      >
        <PawPrint size={56} color={COLORS.coral} />
      </View>
    );
  }

  return (
    <View>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) =>
          setPage(Math.round(e.nativeEvent.contentOffset.x / Math.max(1, width)))
        }
      >
        {items.map((item, i) =>
          item.type === "photo" ? (
            <Image
              key={`p${i}`}
              testID={`gallery-photo-${i}`}
              source={{ uri: item.uri }}
              style={{ width, height: 300, backgroundColor: COLORS.sand }}
            />
          ) : (
            <Video
              key={`v${i}`}
              testID="gallery-video"
              source={{ uri: item.uri }}
              useNativeControls
              resizeMode={ResizeMode.CONTAIN}
              style={{ width, height: 300, backgroundColor: "#000" }}
            />
          ),
        )}
      </ScrollView>
      {items.length > 1 ? (
        <View style={{ flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 8 }}>
          {items.map((it, i) => (
            <View
              key={i}
              style={{
                width: 7,
                height: 7,
                borderRadius: 999,
                backgroundColor: i === page ? COLORS.coral : COLORS.peach,
              }}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

// One fact row in the key-facts grid. Renders only when a real value exists (unknowns are omitted).
function Fact({ label, value }) {
  if (value == null || value === "") return null;
  return (
    <View style={{ width: "50%", paddingVertical: 6 }}>
      <Text style={{ fontSize: 11, color: COLORS.mutedBrown, textTransform: "uppercase", fontWeight: "700" }}>
        {label}
      </Text>
      <Text style={{ fontSize: 15, color: COLORS.warmBrown, fontWeight: "600", marginTop: 2 }}>
        {value}
      </Text>
    </View>
  );
}

// The full dog-profile detail (ticket 2.87): media gallery (photos + video) → key facts →
// compatibility chips → story → shelter card with a map. Only real fields render; unknowns are
// omitted gracefully (never shown as fake).
function DogProfileDetail({ listing, place }) {
  const hasCoord = isValidCoord(listing.provider_lat, listing.provider_lng);
  const shelterAddr = listing.provider_address;
  return (
    <View>
      <MediaGallery photos={listing.photo_urls} video={listing.video_url} />
      <View style={{ padding: 16 }}>
        <Text style={{ fontSize: 24, fontWeight: "800", color: COLORS.warmBrown }}>{listing.name}</Text>
        <Text style={{ fontSize: 12, color: COLORS.mutedBrown, marginTop: 2 }}>
          Listed by {listing.provider_name || place?.name}
        </Text>

        {/* Key facts — only the ones we actually know. */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 14 }}>
          <Fact label="Age" value={ageLabel(listing.age_years, listing.age_months) !== "Age unknown" ? ageLabel(listing.age_years, listing.age_months) : null} />
          <Fact label="Gender" value={listing.gender} />
          <Fact label="Size" value={listing.size} />
          <Fact label="Breed" value={listing.breed} />
          <Fact label="Vaccination" value={listing.vaccination_status ? listing.vaccination_status.replace(/_/g, " ") : null} />
          <Fact label="Adoption fee" value={money(listing.adoption_fee_cents, listing.currency)} />
        </View>

        {/* Compatibility chips. */}
        {(listing.energy_level || listing.good_with_kids === true || listing.good_with_cats === true || listing.good_with_dogs === true) ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
            {listing.energy_level ? <Chip label={`${listing.energy_level} energy`} /> : null}
            {listing.good_with_kids === true ? <Chip label="Good with kids" /> : null}
            {listing.good_with_cats === true ? <Chip label="Good with cats" /> : null}
            {listing.good_with_dogs === true ? <Chip label="Good with dogs" /> : null}
          </View>
        ) : null}

        {listing.story ? (
          <>
            <Text style={{ fontSize: 16, fontWeight: "800", color: COLORS.warmBrown, marginTop: 20, marginBottom: 6 }}>
              {listing.name}'s story
            </Text>
            <Text style={{ fontSize: 15, color: COLORS.warmBrown, lineHeight: 22 }}>
              {listing.story}
            </Text>
          </>
        ) : null}

        {/* Shelter card — name + a map of its location (ticket 2.68 MapLocationView) when known. */}
        <Text style={{ fontSize: 16, fontWeight: "800", color: COLORS.warmBrown, marginTop: 20, marginBottom: 8 }}>
          Shelter
        </Text>
        <View style={{ borderWidth: 1, borderColor: COLORS.peach, borderRadius: 16, padding: 14, backgroundColor: COLORS.card }}>
          <Text style={{ fontSize: 15, fontWeight: "700", color: COLORS.warmBrown }}>
            {listing.provider_name || place?.name}
          </Text>
          {shelterAddr ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
              <MapPin size={13} color={COLORS.mutedBrown} />
              <Text style={{ fontSize: 13, color: COLORS.mutedBrown, flex: 1 }}>{shelterAddr}</Text>
            </View>
          ) : null}
          {hasCoord ? (
            <View style={{ marginTop: 10 }}>
              <MapLocationView
                testID="shelter-map"
                points={{ lat: listing.provider_lat, lng: listing.provider_lng }}
                height={160}
              />
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function FavoritesTab({ onOpenListing }) {
  const { data: favorites, isLoading, isError, refetch } = useAdoptionFavorites();
  return (
    <RefreshableScrollView refetch={refetch} contentContainerStyle={{ padding: 16, paddingBottom: 80 }}>
      <SectionLabel>SAVED DOGS</SectionLabel>
      {isLoading ? (
        <Loading />
      ) : isError ? (
        <EmptyState title="Couldn't load favorites" body="Pull down to try again." />
      ) : !favorites || favorites.length === 0 ? (
        <EmptyState
          title="No favorites yet"
          body="Tap the heart on a dog you love to save it here."
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
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={{
        backgroundColor: COLORS.card,
        borderRadius: 18,
        padding: 14,
        marginBottom: 12,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        borderWidth: 1,
        borderColor: COLORS.peach,
      }}
    >
      {photo ? (
        <Image source={{ uri: photo }} style={{ width: 56, height: 56, borderRadius: 12, backgroundColor: COLORS.sand }} />
      ) : (
        <View style={{ width: 56, height: 56, borderRadius: 12, backgroundColor: COLORS.sand, justifyContent: "center", alignItems: "center" }}>
          <PawPrint size={22} color={COLORS.coral} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, fontWeight: "800", color: COLORS.warmBrown }} numberOfLines={1}>
          {fav.listing_name}
        </Text>
        <Text style={{ fontSize: 12, color: COLORS.mutedBrown, marginTop: 2 }} numberOfLines={1}>
          {[fav.listing_breed, fav.provider_name].filter(Boolean).join(" · ")}
        </Text>
      </View>
      <Heart size={18} color={COLORS.coral} fill={COLORS.coral} />
    </TouchableOpacity>
  );
}

function ApplicationsTab() {
  const { data: apps, isLoading, isError, refetch } = useMyAdoptionApplications();
  return (
    <RefreshableScrollView refetch={refetch} contentContainerStyle={{ padding: 16, paddingBottom: 80 }}>
      <SectionLabel>YOUR APPLICATIONS</SectionLabel>
      {isLoading ? (
        <Loading />
      ) : isError ? (
        <EmptyState title="Couldn't load applications" body="Pull down to try again." />
      ) : !apps || apps.length === 0 ? (
        <EmptyState
          title="No applications yet"
          body="Apply to adopt a dog and track your application here."
        />
      ) : (
        apps.map((a) => <ApplicationCard key={a.id} app={a} />)
      )}
    </RefreshableScrollView>
  );
}

function ApplicationCard({ app }) {
  const approved = app.status === "approved";
  return (
    <View
      style={{
        backgroundColor: COLORS.card,
        borderRadius: 18,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: COLORS.peach,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ fontSize: 16, fontWeight: "800", color: COLORS.warmBrown }} numberOfLines={1}>
          {app.listing_name || "Dog"}
        </Text>
        <StatusPill status={app.status} />
      </View>
      <Text style={{ fontSize: 13, color: COLORS.mutedBrown, marginTop: 4 }}>
        {[app.listing_breed, app.provider_name].filter(Boolean).join(" · ")}
      </Text>
      {approved ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 }}>
          <Check size={16} color="#3FA34D" />
          <Text style={{ fontSize: 13, color: "#3FA34D", fontWeight: "700" }}>
            Approved — this dog is now your pet! Find it under My Pets.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function StatusPill({ status }) {
  const map = {
    submitted: { label: "Submitted", color: COLORS.mutedBrown },
    under_review: { label: "Under review", color: COLORS.coral },
    approved: { label: "Approved", color: "#3FA34D" },
    declined: { label: "Declined", color: COLORS.terracotta },
  };
  const s = map[status] || { label: status, color: COLORS.mutedBrown };
  return (
    <View style={{ backgroundColor: s.color + "22", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
      <Text style={{ fontSize: 11, fontWeight: "800", color: s.color }}>{s.label}</Text>
    </View>
  );
}

function Chip({ label }) {
  return (
    <View
      style={{
        backgroundColor: COLORS.coral + "14",
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 4,
      }}
    >
      <Text style={{ fontSize: 11, fontWeight: "700", color: COLORS.coral }}>{label}</Text>
    </View>
  );
}

function PrimaryButton({ label, onPress, disabled }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.9}
      style={{
        backgroundColor: COLORS.coral,
        borderRadius: 16,
        paddingVertical: 15,
        alignItems: "center",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <Text style={{ color: "#FFF", fontWeight: "800", fontSize: 16 }}>{label}</Text>
    </TouchableOpacity>
  );
}

function SecondaryButton({ label, icon: Icon, onPress, disabled }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.9}
      style={{
        backgroundColor: COLORS.card,
        borderRadius: 16,
        paddingVertical: 14,
        alignItems: "center",
        flexDirection: "row",
        justifyContent: "center",
        gap: 8,
        borderWidth: 1,
        borderColor: COLORS.peach,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {Icon ? <Icon size={18} color={COLORS.coral} /> : null}
      <Text style={{ color: COLORS.coral, fontWeight: "800", fontSize: 15 }}>{label}</Text>
    </TouchableOpacity>
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
      style={{
        fontSize: 13,
        fontWeight: "800",
        color: COLORS.mutedBrown,
        marginBottom: 14,
        letterSpacing: 0.6,
      }}
    >
      {children}
    </Text>
  );
}

function EmptyState({ title, body }) {
  return (
    <View
      style={{
        backgroundColor: COLORS.card,
        borderRadius: 22,
        padding: 28,
        alignItems: "center",
        borderWidth: 1,
        borderColor: COLORS.peach,
      }}
    >
      <PawPrint size={32} color={COLORS.mutedBrown} />
      <Text style={{ fontSize: 16, fontWeight: "800", color: COLORS.warmBrown, marginTop: 12 }}>
        {title}
      </Text>
      <Text style={{ fontSize: 13, color: COLORS.mutedBrown, marginTop: 6, textAlign: "center" }}>
        {body}
      </Text>
    </View>
  );
}
