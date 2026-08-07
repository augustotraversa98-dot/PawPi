import React from "react";
import { View, Text, Image } from "react-native";
import { Stethoscope } from "lucide-react-native";
import { Card, PressableScale } from "@/components/ui";
import RatingBadge from "@/components/Providers/RatingBadge";
import { COLORS } from "@/constants/colors";
import { TYPE, RADIUS, SPACING } from "@/constants/theme";

// Sticky store header (Phase-1 shell): the provider's logo + name + capability chips + the
// rating summary. Moved verbatim from app/service/provider.jsx's header Card; the ONLY change
// is that the rating row is now a PressableScale that jumps to the Reviews tab (onJumpToReviews
// — local navigation only, no data). Capability chips keep their provider-cap-{c} testIDs.
export default function StoreHeader({ provider, capabilities = [], onJumpToReviews, t }) {
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
        {/* Capability chips (P4a) — one per capability the provider holds; falls back to the
            display-only provider_type label when capabilities aren't set. */}
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
        {/* Tappable rating summary → jumps to the Reviews tab. */}
        <PressableScale
          testID="storefront-rating-summary"
          onPress={onJumpToReviews}
          accessibilityRole="button"
          accessibilityLabel={t("storefront.tabs.reviews")}
          style={{ marginTop: 6, alignSelf: "flex-start" }}
        >
          <RatingBadge
            avgRating={provider.avg_rating}
            reviewCount={provider.review_count}
            size="lg"
          />
        </PressableScale>
      </View>
    </Card>
  );
}
