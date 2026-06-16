import React from "react";
import { View, Text } from "react-native";
import { Star } from "lucide-react-native";
import { COLORS } from "@/constants/colors";

// Aggregate rating + review count for a provider (ticket 2.2). Real data only: a
// provider with no reviews (count 0 / avg null) shows a muted "New" pill instead of a
// fake star score. Used on the vet discovery cards and the provider profile header.
export default function RatingBadge({ avgRating, reviewCount, size = "sm" }) {
  const count = Number(reviewCount) || 0;
  const avg = avgRating == null ? null : Number(avgRating);

  // Empty state: no reviews yet.
  if (count === 0 || avg == null || Number.isNaN(avg)) {
    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <Star size={size === "lg" ? 16 : 13} color={COLORS.mutedBrown} />
        <Text
          style={{
            fontSize: size === "lg" ? 14 : 12,
            fontWeight: "700",
            color: COLORS.mutedBrown,
          }}
        >
          New
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <Star
        size={size === "lg" ? 16 : 13}
        color={COLORS.coral}
        fill={COLORS.coral}
      />
      <Text
        style={{
          fontSize: size === "lg" ? 14 : 12,
          fontWeight: "800",
          color: COLORS.warmBrown,
        }}
      >
        {avg.toFixed(1)}
      </Text>
      <Text
        style={{
          fontSize: size === "lg" ? 13 : 11,
          fontWeight: "600",
          color: COLORS.mutedBrown,
        }}
      >
        ({count})
      </Text>
    </View>
  );
}
