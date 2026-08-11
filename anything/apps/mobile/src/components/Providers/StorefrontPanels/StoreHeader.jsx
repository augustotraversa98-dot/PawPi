import React from "react";
import { View, Text, Image, Linking } from "react-native";
import { Stethoscope, Instagram, Clock } from "lucide-react-native";
import { Card, PressableScale } from "@/components/ui";
import RatingBadge from "@/components/Providers/RatingBadge";
import { COLORS } from "@/constants/colors";
import { TYPE, RADIUS, SPACING } from "@/constants/theme";

// Sticky store header (storefront shell). The provider's logo + name + capability chips + a
// compact meta row (tappable rating → Reviews · open-now · "from" price), and — for the
// "sells on Instagram" case — a promoted, tappable Instagram chip. Presentational: everything
// comes from the already-fetched public profile; open-now / from-price are passed in already
// resolved by the screen (Phase-2 header polish).
export default function StoreHeader({
  provider,
  capabilities = [],
  onJumpToReviews,
  openNow, // true | false | null(unknown) — from utils/providerHours deriveOpenNow
  fromPriceLabel, // preformatted "from {price}" string, or null
  t,
}) {
  const igUrl = provider?.instagram_url;
  const igLabel = instagramHandle(igUrl) ?? "Instagram";

  return (
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
        {/* @handle (from the provider slug) — mirrors the pet social profile's @handle so the
            business profile reads the same way (ticket 2.93). */}
        {provider.slug ? (
          <Text
            testID="storefront-handle"
            style={[TYPE.footnote, { color: COLORS.coral, fontWeight: "700", marginTop: 2 }]}
          >
            @{provider.slug}
          </Text>
        ) : null}
        {/* Info line — the business's own bio/tagline/description (the pet profile's "with
            <owner>" analogue). Rendered only when set (no fakes). */}
        {provider.bio ? (
          <Text
            testID="storefront-bio"
            style={[TYPE.footnote, { color: COLORS.mutedBrown, marginTop: 3, lineHeight: 18 }]}
            numberOfLines={3}
          >
            {provider.bio}
          </Text>
        ) : null}
        {/* Offering chips were removed from the in-profile header (ticket 2.93 rev) — they wasted
            vertical space here. The Discover / search cards still show them (ServicesDiscovery). */}

        {/* Meta row — each piece renders only when it has data (no fakes). */}
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            alignItems: "center",
            gap: SPACING.sm + 2,
            marginTop: 6,
          }}
        >
          {/* Tappable rating summary → jumps to the Reviews tab. */}
          <PressableScale
            testID="storefront-rating-summary"
            onPress={onJumpToReviews}
            accessibilityRole="button"
            accessibilityLabel={t("storefront.tabs.reviews")}
          >
            <RatingBadge
              avgRating={provider.avg_rating}
              reviewCount={provider.review_count}
              size="lg"
            />
          </PressableScale>

          {openNow != null ? <OpenNowPill open={openNow} t={t} /> : null}

          {fromPriceLabel ? (
            <Text style={[TYPE.footnote, { color: COLORS.mutedBrown, fontWeight: "600" }]}>
              {fromPriceLabel}
            </Text>
          ) : null}
        </View>

        {/* Promoted Instagram chip (the "sells on Instagram" case) — opens instagram_url,
            same as the About panel's ProviderLinks. Rendered only when set. */}
        {igUrl ? (
          <PressableScale
            testID="storefront-ig-chip"
            onPress={() => Linking.openURL(igUrl.trim())}
            accessibilityRole="link"
            accessibilityLabel={igLabel}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              alignSelf: "flex-start",
              marginTop: SPACING.sm,
              backgroundColor: COLORS.coral + "14",
              borderRadius: RADIUS.chip,
              paddingHorizontal: SPACING.md,
              paddingVertical: 6,
              borderWidth: 1,
              borderColor: COLORS.peach,
            }}
          >
            <Instagram size={14} color={COLORS.coral} />
            <Text style={[TYPE.footnote, { fontWeight: "700", color: COLORS.coral }]}>
              {igLabel}
            </Text>
          </PressableScale>
        ) : null}
      </View>
    </Card>
  );
}

// Open-now pill: green when open, muted when closed. Only mounted when open is true/false
// (the screen passes null through as "unknown" and renders nothing).
function OpenNowPill({ open, t }) {
  const color = open ? COLORS.sageDark : COLORS.mutedBrown;
  return (
    <View
      testID="storefront-open-now"
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        borderRadius: RADIUS.chip,
        paddingHorizontal: SPACING.sm,
        paddingVertical: 3,
        backgroundColor: open ? COLORS.sage + "2E" : COLORS.sand,
        borderWidth: 1,
        borderColor: open ? COLORS.sage : COLORS.peach,
      }}
    >
      <Clock size={12} color={color} />
      <Text style={[TYPE.caption, { fontWeight: "800", color, letterSpacing: 0 }]}>
        {open ? t("storefront.openNow") : t("storefront.closed")}
      </Text>
    </View>
  );
}

// Parse an "@handle" from an Instagram profile URL; fall back to null (→ "Instagram" label).
function instagramHandle(url) {
  if (typeof url !== "string") return null;
  const base = url.trim().split(/[?#]/)[0].replace(/\/+$/, "");
  const seg = base.split("/").filter(Boolean).pop();
  if (seg && !seg.includes(".") && !seg.includes(":")) {
    return `@${seg.replace(/^@/, "")}`;
  }
  return null;
}
