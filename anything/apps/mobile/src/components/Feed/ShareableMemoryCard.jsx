import React, { forwardRef } from "react";
import { View, Text } from "react-native";
import { Image } from "expo-image";
import { PawPrint } from "lucide-react-native";
import { COLORS } from "@/constants/colors";

// A story-sized (9:16) branded frame for sharing a Memory or a Wrapped slide (ticket 2.49).
// Reuses the 2.28 ShareableDailyCard look. Either shows a hero PHOTO (on-this-day memory) or
// a big STAT (wrapped slide / milestone). Rendered off-screen + snapshotted; forwardRef so
// the capture target is this view.
const ShareableMemoryCard = forwardRef(function ShareableMemoryCard(
  { petName, headline, subtitle, emoji, photoUri, stat, statLabel, onReady, onError },
  ref,
) {
  const name = petName || "My pup";
  // Photo slides are "ready" only once the hero image decodes; stat/emoji slides
  // (no photo) are ready as soon as they lay out.
  return (
    <View
      ref={ref}
      testID="shareable-memory-card"
      collapsable={false}
      onLayout={!photoUri && onReady ? () => onReady() : undefined}
      style={{
        width: 360,
        height: 640,
        backgroundColor: COLORS.coral,
        padding: 20,
        justifyContent: "space-between",
      }}
    >
      {/* Brand header */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 8 }}>
        <PawPrint size={22} color="#FFF" fill="#FFF" />
        <Text style={{ fontSize: 22, fontWeight: "900", color: "#FFF", letterSpacing: 0.5 }}>PawPi</Text>
      </View>

      {/* Hero: a photo, or a big stat/emoji */}
      <View
        style={{
          flex: 1,
          marginVertical: 16,
          borderRadius: 28,
          overflow: "hidden",
          backgroundColor: COLORS.cream,
          borderWidth: 6,
          borderColor: "#FFF",
          justifyContent: "center",
          alignItems: "center",
          padding: 24,
        }}
      >
        {photoUri ? (
          <Image
            testID="memory-card-image"
            source={{ uri: photoUri }}
            style={{ width: "100%", height: "100%" }}
            contentFit="cover"
            cachePolicy="memory-disk"
            priority="high"
            onLoad={onReady}
            onError={onError}
          />
        ) : (
          <>
            {emoji ? <Text style={{ fontSize: 72, marginBottom: 12 }}>{emoji}</Text> : null}
            {stat ? (
              <Text style={{ fontSize: 64, fontWeight: "900", color: COLORS.coral, textAlign: "center" }}>
                {stat}
              </Text>
            ) : null}
            {statLabel ? (
              <Text style={{ fontSize: 18, fontWeight: "700", color: COLORS.warmBrown, textAlign: "center", marginTop: 8 }}>
                {statLabel}
              </Text>
            ) : null}
          </>
        )}
      </View>

      {/* Caption */}
      <View style={{ alignItems: "center", paddingBottom: 10 }}>
        <Text style={{ fontSize: 22, fontWeight: "900", color: "#FFF", textAlign: "center" }}>
          {headline || `${name}'s memory`}
        </Text>
        {subtitle ? (
          <Text style={{ fontSize: 14, fontWeight: "600", color: "#FFF", opacity: 0.9, marginTop: 6, textAlign: "center" }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );
});

export default ShareableMemoryCard;
