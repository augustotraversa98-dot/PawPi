import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  Image,
  ActivityIndicator,
  ScrollView,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  Stethoscope,
  Calendar,
  MessageSquare,
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
import { PressableScale, GlassSurface } from "@/components/ui";
import { RefreshableScrollView } from "@/components/RefreshableScrollView";
import {
  useProviderProfile,
  useProviderReviews,
  useStartThread,
  useMyBookings,
  useShopOrders,
  useAdoptableBrowse,
} from "@/hooks/useProviders";
// Shared adoption listing views (ticket 2.97) — the SAME card + detail/apply modal the standalone
// Adoption browse uses, so the storefront's Adoption tab reuses one implementation.
import {
  DogProfileCard,
  ListingDetailModal,
} from "@/components/adoption/AdoptionListingViews";
import BookingFormModal from "@/components/Providers/BookingFormModal";
import WriteReviewModal from "@/components/Providers/WriteReviewModal";
import StoreHeader from "@/components/Providers/StorefrontPanels/StoreHeader";
import ProviderFollowButton from "@/components/Providers/ProviderFollowButton";
import BusinessStatRow from "@/components/Providers/StorefrontPanels/BusinessStatRow";
import ServicesPanel from "@/components/Providers/StorefrontPanels/ServicesPanel";
import StorefrontBrowse from "@/components/Providers/StorefrontPanels/StorefrontBrowse";
import ProductDetail from "@/components/Providers/StorefrontPanels/ProductDetail";
import {
  StorefrontCartBar,
  StorefrontCheckoutSheet,
} from "@/components/Providers/StorefrontPanels/StorefrontCheckout";
import PostsPanel from "@/components/Providers/StorefrontPanels/PostsPanel";
import ReviewsPanel from "@/components/Providers/StorefrontPanels/ReviewsPanel";
import LocationsPanel from "@/components/Providers/StorefrontPanels/LocationsPanel";
import AboutPanel from "@/components/Providers/StorefrontPanels/AboutPanel";
import { getStorefrontTabs } from "@/constants/storefrontTabs";
import { deriveOpenNow } from "@/utils/providerHours";
import { useStorefrontCart } from "@/hooks/useStorefrontCart";
import { useCurrentPet } from "@/hooks/usePetProfile";
import { formatMoney } from "@/utils/money";
import { LinearGradient } from "expo-linear-gradient";

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
//
// Storefront shell (redesign Phase 1): a hero cover → sticky StoreHeader (name + tappable
// rating that jumps to Reviews) → horizontal tab bar → the active tab's panel. The tab set
// is resolved per provider type by getStorefrontTabs. Inactive panels are MOUNTED but hidden
// (display:none), never unmounted, so every section is always in the tree. The pinned bottom
// action bar + the capability→CTA logic below are unchanged from the pre-shell screen.
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
  const [detailId, setDetailId] = useState(null); // inline storefront product detail (P4b/3b)
  const [showCapChooser, setShowCapChooser] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [bookingCapability, setBookingCapability] = useState(null);
  // The service the user tapped in the storefront (feat/tap-service-to-book). Non-null →
  // BookingFormModal opens with it preselected and the service selector collapsed. Cleared
  // on modal close and whenever the no-preselection bottom "Book" button is used.
  const [preselectedService, setPreselectedService] = useState(null);
  const [activeTab, setActiveTab] = useState(null); // storefront shell active tab key
  const [openAdoptionListing, setOpenAdoptionListing] = useState(null); // { listing, place }
  const { mutate: startThread, isPending: startingThread } = useStartThread();
  const { data: currentPet } = useCurrentPet();
  const petId = currentPet?.id;

  const provider = data?.provider;
  const locations = data?.locations ?? [];
  const services = data?.services ?? [];
  // Storefront sections (ticket 2.22): the provider's shop items + posts feed.
  const products = data?.products ?? [];
  const posts = data?.posts ?? [];
  // Social stats (ticket 2.93) — { postsCount, pawsCount, barksCount } from the public profile
  // payload. Followers is read live by BusinessStatRow (shared follow query). Paws stays 0 until
  // the 2.94 paw table exists (the server degrades a missing table to 0).
  const stats = data?.stats;
  // Capabilities drive the per-type primary action (P4a). The public profile already
  // returns them; before P4a this screen ignored them.
  const capabilities = data?.capabilities ?? [];

  // Adoption tab (ticket 2.97): a business with the `adoption` capability shows its adoptable dogs
  // right on its storefront, reusing the browse card + detail/apply design. Fetched via the SAME
  // public browse endpoint (GET /api/adoption/listings?provider_id=), gated to adoption-capable
  // providers so a non-shelter never makes the extra call. Empty → the tab isn't shown (below).
  const hasAdoptionCap = capabilities.includes("adoption");
  const adoptionEnabled = hasAdoptionCap && provider?.id != null;
  const { data: adoptionData, refetch: refetchAdoption } = useAdoptableBrowse(
    { provider_id: provider?.id ?? null },
    { enabled: adoptionEnabled },
  );
  const adoptionListings = adoptionData?.listings ?? [];

  // Per-type primary action. A SHOP if it holds a shop/pharmacy capability OR lists any
  // products; BOOKable capabilities show Book. A pure shop hides Book; a provider with no
  // known capability still shows Book (the pre-P4a fallback, unchanged).
  const bookableCaps = capabilities.filter((c) => BOOKABLE_CAPS.includes(c));
  const isShop =
    capabilities.some((c) => SHOP_CAPS.includes(c)) || products.length > 0;
  const showShop = isShop;
  const showBook = bookableCaps.length > 0 || !isShop;
  // The pinned bottom bar only holds Shop/Book now (the trust strip was removed, ticket 2.93).
  // It renders ONLY when there's a CTA to show — a shop, or a bookable provider with zero services
  // (booking otherwise lives on each service card) — so a bookable-with-services provider (e.g.
  // Northside) gets no empty bar.
  const hasBottomCta = showShop || (showBook && services.length === 0);

  // Screen-level shared cart (PR-3a seam): the Items tab IS the store — an inline browse grid,
  // a quick "+" add, a cart bar + checkout sheet, and tap-card → product detail, all backed by
  // the SAME cart/checkout the Shop screen uses. Only fetches products for a shop (else null →
  // useShopProducts is disabled). The hook already clears the cart + closes the sheet on a
  // successful redirect; inline has no modal to close, so onComplete is a no-op (the inline
  // counterpart to the modal's onClose).
  const cart = useStorefrontCart(isShop ? provider : null, petId, {
    onComplete: () => {},
  });
  const shopProducts = cart.products ?? [];
  const detailProduct = useMemo(
    () => shopProducts.find((p) => String(p.id) === String(detailId)) ?? null,
    [shopProducts, detailId],
  );

  // "Order again" rail (client-derived, no backend): the distinct products this buyer has
  // previously ordered FROM THIS PROVIDER that are STILL available in the current catalog,
  // newest-purchased first, capped. Real data only — empty (no history / none available) →
  // StorefrontBrowse renders nothing. Only fetch the order history for a shop.
  const { data: myOrders } = useShopOrders({ enabled: isShop });
  const orderAgain = useMemo(() => {
    if (!isShop || !provider?.id) return [];
    const byId = new Map(shopProducts.map((p) => [String(p.id), p]));
    const seen = new Set();
    const rail = [];
    // Orders arrive newest-first; keep first-seen (newest-purchased) order.
    for (const order of myOrders ?? []) {
      if (String(order.provider_id) !== String(provider.id)) continue;
      for (const item of order.items ?? []) {
        const key = item.product_id == null ? null : String(item.product_id);
        if (key == null || seen.has(key)) continue;
        seen.add(key);
        const prod = byId.get(key); // intersect with the live/active catalog
        if (prod) rail.push(prod);
        if (rail.length >= 10) return rail;
      }
    }
    return rail;
  }, [isShop, provider?.id, myOrders, shopProducts]);

  // The capability a booking is FOR: an explicit deep-link param wins; else the sole
  // bookable capability; else chosen from the chooser. Fixes the book/route 'vet' default
  // gotcha — a grooming-only provider books as 'groomer', telehealth as 'telehealth'.
  const resolvedBookingCapability =
    bookingCapability ??
    capabilityStr ??
    (bookableCaps.length === 1 ? bookableCaps[0] : undefined);

  const openBooking = () => {
    // Bottom "Book" button: no service preselected → the modal shows the full selector.
    setPreselectedService(null);
    // Multiple bookable capabilities and none preselected → ask which one first.
    if (!bookingCapability && !capabilityStr && bookableCaps.length > 1) {
      setShowCapChooser(true);
    } else {
      setShowBooking(true);
    }
  };
  // Tap a specific SERVICE row → ALWAYS open the booking form directly with that service
  // preselected (ticket 2.93 rev). The service IS the choice, so we NEVER show the capability
  // chooser here — asking "what would you like to book?" after the service is already chosen is
  // nonsensical. Capability is derived when it's unambiguous (a capability the service itself
  // carries, else the deep-link param, else the sole non-telehealth / sole bookable cap); when it
  // can't be resolved (several unrelated caps, e.g. vet + groomer) we leave it undefined and the
  // modal derives it from the provider — booking works with just the preselected service.
  const openBookingForService = (service) => {
    const baseCaps = bookableCaps.filter((c) => c !== "telehealth");
    const cap =
      service?.capability ??
      capabilityStr ??
      (baseCaps.length === 1
        ? baseCaps[0]
        : bookableCaps.length === 1
          ? bookableCaps[0]
          : undefined);
    setPreselectedService(service);
    setBookingCapability(cap ?? null);
    setShowBooking(true);
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

  // Header meta (Phase-2 polish) — real data only. "Open now" from the primary location's
  // free-form hours (deriveOpenNow returns true/false/null; null renders nothing). The "from"
  // price reuses the same cheapest-service teaser as the pinned bar.
  const openNow = deriveOpenNow(locations[0]?.hours_json);
  const fromPriceLabel =
    fromPrice != null
      ? t("providers.fromPrice", { price: formatPrice(fromPrice) })
      : null;
  // avg_rating / review_count are shown by the StoreHeader's RatingBadge (reads them off the
  // provider directly); the removed bottom trust strip was their only other consumer.

  // Storefront tabs for this provider type (presence-aware; Reviews always present). The
  // active tab defaults to the first; a stale key (after data change) falls back to it.
  const tabs = getStorefrontTabs({
    capabilities,
    locations,
    services,
    products,
    posts,
    adoptionListings,
    sectionOrder: provider?.storefront_section_order,
  });
  const activeKey = tabs.some((tab) => tab.key === activeTab)
    ? activeTab
    : tabs[0]?.key;
  // When there's no dedicated Locations tab (shop / fallback archetypes), fold locations
  // into the About panel so they're never lost.
  const includeLocationsInAbout =
    locations.length > 0 && !tabs.some((tab) => tab.key === "locations");

  // Sticky tab bar (Phase-2): pin the tab bar under the top glass bar while the active panel
  // scrolls. The tab bar is the direct child right after the (optional) cover + the header, so
  // its index is coverOffset + 1. Only sticky when the bar actually renders (>1 tab).
  const stickyHeaderIndices =
    tabs.length > 1
      ? [(provider?.cover_image_url ? 1 : 0) + 1]
      : undefined;

  const renderPanel = (key) => {
    switch (key) {
      case "services":
        return (
          <ServicesPanel
            services={services}
            t={t}
            onPressService={openBookingForService}
          />
        );
      case "items":
        // The Items tab IS the store: the inline browse grid backed by the shared cart.
        return cart.isLoading ? (
          <View style={{ paddingVertical: SPACING.xxl, alignItems: "center" }}>
            <ActivityIndicator color={COLORS.coral} />
          </View>
        ) : (
          <StorefrontBrowse
            products={shopProducts}
            favorites={cart.favorites}
            onToggleFavorite={cart.toggleFavorite}
            onOpenDetail={setDetailId}
            cartQtyFor={(pid) => cart.cart[pid] ?? 0}
            onQuickAdd={(p) => cart.setQty(p.id, 1, p.stock_qty)}
            showQuickAdd
            orderAgain={orderAgain}
            t={t}
          />
        );
      case "posts":
        // Stat row (ticket 2.93) lives at the TOP of the Posts tab only — Posts · Paws · Barks ·
        // Followers, above the image grid. It is NOT in the always-visible header, so it never
        // shows under Services / Reviews / etc.
        return (
          <>
            {provider?.id != null ? (
              <View style={{ marginBottom: SPACING.md }}>
                <BusinessStatRow providerId={provider.id} stats={stats} />
              </View>
            ) : null}
            <PostsPanel
              posts={posts}
              providerId={provider?.id}
              business={
                provider
                  ? {
                      name: provider.name,
                      slug: provider.slug,
                      logo_url: provider.logo_url,
                    }
                  : null
              }
            />
          </>
        );
      case "adoption":
        // Adoptable dogs for THIS business (ticket 2.97) — the SAME grid card + detail/apply modal
        // as the standalone Adoption browse. The tab only renders when there is ≥1 listing (per
        // getStorefrontTabs), so no empty state is needed here.
        return (
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              justifyContent: "space-between",
            }}
          >
            {adoptionListings.map((listing) => (
              <View key={listing.id} style={{ width: "48.5%" }}>
                <DogProfileCard
                  listing={listing}
                  grid
                  onPress={() =>
                    setOpenAdoptionListing({
                      listing,
                      place: {
                        id: provider.id,
                        name: provider.name,
                        slug: provider.slug,
                        logo_url: provider.logo_url,
                      },
                    })
                  }
                />
              </View>
            ))}
          </View>
        );
      case "reviews":
        return (
          <ReviewsPanel
            reviews={reviewList}
            eligibleReviewBooking={eligibleReviewBooking}
            onLeaveReview={() => setShowReview(true)}
            t={t}
          />
        );
      case "locations":
        return <LocationsPanel locations={locations} />;
      case "about":
        return (
          <AboutPanel
            provider={provider}
            locations={locations}
            includeLocations={includeLocationsInAbout}
            t={t}
          />
        );
      default:
        return null;
    }
  };

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
          refetch={adoptionEnabled ? [refetch, refetchAdoption] : refetch}
          stickyHeaderIndices={stickyHeaderIndices}
          contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 120 }}
        >
          {/* Storefront hero (ticket 2.22 + Phase-2 polish) — only when a cover is set. A taller
              banner with a subtle top scrim so overlaid controls stay legible over a bright
              image. The storefront-cover testID + "render only when set" behavior are unchanged. */}
          {provider.cover_image_url ? (
            <View
              style={{
                width: "100%",
                height: 200,
                borderRadius: RADIUS.card,
                marginBottom: SPACING.md + 2,
                backgroundColor: COLORS.sand,
                overflow: "hidden",
              }}
            >
              <Image
                testID="storefront-cover"
                source={{ uri: provider.cover_image_url }}
                style={{ width: "100%", height: "100%" }}
              />
              <LinearGradient
                pointerEvents="none"
                colors={["rgba(0,0,0,0.32)", "rgba(0,0,0,0)"]}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  height: 72,
                }}
              />
            </View>
          ) : null}

          {/* Store header + Follow toggle, wrapped as ONE scroll child so the tab bar's sticky
              index (computed as coverOffset + 1) stays correct. */}
          <View>
            {/* Sticky store header (name + tappable rating summary → Reviews). */}
            <StoreHeader
              provider={provider}
              capabilities={capabilities}
              onJumpToReviews={() => setActiveTab("reviews")}
              openNow={openNow}
              fromPriceLabel={fromPriceLabel}
              t={t}
            />
            {/* Follow + Message on ONE row (ticket 2.93) — the follow toggle (ticket 2.92) beside
                the Message action (relocated up from the removed bottom trust strip). The follower
                COUNT is no longer here; it lives in the Posts-tab stat row. */}
            {provider?.id != null ? (
              <View
                style={{
                  marginTop: -SPACING.sm,
                  marginBottom: SPACING.lg,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: SPACING.sm,
                }}
              >
                <ProviderFollowButton providerId={provider.id} />
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
                  testID="storefront-message-cta"
                  accessibilityRole="button"
                  accessibilityLabel={t("providers.messageA11y")}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    paddingHorizontal: SPACING.lg,
                    paddingVertical: SPACING.sm + 2,
                    borderRadius: RADIUS.chip,
                    borderWidth: 1.5,
                    borderColor: COLORS.peach,
                    backgroundColor: COLORS.card,
                  }}
                >
                  {startingThread ? (
                    <ActivityIndicator size="small" color={COLORS.coral} />
                  ) : (
                    <MessageSquare size={16} color={COLORS.coral} />
                  )}
                  <Text style={[TYPE.footnote, { fontWeight: "800", color: COLORS.coral }]}>
                    {t("providers.message")}
                  </Text>
                </PressableScale>
              </View>
            ) : null}
          </View>

          {/* Horizontal tab bar (mirrors the shop.jsx pill pattern). */}
          <StorefrontTabBar
            tabs={tabs}
            activeKey={activeKey}
            onSelect={setActiveTab}
            t={t}
          />

          {/* Panels — MOUNTED but only the active one is visible (display:none hides the
              rest). Every section stays in the tree, so all testIDs resolve without nav. */}
          {tabs.map((tab) => (
            <View
              key={tab.key}
              testID={`storefront-panel-${tab.key}`}
              style={{ display: tab.key === activeKey ? "flex" : "none" }}
            >
              {renderPanel(tab.key)}
            </View>
          ))}
        </RefreshableScrollView>
      )}

      {/* Pinned primary CTA bar — Shop and/or Book only. The old rating/from-price trust strip
          was removed (ticket 2.93): the rating already lives in the sticky StoreHeader and the
          follower count moved to the Posts stat row. The bar renders ONLY when there is a CTA to
          show (a shop, or a bookable provider that lists zero services), so a bookable provider
          WITH services — whose booking lives on each service card — gets no empty bar. */}
      {provider && (
        <>
          {/* Inline cart bar — sits just above the pinned action bar; only when non-empty. */}
          {cart.cartLines.length > 0 ? (
            <StorefrontCartBar
              visible
              pinned={false}
              total={cart.total}
              currency={provider?.currency}
              onOpenCheckout={() => cart.setShowCheckout(true)}
              t={t}
            />
          ) : null}
          {hasBottomCta ? (
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
          <View style={{ flexDirection: "row", gap: SPACING.md }}>
            {/* Shop — primary when the store is the main action, secondary alongside Book. */}
            {showShop ? (
              <PressableScale
                testID="storefront-shop-cta"
                onPress={() => setActiveTab("items")}
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

            {/* Book — per-service booking lives on each Services card now; this bottom CTA is
                only a fallback for a bookable provider that lists ZERO services (still
                bookable). Capability-aware (opens the chooser first when there are several). */}
            {showBook && services.length === 0 ? (
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
          ) : null}
        </>
      )}

      <BookingFormModal
        visible={showBooking}
        onClose={() => {
          setShowBooking(false);
          setPreselectedService(null);
        }}
        provider={provider}
        locations={locations}
        services={services}
        capabilities={capabilities}
        capability={resolvedBookingCapability}
        service={preselectedService}
      />

      {/* Inline checkout sheet — only mounted when the cart has lines (reuses the shared
          pickup/delivery sheet + the SAME cart → useShopCheckout → MercadoPago money path). */}
      {cart.cartLines.length > 0 ? (
        <StorefrontCheckoutSheet
          visible={cart.showCheckout}
          onClose={() => cart.setShowCheckout(false)}
          fulfillment={cart.fulfillment}
          onSelectFulfillment={cart.setFulfillment}
          address={cart.address}
          onChangeAddress={cart.setAddress}
          canPay={cart.canPay}
          isPending={cart.checkout.isPending}
          total={cart.total}
          currency={provider?.currency}
          storeName={provider?.name}
          onPay={cart.doCheckout}
          t={t}
        />
      ) : null}

      {/* Inline product detail — opened by tapping a card; reuses the shared ProductDetail. */}
      <Modal
        visible={!!detailProduct}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setDetailId(null)}
      >
        <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
          <GlassSurface
            intensity={BLUR.thick}
            style={{ borderBottomWidth: 1, borderColor: MATERIALS.glassBorder }}
            contentStyle={{
              flexDirection: "row",
              alignItems: "center",
              gap: SPACING.sm,
              padding: SPACING.lg,
            }}
          >
            <PressableScale
              testID="storefront-detail-back"
              onPress={() => setDetailId(null)}
              accessibilityLabel={t("common.back")}
            >
              <ArrowLeft size={22} color={COLORS.warmBrown} />
            </PressableScale>
            <Text
              style={[TYPE.title2, { fontSize: 18, color: COLORS.warmBrown, flex: 1 }]}
              numberOfLines={1}
            >
              {detailProduct?.name || t("storefront.shop")}
            </Text>
          </GlassSurface>
          {detailProduct ? (
            <ProductDetail
              product={detailProduct}
              t={t}
              qty={cart.cart[detailProduct.id] ?? 0}
              isFavorite={cart.favorites.has(detailProduct.id)}
              onToggleFavorite={() => cart.toggleFavorite(detailProduct.id)}
              onAdd={() => cart.setQty(detailProduct.id, 1, detailProduct.stock_qty)}
              onRemove={() => cart.setQty(detailProduct.id, -1, detailProduct.stock_qty)}
            />
          ) : null}
        </View>
      </Modal>

      {/* Leave-a-review — reuses the shared modal; opened only from the eligible CTA above. */}
      <WriteReviewModal
        visible={showReview}
        onClose={() => setShowReview(false)}
        providerId={provider?.id}
        providerName={provider?.name}
        petId={eligibleReviewBooking?.pet_id}
      />

      {/* Adoption listing detail + apply (ticket 2.97) — the SAME shared modal the browse uses. */}
      <ListingDetailModal
        data={openAdoptionListing}
        onClose={() => setOpenAdoptionListing(null)}
        router={router}
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

// Horizontal storefront tab bar — mirrors the pill pattern in app/service/shop.jsx for visual
// consistency. Each pill carries a storefront-tab-{key} testID and reflects selection via
// accessibilityState. Local navigation only (sets the active tab); no data.
function StorefrontTabBar({ tabs, activeKey, onSelect, t }) {
  if (tabs.length <= 1) return null;
  return (
    // Opaque wrapper so the sticky bar cleanly covers the panel scrolling beneath it.
    <View
      style={{
        backgroundColor: COLORS.cream,
        marginBottom: SPACING.lg,
        paddingBottom: SPACING.sm,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.peach,
      }}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: SPACING.sm }}
      >
        {tabs.map((tab) => {
        const selected = tab.key === activeKey;
        return (
          <PressableScale
            key={tab.key}
            testID={`storefront-tab-${tab.key}`}
            onPress={() => onSelect(tab.key)}
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
                { fontWeight: "700", color: selected ? COLORS.coral : COLORS.warmBrown },
              ]}
            >
              {t(tab.labelKey)}
            </Text>
          </PressableScale>
        );
      })}
      </ScrollView>
    </View>
  );
}
