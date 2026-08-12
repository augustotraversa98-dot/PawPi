import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Image,
  Modal,
  Alert,
  Linking,
  ScrollView,
  Dimensions,
} from "react-native";
import { Video, ResizeMode } from "expo-av";
import {
  PawPrint,
  ChevronRight,
  X,
  MessageSquare,
  Check,
  MapPin,
} from "lucide-react-native";
import MapLocationView from "@/components/Map/MapLocationView";
import { COLORS } from "@/constants/colors";
import { TYPE, RADIUS, SPACING, MATERIALS, BLUR } from "@/constants/theme";
import { Card, PressableScale, GlassSurface } from "@/components/ui";
import { RefreshableScrollView } from "@/components/RefreshableScrollView";
import { ModerationMenu } from "@/components/moderation/ModerationMenu";
import {
  useApplyForAdoption,
  useStartThread,
  useAdoptionCheckout,
} from "@/hooks/useProviders";
import { isValidCoord } from "@/utils/walkBuddies";

// SHARED adoption listing views (ticket 2.97). The adoptable-dog card + the full detail/apply
// modal, extracted verbatim from the Adoption browse screen (app/service/adoption.jsx) so the
// SAME design + apply flow renders in BOTH the standalone browse AND the business storefront's
// Adoption tab. No parallel design — one implementation, imported by both surfaces.

export function money(cents, currency = "ARS") {
  if (cents == null) return "";
  if (cents === 0) return "Free";
  return `${currency} ${(cents / 100).toFixed(2)}`;
}

export function ageLabel(years, months) {
  const y = years || 0;
  const m = months || 0;
  if (!y && !m) return "Age unknown";
  const parts = [];
  if (y) parts.push(`${y}y`);
  if (m) parts.push(`${m}m`);
  return parts.join(" ");
}

export function Chip({ label }) {
  return (
    <View
      style={{
        backgroundColor: COLORS.coral + "14",
        borderRadius: RADIUS.chip,
        paddingHorizontal: SPACING.sm + 2,
        paddingVertical: 4,
      }}
    >
      <Text style={[TYPE.caption, { fontWeight: "700", color: COLORS.coral, letterSpacing: 0 }]}>{label}</Text>
    </View>
  );
}

// The dog-profile card (ticket 2.86): the cover photo on TOP, then — BELOW it, so the dog is fully
// visible (NOT overlaid) — the name, a basic-info row (age · size · gender), the distance, and a
// "See more" affordance. `grid` renders the compact half-width variant for the browse grid.
export function DogProfileCard({ listing, onPress, grid = false }) {
  const photo = Array.isArray(listing.photo_urls) ? listing.photo_urls[0] : null;
  const photoH = grid ? 140 : 180;
  const info = [ageLabel(listing.age_years, listing.age_months), listing.size, listing.gender]
    .filter(Boolean)
    .join(" · ");
  const km = listing.distance_km;
  return (
    <PressableScale onPress={onPress}>
      <Card
        level="sm"
        radius={grid ? RADIUS.md : RADIUS.card}
        borderColor={COLORS.peach}
        style={{ marginBottom: SPACING.md + 2, overflow: "hidden" }}
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
                top: SPACING.sm,
                left: SPACING.sm,
                backgroundColor: "#C2410C",
                borderRadius: RADIUS.chip,
                paddingHorizontal: SPACING.md - 2,
                paddingVertical: 4,
              }}
            >
              <Text style={[TYPE.caption, { color: "#fff", fontWeight: "800", letterSpacing: 0 }]}>URGENT</Text>
            </View>
          ) : null}
        </View>

        <View style={{ padding: grid ? SPACING.md : SPACING.lg }}>
          <Text
            style={[grid ? TYPE.headline : TYPE.title2, { color: COLORS.warmBrown }]}
            numberOfLines={1}
          >
            {listing.name}
          </Text>
          <Text style={[TYPE.footnote, { color: COLORS.mutedBrown, marginTop: 2 }]} numberOfLines={1}>
            {info || "Details inside"}
          </Text>
          {km != null ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: SPACING.sm }}>
              <MapPin size={12} color={COLORS.mutedBrown} />
              <Text style={[TYPE.footnote, { color: COLORS.mutedBrown }]}>
                {km < 1 ? "Less than 1 km away" : `${Math.round(km)} km away`}
              </Text>
            </View>
          ) : null}
          {!grid ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: SPACING.sm + 2 }}>
              {listing.placement_type === "foster" ? <Chip label="Foster" /> : null}
              {listing.placement_type === "both" ? <Chip label="Adopt or foster" /> : null}
              {listing.energy_level ? <Chip label={`${listing.energy_level} energy`} /> : null}
              {listing.good_with_kids === true ? <Chip label="Good with kids" /> : null}
            </View>
          ) : null}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: SPACING.sm + 2 }}>
            <Text style={[TYPE.footnote, { color: COLORS.coral, fontWeight: "700" }]} numberOfLines={1}>
              {money(listing.adoption_fee_cents, listing.currency)}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
              <Text style={[TYPE.footnote, { fontWeight: "700", color: COLORS.warmBrown }]}>See more</Text>
              <ChevronRight size={16} color={COLORS.warmBrown} />
            </View>
          </View>
        </View>
      </Card>
    </PressableScale>
  );
}

export function ListingDetailModal({ data, onClose, router }) {
  const listing = data?.listing;
  const place = data?.place;
  const apply = useApplyForAdoption();
  const { mutate: startThread, isPending: startingThread } = useStartThread();
  const checkout = useAdoptionCheckout();
  // Foster-vs-adopt intent (ticket 2.57) — only shown when the listing allows BOTH.
  const [placement, setPlacement] = useState("adopt");
  // Clear submitted/confirmation state (ticket 2.95): once the application posts, the CTA turns
  // into a persistent "Application sent" confirmation instead of re-arming for a duplicate apply.
  const [submitted, setSubmitted] = useState(false);

  // Reset the per-listing state whenever a different dog opens in the modal.
  useEffect(() => {
    setSubmitted(false);
    setPlacement("adopt");
  }, [listing?.id]);

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
      setSubmitted(true);
      Alert.alert(
        "Application sent",
        `The shelter will review your application for ${listing.name}. Track it under Applications, and you can chat with them anytime.`,
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
            <Text style={[TYPE.title2, { fontSize: 18, color: COLORS.warmBrown, flex: 1 }]} numberOfLines={1}>
              {listing.name}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.md }}>
              {/* Report this adoption listing (T4). */}
              <ModerationMenu targetType="adoption_listing" targetId={listing.id} iconSize={18} />
              <PressableScale onPress={onClose}>
                <X size={22} color={COLORS.warmBrown} />
              </PressableScale>
            </View>
          </GlassSurface>

          <RefreshableScrollView contentContainerStyle={{ paddingBottom: 40 }}>
            {listing.is_urgent ? (
              <View testID="detail-urgent" style={{ margin: SPACING.lg, marginBottom: 0, backgroundColor: "#C2410C", borderRadius: RADIUS.md - 4, padding: SPACING.md }}>
                <Text style={[TYPE.body, { color: "#fff", fontWeight: "800" }]}>
                  Urgent{listing.urgent_reason ? `: ${listing.urgent_reason}` : ""}
                </Text>
              </View>
            ) : null}

            <DogProfileDetail listing={listing} place={place} />

            <View style={{ padding: SPACING.lg, gap: SPACING.md }}>
              {/* Placement: shown only when the listing allows BOTH adopt + foster. */}
              {listing.placement_type === "both" ? (
                <View>
                  <Text style={[TYPE.body, { color: COLORS.mutedBrown, fontWeight: "700", marginBottom: SPACING.sm - 2 }]}>
                    I'd like to:
                  </Text>
                  <View style={{ flexDirection: "row", gap: SPACING.sm }}>
                    <PressableScale
                      testID="placement-adopt"
                      onPress={() => setPlacement("adopt")}
                      style={{ paddingHorizontal: SPACING.md + 2, paddingVertical: SPACING.sm, borderRadius: RADIUS.chip, borderWidth: 1, borderColor: placement === "adopt" ? COLORS.coral : COLORS.peach, backgroundColor: placement === "adopt" ? COLORS.coral + "18" : COLORS.card }}
                    >
                      <Text style={[TYPE.body, { color: placement === "adopt" ? COLORS.coral : COLORS.warmBrown, fontWeight: "700" }]}>Adopt</Text>
                    </PressableScale>
                    <PressableScale
                      testID="placement-foster"
                      onPress={() => setPlacement("foster")}
                      style={{ paddingHorizontal: SPACING.md + 2, paddingVertical: SPACING.sm, borderRadius: RADIUS.chip, borderWidth: 1, borderColor: placement === "foster" ? COLORS.coral : COLORS.peach, backgroundColor: placement === "foster" ? COLORS.coral + "18" : COLORS.card }}
                    >
                      <Text style={[TYPE.body, { color: placement === "foster" ? COLORS.coral : COLORS.warmBrown, fontWeight: "700" }]}>Foster</Text>
                    </PressableScale>
                  </View>
                </View>
              ) : listing.placement_type === "foster" ? (
                <Text testID="placement-foster-only" style={[TYPE.body, { color: COLORS.mutedBrown, fontWeight: "700" }]}>
                  This dog is available to foster.
                </Text>
              ) : null}

              {submitted ? (
                <View
                  testID="application-sent"
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: SPACING.sm,
                    backgroundColor: "#3FA34D" + "18",
                    borderWidth: 1,
                    borderColor: "#3FA34D",
                    borderRadius: RADIUS.control,
                    paddingVertical: 15,
                  }}
                >
                  <Check size={18} color="#3FA34D" />
                  <Text style={[TYPE.headline, { color: "#3FA34D" }]}>Application sent</Text>
                </View>
              ) : (
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
              )}
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
        <View style={{ flexDirection: "row", justifyContent: "center", gap: 6, marginTop: SPACING.sm }}>
          {items.map((it, i) => (
            <View
              key={i}
              style={{
                width: 7,
                height: 7,
                borderRadius: RADIUS.chip,
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
    <View style={{ width: "50%", paddingVertical: SPACING.sm - 2 }}>
      <Text style={[TYPE.caption, { color: COLORS.mutedBrown, textTransform: "uppercase" }]}>
        {label}
      </Text>
      <Text style={[TYPE.body, { color: COLORS.warmBrown, fontWeight: "600", marginTop: 2 }]}>
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
      <View style={{ padding: SPACING.lg }}>
        <Text style={[TYPE.title, { color: COLORS.warmBrown }]}>{listing.name}</Text>
        <Text style={[TYPE.footnote, { color: COLORS.mutedBrown, marginTop: 2 }]}>
          Listed by {listing.provider_name || place?.name}
        </Text>

        {/* Key facts — only the ones we actually know. */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: SPACING.md + 2 }}>
          <Fact label="Age" value={ageLabel(listing.age_years, listing.age_months) !== "Age unknown" ? ageLabel(listing.age_years, listing.age_months) : null} />
          <Fact label="Gender" value={listing.gender} />
          <Fact label="Size" value={listing.size} />
          <Fact label="Breed" value={listing.breed} />
          <Fact label="Vaccination" value={listing.vaccination_status ? listing.vaccination_status.replace(/_/g, " ") : null} />
          <Fact label="Adoption fee" value={money(listing.adoption_fee_cents, listing.currency)} />
        </View>

        {/* Compatibility chips. */}
        {(listing.energy_level || listing.good_with_kids === true || listing.good_with_cats === true || listing.good_with_dogs === true) ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: SPACING.md }}>
            {listing.energy_level ? <Chip label={`${listing.energy_level} energy`} /> : null}
            {listing.good_with_kids === true ? <Chip label="Good with kids" /> : null}
            {listing.good_with_cats === true ? <Chip label="Good with cats" /> : null}
            {listing.good_with_dogs === true ? <Chip label="Good with dogs" /> : null}
          </View>
        ) : null}

        {listing.story ? (
          <>
            <Text style={[TYPE.headline, { color: COLORS.warmBrown, marginTop: SPACING.xl, marginBottom: SPACING.sm - 2 }]}>
              {listing.name}'s story
            </Text>
            <Text style={[TYPE.body, { color: COLORS.warmBrown, lineHeight: 22 }]}>
              {listing.story}
            </Text>
          </>
        ) : null}

        {/* Shelter card — name + a map of its location (ticket 2.68 MapLocationView) when known. */}
        <Text style={[TYPE.headline, { color: COLORS.warmBrown, marginTop: SPACING.xl, marginBottom: SPACING.sm }]}>
          Shelter
        </Text>
        <Card level="sm" radius={RADIUS.card} borderColor={COLORS.peach} style={{ padding: SPACING.md + 2 }}>
          <Text style={[TYPE.body, { fontWeight: "700", color: COLORS.warmBrown }]}>
            {listing.provider_name || place?.name}
          </Text>
          {shelterAddr ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
              <MapPin size={13} color={COLORS.mutedBrown} />
              <Text style={[TYPE.subhead, { color: COLORS.mutedBrown, fontWeight: "500", flex: 1 }]}>{shelterAddr}</Text>
            </View>
          ) : null}
          {hasCoord ? (
            <View style={{ marginTop: SPACING.sm + 2 }}>
              <MapLocationView
                testID="shelter-map"
                points={{ lat: listing.provider_lat, lng: listing.provider_lng }}
                height={160}
              />
            </View>
          ) : null}
        </Card>
      </View>
    </View>
  );
}

function PrimaryButton({ label, onPress, disabled }) {
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      style={{
        backgroundColor: COLORS.coral,
        borderRadius: RADIUS.control,
        paddingVertical: 15,
        alignItems: "center",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <Text style={[TYPE.headline, { color: "#FFF" }]}>{label}</Text>
    </PressableScale>
  );
}

function SecondaryButton({ label, icon: Icon, onPress, disabled }) {
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      style={{
        backgroundColor: COLORS.card,
        borderRadius: RADIUS.control,
        paddingVertical: 14,
        alignItems: "center",
        flexDirection: "row",
        justifyContent: "center",
        gap: SPACING.sm,
        borderWidth: 1,
        borderColor: COLORS.peach,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {Icon ? <Icon size={18} color={COLORS.coral} /> : null}
      <Text style={[TYPE.body, { color: COLORS.coral, fontWeight: "800" }]}>{label}</Text>
    </PressableScale>
  );
}
