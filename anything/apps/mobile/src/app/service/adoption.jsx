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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  ArrowLeft,
  PawPrint,
  ChevronRight,
  Heart,
  X,
  MessageSquare,
  Home,
  Check,
} from "lucide-react-native";
import { COLORS } from "@/constants/colors";
import { RefreshableScrollView } from "@/components/RefreshableScrollView";
import {
  useDiscoverProviders,
  useAdoptableListings,
  useAdoptableListing,
  useApplyForAdoption,
  useMyAdoptionApplications,
  useAdoptionFavorites,
  useToggleAdoptionFavorite,
  useAdoptionCheckout,
  useStartThread,
} from "@/hooks/useProviders";
import RatingBadge from "@/components/Providers/RatingBadge";

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

function BrowseTab({ onOpenListing }) {
  const { data: places, isLoading, isError, refetch } = useDiscoverProviders("adoption");

  return (
    <RefreshableScrollView
      refetch={refetch}
      contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
    >
      <SectionLabel>ADOPTION PLACES NEAR YOU</SectionLabel>
      {isLoading ? (
        <Loading />
      ) : isError ? (
        <EmptyState
          title="Couldn't load places"
          body="Something went wrong. Pull down to try again."
        />
      ) : !places || places.length === 0 ? (
        <EmptyState
          title="No adoption places yet"
          body="Check back soon — shelters and rescues are joining PawPi."
        />
      ) : (
        places.map((place) => (
          <PlaceSection key={place.id} place={place} onOpenListing={onOpenListing} />
        ))
      )}
    </RefreshableScrollView>
  );
}

// A place + its adoptable dogs, each rendered as a dog-profile card.
function PlaceSection({ place, onOpenListing }) {
  const { data: listings, isLoading } = useAdoptableListings(place.id);

  return (
    <View style={{ marginBottom: 22 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10 }}>
        {place.logo_url ? (
          <Image
            source={{ uri: place.logo_url }}
            style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.sand }}
          />
        ) : (
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              backgroundColor: COLORS.sand,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Home size={18} color={COLORS.coral} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: "800", color: COLORS.warmBrown }} numberOfLines={1}>
            {place.name}
          </Text>
          <RatingBadge avgRating={place.avg_rating} reviewCount={place.review_count} />
        </View>
      </View>

      {isLoading ? (
        <Loading small />
      ) : !listings || listings.length === 0 ? (
        <Text style={{ fontSize: 13, color: COLORS.mutedBrown, paddingLeft: 4 }}>
          No dogs listed right now.
        </Text>
      ) : (
        listings.map((listing) => (
          <DogProfileCard
            key={listing.id}
            listing={listing}
            onPress={() => onOpenListing({ listing, place })}
          />
        ))
      )}
    </View>
  );
}

// The dog-profile card — the existing rich pet-profile format applied to an adoptable dog:
// photo, name, breed, age, gender, size, energy + the good-with chips.
function DogProfileCard({ listing, onPress }) {
  const photo = Array.isArray(listing.photo_urls) ? listing.photo_urls[0] : null;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.9}
      style={{
        backgroundColor: COLORS.card,
        borderRadius: 22,
        marginBottom: 14,
        borderWidth: 1,
        borderColor: COLORS.peach,
        overflow: "hidden",
      }}
    >
      {photo ? (
        <Image source={{ uri: photo }} style={{ width: "100%", height: 180, backgroundColor: COLORS.sand }} />
      ) : (
        <View
          style={{
            width: "100%",
            height: 180,
            backgroundColor: COLORS.sand,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <PawPrint size={40} color={COLORS.coral} />
        </View>
      )}
      <View style={{ padding: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ fontSize: 19, fontWeight: "800", color: COLORS.warmBrown }} numberOfLines={1}>
            {listing.name}
          </Text>
          <ChevronRight size={20} color={COLORS.mutedBrown} />
        </View>
        <Text style={{ fontSize: 13, color: COLORS.mutedBrown, marginTop: 3 }} numberOfLines={1}>
          {[listing.breed, ageLabel(listing.age_years, listing.age_months), listing.gender, listing.size]
            .filter(Boolean)
            .join(" · ")}
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
          {listing.is_urgent ? (
            <View testID={`urgent-${listing.id}`} style={{ backgroundColor: "#C2410C", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 11 }}>URGENT</Text>
            </View>
          ) : null}
          {listing.placement_type === "foster" ? <Chip label="Foster" /> : null}
          {listing.placement_type === "both" ? <Chip label="Adopt or foster" /> : null}
          {listing.energy_level ? <Chip label={`${listing.energy_level} energy`} /> : null}
          {listing.good_with_kids === true ? <Chip label="Good with kids" /> : null}
          {listing.good_with_cats === true ? <Chip label="Good with cats" /> : null}
          {listing.good_with_dogs === true ? <Chip label="Good with dogs" /> : null}
        </View>
        <Text style={{ fontSize: 13, color: COLORS.coral, fontWeight: "700", marginTop: 10 }}>
          Adoption fee: {money(listing.adoption_fee_cents, listing.currency)}
        </Text>
      </View>
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
            <Text style={{ fontSize: 18, fontWeight: "800", color: COLORS.warmBrown }} numberOfLines={1}>
              {listing.name}
            </Text>
            <TouchableOpacity onPress={onClose}>
              <X size={22} color={COLORS.warmBrown} />
            </TouchableOpacity>
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

// The full dog-profile detail (reuses the dog-profile shape: hero photo, vitals, story, the
// good-with + vaccination summary).
function DogProfileDetail({ listing, place }) {
  const photo = Array.isArray(listing.photo_urls) ? listing.photo_urls[0] : null;
  return (
    <View>
      {photo ? (
        <Image source={{ uri: photo }} style={{ width: "100%", height: 260, backgroundColor: COLORS.sand }} />
      ) : (
        <View
          style={{
            width: "100%",
            height: 260,
            backgroundColor: COLORS.sand,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <PawPrint size={56} color={COLORS.coral} />
        </View>
      )}
      <View style={{ padding: 16 }}>
        <Text style={{ fontSize: 24, fontWeight: "800", color: COLORS.warmBrown }}>{listing.name}</Text>
        <Text style={{ fontSize: 14, color: COLORS.mutedBrown, marginTop: 4 }}>
          {[listing.breed, ageLabel(listing.age_years, listing.age_months), listing.gender, listing.size]
            .filter(Boolean)
            .join(" · ")}
        </Text>
        <Text style={{ fontSize: 12, color: COLORS.mutedBrown, marginTop: 2 }}>
          Listed by {place?.name}
        </Text>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
          {listing.energy_level ? <Chip label={`${listing.energy_level} energy`} /> : null}
          {listing.good_with_kids === true ? <Chip label="Good with kids" /> : null}
          {listing.good_with_cats === true ? <Chip label="Good with cats" /> : null}
          {listing.good_with_dogs === true ? <Chip label="Good with dogs" /> : null}
          {listing.vaccination_status ? (
            <Chip label={`Vaccines: ${listing.vaccination_status.replace(/_/g, " ")}`} />
          ) : null}
        </View>

        {listing.story ? (
          <Text style={{ fontSize: 15, color: COLORS.warmBrown, lineHeight: 22, marginTop: 16 }}>
            {listing.story}
          </Text>
        ) : null}

        <Text style={{ fontSize: 15, color: COLORS.coral, fontWeight: "800", marginTop: 16 }}>
          Adoption fee: {money(listing.adoption_fee_cents, listing.currency)}
        </Text>
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
