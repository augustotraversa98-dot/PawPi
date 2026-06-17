import React, { memo } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Image } from "expo-image";
import { Store, Star, ChevronRight } from "lucide-react-native";
import { COLORS } from "@/constants/colors";

// Phase 2 ticket 2.13 — a provider "discover this business" suggestion card, rendered INLINE in
// the feed between pet posts. Visually DISTINCT from PostCard: a sage-tinted card with a
// "DISCOVER A BUSINESS" eyebrow, a compact horizontal layout (logo + name + rating), and a clear
// call-to-action chevron — it can never be mistaken for a pet's daily moment. Public fields only.
export const ProviderFeedCard = memo(function ProviderFeedCard({ provider, onPress }) {
  const rating =
    provider.avg_rating != null ? Number(provider.avg_rating) : null;
  const reviewCount = provider.review_count ?? 0;
  const typeLabel = (provider.provider_type || "service").replace(/_/g, " ");

  return (
    <TouchableOpacity
      testID="provider-feed-card"
      activeOpacity={0.85}
      onPress={onPress}
      style={{
        backgroundColor: "#EEF4EC", // sage tint — deliberately NOT the cream PostCard
        marginHorizontal: 16,
        marginBottom: 16,
        borderRadius: 20,
        padding: 14,
        borderWidth: 1.5,
        borderColor: COLORS.sage,
        borderStyle: "dashed",
      }}
    >
      {/* Eyebrow — makes the card's purpose unmistakable */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          marginBottom: 10,
        }}
      >
        <Store size={13} color={COLORS.sageDark} />
        <Text
          style={{
            fontSize: 10,
            fontWeight: "800",
            color: COLORS.sageDark,
            letterSpacing: 0.8,
          }}
        >
          DISCOVER A BUSINESS
        </Text>
      </View>

      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View
          style={{
            width: 52,
            height: 52,
            borderRadius: 14,
            backgroundColor: COLORS.card,
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            marginRight: 12,
          }}
        >
          {provider.logo_url ? (
            <Image
              source={{ uri: provider.logo_url }}
              style={{ width: 52, height: 52 }}
              contentFit="cover"
            />
          ) : (
            <Store size={24} color={COLORS.sageDark} />
          )}
        </View>

        <View style={{ flex: 1 }}>
          <Text
            style={{ fontSize: 15, fontWeight: "800", color: COLORS.warmBrown }}
            numberOfLines={1}
          >
            {provider.name}
          </Text>
          <Text
            style={{
              fontSize: 12,
              color: COLORS.mutedBrown,
              textTransform: "capitalize",
              marginTop: 1,
            }}
            numberOfLines={1}
          >
            {typeLabel}
          </Text>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              marginTop: 4,
            }}
          >
            {rating != null ? (
              <>
                <Star size={12} color={COLORS.honey} fill={COLORS.honey} />
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "700",
                    color: COLORS.warmBrown,
                  }}
                >
                  {rating.toFixed(1)}
                </Text>
                <Text style={{ fontSize: 11, color: COLORS.mutedBrown }}>
                  ({reviewCount})
                </Text>
              </>
            ) : (
              <Text style={{ fontSize: 11, color: COLORS.mutedBrown }}>New</Text>
            )}
          </View>
        </View>

        <ChevronRight size={20} color={COLORS.sageDark} />
      </View>
    </TouchableOpacity>
  );
});
