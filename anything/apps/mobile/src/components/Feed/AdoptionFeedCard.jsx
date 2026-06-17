import React, { memo } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Image } from "expo-image";
import { Heart, ChevronRight, Dog } from "lucide-react-native";
import { COLORS } from "@/constants/colors";

function ageLabel(years, months) {
  const y = years || 0;
  const m = months || 0;
  if (!y && !m) return null;
  const parts = [];
  if (y) parts.push(`${y}y`);
  if (m) parts.push(`${m}m`);
  return parts.join(" ");
}

function money(cents, currency = "ARS") {
  if (cents == null) return null;
  if (cents === 0) return "Free to adopt";
  return `${currency} ${(cents / 100).toFixed(2)}`;
}

// Phase 2 ticket 2.13 — an "adopt this dog" suggestion card, rendered INLINE in the feed between
// pet posts. Visually DISTINCT from PostCard: a peach-tinted card with an "ADOPT ME" eyebrow and
// heart, a shorter hero photo, and a call-to-action chevron — clearly an adoptable listing, not a
// friend's pet post. Public dog-profile fields only (no applicant / shelter-owner / medical data).
export const AdoptionFeedCard = memo(function AdoptionFeedCard({ listing, onPress }) {
  const photo = Array.isArray(listing.photo_urls) ? listing.photo_urls[0] : null;
  const meta = [
    listing.breed,
    ageLabel(listing.age_years, listing.age_months),
    listing.gender,
    listing.size,
  ]
    .filter(Boolean)
    .join(" · ");
  const fee = money(listing.adoption_fee_cents, listing.currency);

  return (
    <TouchableOpacity
      testID="adoption-feed-card"
      activeOpacity={0.9}
      onPress={onPress}
      style={{
        backgroundColor: "#FFF1E6", // peach tint — deliberately NOT the cream PostCard
        marginHorizontal: 16,
        marginBottom: 16,
        borderRadius: 20,
        overflow: "hidden",
        borderWidth: 1.5,
        borderColor: COLORS.apricot,
        borderStyle: "dashed",
      }}
    >
      {/* Eyebrow */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          paddingHorizontal: 14,
          paddingTop: 12,
          paddingBottom: 8,
        }}
      >
        <Heart size={13} color={COLORS.coral} fill={COLORS.coral} />
        <Text
          style={{
            fontSize: 10,
            fontWeight: "800",
            color: COLORS.terracotta,
            letterSpacing: 0.8,
          }}
        >
          ADOPT ME
        </Text>
      </View>

      {photo ? (
        <Image
          source={{ uri: photo }}
          style={{ width: "100%", height: 180 }}
          contentFit="cover"
        />
      ) : (
        <View
          style={{
            width: "100%",
            height: 180,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: COLORS.peach,
          }}
        >
          <Dog size={44} color={COLORS.terracotta} />
        </View>
      )}

      <View style={{ padding: 14, flexDirection: "row", alignItems: "center" }}>
        <View style={{ flex: 1 }}>
          <Text
            style={{ fontSize: 16, fontWeight: "800", color: COLORS.warmBrown }}
            numberOfLines={1}
          >
            {listing.name}
          </Text>
          {meta ? (
            <Text
              style={{ fontSize: 12, color: COLORS.mutedBrown, marginTop: 2 }}
              numberOfLines={1}
            >
              {meta}
            </Text>
          ) : null}
          <Text
            style={{ fontSize: 11, color: COLORS.mutedBrown, marginTop: 4 }}
            numberOfLines={1}
          >
            {listing.provider_name ? `at ${listing.provider_name}` : ""}
            {fee ? `${listing.provider_name ? " · " : ""}${fee}` : ""}
          </Text>
        </View>
        <ChevronRight size={20} color={COLORS.terracotta} />
      </View>
    </TouchableOpacity>
  );
});
