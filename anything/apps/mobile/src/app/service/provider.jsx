import React, { useState } from "react";
import {
  View,
  Text,
  Image,
  ActivityIndicator,
  Linking,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  Stethoscope,
  MapPin,
  Phone,
  Clock,
  Calendar,
  Star,
  MessageSquare,
  Globe,
  Instagram,
  Facebook,
  Map,
  ShoppingBag,
} from "lucide-react-native";
import { COLORS } from "@/constants/colors";
import {
  TYPE,
  RADIUS,
  SPACING,
  MATERIALS,
  BLUR,
} from "@/constants/theme";
import { Card, PressableScale, GlassSurface } from "@/components/ui";
import { RefreshableScrollView } from "@/components/RefreshableScrollView";
import {
  useProviderProfile,
  useProviderReviews,
  useStartThread,
  useMyBookings,
} from "@/hooks/useProviders";
import BookingFormModal from "@/components/Providers/BookingFormModal";
import WriteReviewModal from "@/components/Providers/WriteReviewModal";
import RatingBadge from "@/components/Providers/RatingBadge";
import StorefrontCatalog from "@/components/Providers/StorefrontCatalog";
import { ModerationMenu } from "@/components/moderation/ModerationMenu";
import { useCurrentPet } from "@/hooks/usePetProfile";
import { formatMoney } from "@/utils/money";

// Storefront primary-action buckets (Services Hub P4a). A provider's capabilities[] (from
// the public profile) decide the primary action: a SHOP (shop/pharmacy or any products)
// leads with the store; a BOOKable capability leads with Book; a provider with both shows
// both. provider_type is display-only and never gates this.
const BOOKABLE_CAPS = [
  "vet",
  "groomer",
  "telehealth",
  "walker",
  "sitter",
  "daycare",
  "trainer",
];
const SHOP_CAPS = ["shop", "pharmacy"];

// Shared formatter (src/utils/money.js) so a price never renders as one currency
// here and another in the Shop. Services carry no currency column → default ARS;
// products pass their own currency.
function formatPrice(cents, currency) {
  return formatMoney(cents, currency);
}

// A published provider's public profile + a "Book appointment" CTA. Receives the
// provider slug as a route param; reads it via useProviderProfile (404 → friendly
// not-found). The booking form posts for the active pet.
export default function ProviderScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const { slug, capability } = useLocalSearchParams();
  const slugStr = Array.isArray(slug) ? slug[0] : slug;
  // Optional capability the owner is booking FOR (ticket 2.6: grooming passes
  // capability='groomer'). Threaded into the shared BookingFormModal so it books the
  // right service (2.4 generalized booking). Absent (e.g. from vet discovery) → the
  // modal falls back to the provider's primary type / 'vet', unchanged.
  const capabilityStr = Array.isArray(capability) ? capability[0] : capability;

  const { data, isLoading, isError, refetch } = useProviderProfile(slugStr);
  const [showBooking, setShowBooking] = useState(false);
  const [showCatalog, setShowCatalog] = useState(false); // in-storefront shop (P4a)
  const [showCapChooser, setShowCapChooser] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [bookingCapability, setBookingCapability] = useState(null);
  const { mutate: startThread, isPending: startingThread } = useStartThread();
  const { data: currentPet } = useCurrentPet();
  const petId = currentPet?.id;

  const provider = data?.provider;
  const locations = data?.locations ?? [];
  const services = data?.services ?? [];
  // Storefront sections (ticket 2.22): the provider's shop items + posts feed.
  const products = data?.products ?? [];
  const posts = data?.posts ?? [];
  // Capabilities drive the per-type primary action (P4a). The public profile already
  // returns them; before P4a this screen ignored them.
  const capabilities = data?.capabilities ?? [];

  // Per-type primary action. A SHOP if it holds a shop/pharmacy capability OR lists any
  // products; BOOKable capabilities show Book. A pure shop hides Book; a provider with no
  // known capability still shows Book (the pre-P4a fallback, unchanged).
  const bookableCaps = capabilities.filter((c) => BOOKABLE_CAPS.includes(c));
  const isShop =
    capabilities.some((c) => SHOP_CAPS.includes(c)) || products.length > 0;
  const showShop = isShop;
  const showBook = bookableCaps.length > 0 || !isShop;

  // The capability a booking is FOR: an explicit deep-link param wins; else the sole
  // bookable capability; else chosen from the chooser. Fixes the book/route 'vet' default
  // gotcha — a grooming-only provider books as 'groomer', telehealth as 'telehealth'.
  const resolvedBookingCapability =
    bookingCapability ??
    capabilityStr ??
    (bookableCaps.length === 1 ? bookableCaps[0] : undefined);

  const openBooking = () => {
    // Multiple bookable capabilities and none preselected → ask which one first.
    if (!bookingCapability && !capabilityStr && bookableCaps.length > 1) {
      setShowCapChooser(true);
    } else {
      setShowBooking(true);
    }
  };
  const pickBookingCapability = (cap) => {
    setBookingCapability(cap);
    setShowCapChooser(false);
    setShowBooking(true);
  };

  // Reviews for this provider (ticket 2.2). Keyed by id once the profile resolves.
  const { data: reviews } = useProviderReviews(provider?.id);
  const reviewList = reviews ?? [];

  // "Leave a review" entry point: shown ONLY when the signed-in owner has a COMPLETED booking
  // with THIS provider (from the owner's own past bookings). The backend still enforces the
  // completed-booking + one-per-booking gate — this is just the storefront entry point. The
  // booking supplies the pet the review is filed under. String-compare the ids (porsager may
  // surface either as a string).
  const { data: myBookings } = useMyBookings();
  const eligibleReviewBooking = (myBookings?.past ?? []).find(
    (b) =>
      provider?.id != null &&
      String(b.provider_id) === String(provider.id) &&
      b.status === "completed",
  );

  // "from" price for the Book CTA so cost is visible without scrolling to the
  // Services section (conversion). Cheapest priced service; null → no teaser.
  const servicePrices = services
    .map((s) => s.price_cents)
    .filter((c) => c != null);
  const fromPrice = servicePrices.length ? Math.min(...servicePrices) : null;
  const avgRating = provider?.avg_rating;
  const reviewCount = provider?.review_count ?? 0;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
      <GlassSurface
        intensity={BLUR.thick}
        style={{
          borderBottomWidth: 1,
          borderColor: MATERIALS.glassBorder,
        }}
        contentStyle={{
          paddingTop: insets.top,
          paddingHorizontal: SPACING.xl,
          paddingBottom: SPACING.md,
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <PressableScale
          onPress={() => router.back()}
          style={{ marginRight: SPACING.md }}
        >
          <ArrowLeft size={22} color={COLORS.warmBrown} />
        </PressableScale>
        <Text style={[TYPE.title2, { color: COLORS.warmBrown }]}>
          {provider?.name || "Provider"}
        </Text>
      </GlassSurface>

      {isLoading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator color={COLORS.coral} />
        </View>
      ) : isError || !provider ? (
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            padding: SPACING.xxxl,
          }}
        >
          <Stethoscope size={32} color={COLORS.mutedBrown} />
          <Text
            style={[TYPE.headline, { color: COLORS.warmBrown, marginTop: SPACING.md }]}
          >
            Provider not found
          </Text>
          <Text
            style={[
              TYPE.subhead,
              {
                color: COLORS.mutedBrown,
                fontWeight: "500",
                marginTop: 6,
                textAlign: "center",
              },
            ]}
          >
            This provider isn't available right now.
          </Text>
        </View>
      ) : (
        <RefreshableScrollView
          refetch={refetch}
          contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 120 }}
        >
          {/* Storefront cover banner (ticket 2.22) — only when set. */}
          {provider.cover_image_url ? (
            <Image
              testID="storefront-cover"
              source={{ uri: provider.cover_image_url }}
              style={{
                width: "100%",
                height: 140,
                borderRadius: RADIUS.card,
                marginBottom: SPACING.md + 2,
                backgroundColor: COLORS.sand,
              }}
            />
          ) : null}

          {/* Header card */}
          <Card
            level="md"
            radius={RADIUS.card}
            style={{
              padding: SPACING.lg + 2,
              marginBottom: SPACING.lg,
              flexDirection: "row",
              gap: SPACING.md + 2,
              alignItems: "center",
            }}
          >
            {provider.logo_url ? (
              <Image
                source={{ uri: provider.logo_url }}
                style={{ width: 60, height: 60, borderRadius: RADIUS.control, backgroundColor: COLORS.sand }}
              />
            ) : (
              <View
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: RADIUS.control,
                  backgroundColor: COLORS.sand,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Stethoscope size={28} color={COLORS.coral} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={[TYPE.title2, { fontSize: 19, lineHeight: 24, color: COLORS.warmBrown }]}>
                {provider.name}
              </Text>
              {/* Capability chips (P4a) — one per capability the provider holds; falls back
                  to the display-only provider_type label when capabilities aren't set. */}
              {capabilities.length > 0 ? (
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: SPACING.xs,
                    marginTop: 4,
                  }}
                >
                  {capabilities.map((c) => (
                    <View
                      key={c}
                      testID={`provider-cap-${c}`}
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
              ) : provider.provider_type ? (
                <Text
                  style={[
                    TYPE.footnote,
                    {
                      fontWeight: "700",
                      color: COLORS.coral,
                      marginTop: 2,
                      textTransform: "capitalize",
                    },
                  ]}
                >
                  {provider.provider_type}
                </Text>
              ) : null}
              <View style={{ marginTop: 6 }}>
                <RatingBadge
                  avgRating={provider.avg_rating}
                  reviewCount={provider.review_count}
                  size="lg"
                />
              </View>
            </View>
          </Card>

          {provider.bio ? (
            <Text
              style={[
                TYPE.callout,
                {
                  color: COLORS.mutedBrown,
                  lineHeight: 20,
                  marginBottom: SPACING.lg + 2,
                },
              ]}
            >
              {provider.bio}
            </Text>
          ) : null}

          {/* Public business links (ticket 2.20) — tappable; only rendered when present. */}
          <ProviderLinks provider={provider} />

          {/* Locations */}
          {locations.length > 0 && (
            <Section title="Locations">
              {locations.map((l) => (
                <Card
                  key={l.id}
                  level="sm"
                  radius={RADIUS.md}
                  style={{ padding: SPACING.md + 2, marginBottom: SPACING.sm + 2 }}
                >
                  <Text
                    style={[TYPE.headline, { color: COLORS.warmBrown }]}
                  >
                    {l.name}
                  </Text>
                  {l.address ? (
                    <Row icon={<MapPin size={13} color={COLORS.mutedBrown} />}>
                      {l.address}
                    </Row>
                  ) : null}
                  {l.phone ? (
                    <Row icon={<Phone size={13} color={COLORS.mutedBrown} />}>
                      {l.phone}
                    </Row>
                  ) : null}
                </Card>
              ))}
            </Section>
          )}

          {/* Services */}
          {services.length > 0 && (
            <Section title="Services">
              {services.map((s) => (
                <Card
                  key={s.id}
                  level="sm"
                  radius={RADIUS.md}
                  style={{ padding: SPACING.md + 2, marginBottom: SPACING.sm + 2 }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <Text
                      style={[TYPE.headline, { color: COLORS.warmBrown, flex: 1 }]}
                    >
                      {s.name}
                    </Text>
                    {formatPrice(s.price_cents) ? (
                      <Text
                        style={[TYPE.headline, { color: COLORS.coral }]}
                      >
                        {formatPrice(s.price_cents)}
                      </Text>
                    ) : null}
                  </View>
                  {s.description ? (
                    <Text style={[TYPE.subhead, { color: COLORS.mutedBrown, fontWeight: "500", marginTop: 4 }]}>
                      {s.description}
                    </Text>
                  ) : null}
                  {s.duration_min ? (
                    <Row icon={<Clock size={13} color={COLORS.mutedBrown} />}>
                      {`${s.duration_min} min`}
                    </Row>
                  ) : null}
                  {Array.isArray(s.image_urls) && s.image_urls.length > 0 ? (
                    <View
                      style={{
                        flexDirection: "row",
                        flexWrap: "wrap",
                        gap: SPACING.sm,
                        marginTop: SPACING.sm + 2,
                      }}
                    >
                      {s.image_urls.map((uri, i) => (
                        <Image
                          key={`${s.id}-img-${i}`}
                          testID="service-image"
                          source={{ uri }}
                          style={{
                            width: 72,
                            height: 72,
                            borderRadius: RADIUS.control,
                            backgroundColor: COLORS.sand,
                          }}
                        />
                      ))}
                    </View>
                  ) : null}
                </Card>
              ))}
            </Section>
          )}

          {/* Items (ticket 2.22 / P4a) — the provider's shop catalog summary. Tapping any
              item opens the IN-STOREFRONT catalog (StorefrontCatalog) for this provider,
              reusing the existing cart + checkout — no separate Shop screen hop. */}
          {products.length > 0 && (
            <Section title="Items">
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: SPACING.sm + 2,
                }}
              >
                {products.map((p) => (
                  <PressableScale
                    key={p.id}
                    testID="storefront-item"
                    onPress={() => setShowCatalog(true)}
                    style={{
                      width: "47%",
                      backgroundColor: COLORS.card,
                      borderRadius: RADIUS.md,
                      padding: SPACING.sm + 2,
                      borderWidth: 1,
                      borderColor: COLORS.peach,
                    }}
                  >
                    {Array.isArray(p.image_urls) && p.image_urls[0] ? (
                      <Image
                        source={{ uri: p.image_urls[0] }}
                        style={{
                          width: "100%",
                          height: 90,
                          borderRadius: RADIUS.control,
                          backgroundColor: COLORS.sand,
                        }}
                      />
                    ) : (
                      <View
                        style={{
                          width: "100%",
                          height: 90,
                          borderRadius: RADIUS.control,
                          backgroundColor: COLORS.sand,
                          justifyContent: "center",
                          alignItems: "center",
                        }}
                      >
                        <ShoppingBag size={22} color={COLORS.coral} />
                      </View>
                    )}
                    <Text
                      numberOfLines={1}
                      style={[
                        TYPE.subhead,
                        { fontWeight: "800", color: COLORS.warmBrown, marginTop: 6 },
                      ]}
                    >
                      {p.name}
                    </Text>
                    {formatPrice(p.price_cents, p.currency) ? (
                      <Text
                        style={[TYPE.subhead, { fontWeight: "800", color: COLORS.coral }]}
                      >
                        {formatPrice(p.price_cents, p.currency)}
                      </Text>
                    ) : null}
                  </PressableScale>
                ))}
              </View>
            </Section>
          )}

          {/* Posts (ticket 2.22) — the provider's storefront feed; newest first. */}
          {posts.length > 0 && (
            <Section title="Posts">
              {posts.map((post) => (
                <Card
                  key={post.id}
                  testID="storefront-post"
                  level="sm"
                  radius={RADIUS.md}
                  style={{ padding: SPACING.md + 2, marginBottom: SPACING.sm + 2 }}
                >
                  {/* Body + Report/Block menu (Guideline 1.2) — the menu hides Report on
                      the staff author's own post (is_own); non-owners can Report + Block. */}
                  <View style={{ flexDirection: "row", alignItems: "flex-start", gap: SPACING.sm }}>
                    {post.body ? (
                      <Text
                        style={[
                          TYPE.callout,
                          { flex: 1, color: COLORS.warmBrown, lineHeight: 20 },
                        ]}
                      >
                        {post.body}
                      </Text>
                    ) : (
                      <View style={{ flex: 1 }} />
                    )}
                    <ModerationMenu
                      targetType="provider_post"
                      targetId={post.id}
                      authorUserId={post.author_user_id}
                      isOwn={!!post.is_own}
                      iconSize={18}
                    />
                  </View>
                  {Array.isArray(post.image_urls) && post.image_urls.length > 0 ? (
                    <View
                      style={{
                        flexDirection: "row",
                        flexWrap: "wrap",
                        gap: SPACING.sm,
                        // The body row above is always rendered now (it carries the
                        // moderation menu even when there is no body), so this margin is
                        // unconditional — SPACING.sm + 2 is the same 10pt as before.
                        marginTop: SPACING.sm + 2,
                      }}
                    >
                      {post.image_urls.map((uri, i) => (
                        <Image
                          key={`${post.id}-img-${i}`}
                          testID="storefront-post-image"
                          source={{ uri }}
                          style={{
                            width: 96,
                            height: 96,
                            borderRadius: RADIUS.control,
                            backgroundColor: COLORS.sand,
                          }}
                        />
                      ))}
                    </View>
                  ) : null}
                </Card>
              ))}
            </Section>
          )}

          {/* Reviews (ticket 2.2) — real data; empty state when none. */}
          <Section title="Reviews">
            {/* Owner entry point to leave a review — only with a completed booking here. */}
            {eligibleReviewBooking ? (
              <PressableScale
                testID="storefront-review-cta"
                onPress={() => setShowReview(true)}
                accessibilityRole="button"
                accessibilityLabel={t("storefront.leaveReview")}
                style={{
                  backgroundColor: COLORS.coral,
                  borderRadius: RADIUS.control,
                  padding: SPACING.md + 2,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: SPACING.sm,
                  marginBottom: SPACING.md,
                }}
              >
                <Star size={18} color="#FFF" fill="#FFF" />
                <Text style={[TYPE.headline, { color: "#FFF", fontWeight: "800" }]}>
                  {t("storefront.leaveReview")}
                </Text>
              </PressableScale>
            ) : null}
            {reviewList.length === 0 ? (
              <Card
                level="sm"
                radius={RADIUS.md}
                style={{ padding: SPACING.lg }}
              >
                <Text style={[TYPE.subhead, { color: COLORS.mutedBrown, fontWeight: "500" }]}>
                  No reviews yet. After a completed appointment you can be the
                  first to leave one.
                </Text>
              </Card>
            ) : (
              reviewList.map((rv) => <ReviewCard key={rv.id} review={rv} />)
            )}
          </Section>
        </RefreshableScrollView>
      )}

      {/* Primary CTAs: Message (secondary) + Book (primary). A trust strip pins the
          rating + "from" price so social proof and cost stay visible without
          scrolling back up (conversion quick wins). */}
      {provider && (
        <View
          style={{
            paddingTop: SPACING.md,
            paddingHorizontal: SPACING.lg,
            paddingBottom: insets.bottom + SPACING.lg,
            borderTopWidth: 1,
            borderTopColor: COLORS.peach,
            backgroundColor: COLORS.card,
          }}
        >
          {(avgRating != null || fromPrice != null) && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: SPACING.md,
              }}
            >
              {avgRating != null ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Star size={15} color={COLORS.coral} fill={COLORS.coral} />
                  <Text style={[TYPE.subhead, { fontWeight: "800", color: COLORS.warmBrown }]}>
                    {Number(avgRating).toFixed(1)}
                  </Text>
                  <Text style={[TYPE.footnote, { color: COLORS.mutedBrown }]}>
                    {reviewCount === 1
                      ? t("providers.reviewsOne")
                      : t("providers.reviewsOther", { count: reviewCount })}
                  </Text>
                </View>
              ) : (
                <View />
              )}
              {fromPrice != null ? (
                <Text style={[TYPE.footnote, { color: COLORS.mutedBrown, fontWeight: "600" }]}>
                  {t("providers.fromPrice", { price: formatPrice(fromPrice) })}
                </Text>
              ) : null}
            </View>
          )}

          <View style={{ flexDirection: "row", gap: SPACING.md }}>
            {/* Message (secondary, icon) */}
            <PressableScale
              onPress={() => {
                if (startingThread) return;
                startThread(
                  { providerId: provider.id },
                  {
                    onSuccess: (res) => {
                      const thread = res?.thread;
                      if (!thread) return;
                      router.push({
                        pathname: "/provider-chat",
                        params: {
                          threadId: String(thread.id),
                          providerName: provider.name || "Provider",
                          ownerUserId: String(thread.owner_user_id),
                        },
                      });
                    },
                  },
                );
              }}
              accessibilityRole="button"
              accessibilityLabel={t("providers.messageA11y")}
              style={{
                width: 56,
                backgroundColor: COLORS.sand,
                borderRadius: RADIUS.control,
                padding: SPACING.lg,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: COLORS.peach,
              }}
            >
              {startingThread ? (
                <ActivityIndicator size="small" color={COLORS.coral} />
              ) : (
                <MessageSquare size={20} color={COLORS.coral} />
              )}
            </PressableScale>

            {/* Shop — primary when the store is the main action, secondary alongside Book. */}
            {showShop ? (
              <PressableScale
                testID="storefront-shop-cta"
                onPress={() => setShowCatalog(true)}
                accessibilityRole="button"
                accessibilityLabel={t("storefront.shop")}
                style={{
                  flex: 1,
                  backgroundColor: showBook ? COLORS.sand : COLORS.coral,
                  borderRadius: RADIUS.control,
                  padding: SPACING.lg,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: SPACING.sm,
                  borderWidth: showBook ? 1 : 0,
                  borderColor: COLORS.peach,
                }}
              >
                <ShoppingBag size={18} color={showBook ? COLORS.coral : "#FFF"} />
                <Text
                  style={[
                    TYPE.headline,
                    { color: showBook ? COLORS.coral : "#FFF", fontWeight: "800" },
                  ]}
                >
                  {t("storefront.shop")}
                </Text>
              </PressableScale>
            ) : null}

            {/* Book — capability-aware (opens the chooser first when there are several). */}
            {showBook ? (
              <PressableScale
                testID="storefront-book-cta"
                onPress={openBooking}
                accessibilityRole="button"
                accessibilityLabel={
                  fromPrice != null
                    ? t("providers.bookFromA11y", { price: formatPrice(fromPrice) })
                    : t("providers.bookA11y")
                }
                style={{
                  flex: showShop ? 1 : 2,
                  backgroundColor: COLORS.coral,
                  borderRadius: RADIUS.control,
                  padding: SPACING.lg,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: SPACING.sm,
                }}
              >
                <Calendar size={18} color="#FFF" />
                <Text style={[TYPE.headline, { color: "#FFF", fontWeight: "800" }]}>
                  {fromPrice != null && !showShop
                    ? t("providers.bookFromPrice", { price: formatPrice(fromPrice) })
                    : t("providers.book")}
                </Text>
              </PressableScale>
            ) : null}
          </View>
        </View>
      )}

      <BookingFormModal
        visible={showBooking}
        onClose={() => setShowBooking(false)}
        provider={provider}
        locations={locations}
        services={services}
        capability={resolvedBookingCapability}
      />

      {/* In-storefront shop (P4a): the SAME cart + checkout the Shop screen uses. */}
      <StorefrontCatalog
        shop={showCatalog ? provider : null}
        petId={petId}
        onClose={() => setShowCatalog(false)}
      />

      {/* Leave-a-review — reuses the shared modal; opened only from the eligible CTA above. */}
      <WriteReviewModal
        visible={showReview}
        onClose={() => setShowReview(false)}
        providerId={provider?.id}
        providerName={provider?.name}
        petId={eligibleReviewBooking?.pet_id}
      />

      {/* Capability chooser — only when a provider offers several bookable services and
          none was preselected, so the booking is filed under the RIGHT capability. */}
      <Modal
        visible={showCapChooser}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCapChooser(false)}
      >
        <PressableScale
          onPress={() => setShowCapChooser(false)}
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.35)",
            justifyContent: "flex-end",
          }}
        >
          <View
            style={{
              backgroundColor: COLORS.cream,
              borderTopLeftRadius: RADIUS.card,
              borderTopRightRadius: RADIUS.card,
              padding: SPACING.lg,
              paddingBottom: insets.bottom + SPACING.lg,
            }}
          >
            <Text
              style={[
                TYPE.headline,
                { color: COLORS.warmBrown, fontWeight: "800", marginBottom: SPACING.md },
              ]}
            >
              {t("storefront.chooseServiceTitle")}
            </Text>
            {bookableCaps.map((cap) => (
              <PressableScale
                key={cap}
                testID={`storefront-cap-choose-${cap}`}
                onPress={() => pickBookingCapability(cap)}
                style={{
                  paddingVertical: SPACING.md + 2,
                  paddingHorizontal: SPACING.lg,
                  borderRadius: RADIUS.control,
                  backgroundColor: COLORS.card,
                  borderWidth: 1,
                  borderColor: COLORS.peach,
                  marginBottom: SPACING.sm + 2,
                }}
              >
                <Text style={[TYPE.headline, { color: COLORS.warmBrown, fontWeight: "700" }]}>
                  {t(`discover.cap.${cap}`)}
                </Text>
              </PressableScale>
            ))}
          </View>
        </PressableScale>
      </Modal>
    </View>
  );
}

function Section({ title, children }) {
  return (
    <View style={{ marginBottom: SPACING.lg + 2 }}>
      <Text
        style={[
          TYPE.subhead,
          {
            fontWeight: "800",
            color: COLORS.mutedBrown,
            marginBottom: SPACING.md,
            letterSpacing: 0.6,
          },
        ]}
      >
        {title.toUpperCase()}
      </Text>
      {children}
    </View>
  );
}

function ReviewCard({ review }) {
  const date = review.created_at
    ? new Date(review.created_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;
  return (
    <Card
      level="sm"
      radius={RADIUS.md}
      style={{ padding: SPACING.md + 2, marginBottom: SPACING.sm + 2 }}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Text
          style={[TYPE.headline, { color: COLORS.warmBrown, flex: 1 }]}
          numberOfLines={1}
        >
          {review.reviewer_name || "Pet parent"}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
          <Star size={13} color={COLORS.coral} fill={COLORS.coral} />
          <Text style={[TYPE.subhead, { fontWeight: "800", color: COLORS.warmBrown }]}>
            {review.rating}
          </Text>
          {/* Report this review (T4). */}
          <ModerationMenu targetType="review" targetId={review.id} iconSize={15} />
        </View>
      </View>
      {review.pet_name ? (
        <Text style={[TYPE.footnote, { color: COLORS.coral, fontWeight: "700", marginTop: 2 }]}>
          with {review.pet_name}
        </Text>
      ) : null}
      {review.body ? (
        <Text style={[TYPE.subhead, { color: COLORS.mutedBrown, fontWeight: "500", marginTop: 6, lineHeight: 19 }]}>
          {review.body}
        </Text>
      ) : null}
      {date ? (
        <Text style={[TYPE.caption, { color: COLORS.mutedBrown, fontWeight: "500", letterSpacing: 0, marginTop: 6 }]}>
          {date}
        </Text>
      ) : null}
    </Card>
  );
}

function Row({ icon, children }) {
  return (
    <View
      style={{ flexDirection: "row", alignItems: "center", marginTop: 6, gap: 6 }}
    >
      {icon}
      <Text style={[TYPE.subhead, { color: COLORS.mutedBrown, fontWeight: "500", flex: 1 }]}>
        {children}
      </Text>
    </View>
  );
}

// Public business links (ticket 2.20). Renders only the links that exist (no fake/empty
// rows); each opens externally via Linking. The provider profile is public, so these are
// safe to surface read-only.
function ProviderLinks({ provider }) {
  const links = [
    { url: provider?.website_url, label: "Website", Icon: Globe },
    { url: provider?.instagram_url, label: "Instagram", Icon: Instagram },
    { url: provider?.facebook_url, label: "Facebook", Icon: Facebook },
    { url: provider?.google_maps_url, label: "Google Maps", Icon: Map },
  ].filter((l) => typeof l.url === "string" && l.url.trim().length > 0);

  if (links.length === 0) return null;

  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm + 2, marginBottom: SPACING.lg + 2 }}>
      {links.map(({ url, label, Icon }) => (
        <PressableScale
          key={label}
          onPress={() => Linking.openURL(url.trim())}
          accessibilityRole="link"
          accessibilityLabel={label}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            backgroundColor: COLORS.sand,
            borderRadius: RADIUS.chip,
            paddingHorizontal: SPACING.md,
            paddingVertical: 7,
            borderWidth: 1,
            borderColor: COLORS.peach,
          }}
        >
          <Icon size={15} color={COLORS.coral} />
          <Text style={[TYPE.subhead, { fontWeight: "700", color: COLORS.warmBrown }]}>
            {label}
          </Text>
        </PressableScale>
      ))}
    </View>
  );
}
