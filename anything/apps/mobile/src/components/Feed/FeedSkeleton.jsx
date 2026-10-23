import React from "react";
import { View } from "react-native";
import { COLORS, SPACING, RADIUS } from "@/constants/theme";

// FeedSkeleton — neutral placeholder cards shown while the Feed's lock state (owner-posted-today /
// today's daily update) is still unknown. Posts have already arrived at that point, but whether to show them
// blurred or in full is decided by the lock, so we show a card-shaped skeleton instead of a full-screen
// spinner (perf audit 2026-10-23, finding 3). It carries no post data, so it can never reveal anything a
// locked viewer must not see. Static on purpose: no animation, no per-card hooks.

const BLOCK = { backgroundColor: COLORS.sand };

function SkeletonCard() {
  return (
    <View
      style={{
        backgroundColor: COLORS.card,
        borderRadius: RADIUS.card,
        marginHorizontal: SPACING.lg,
        marginTop: SPACING.md,
        padding: SPACING.md,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View style={[BLOCK, { width: 40, height: 40, borderRadius: 20 }]} />
        <View style={{ marginLeft: SPACING.md }}>
          <View style={[BLOCK, { width: 120, height: 12, borderRadius: 6 }]} />
          <View style={[BLOCK, { width: 80, height: 10, borderRadius: 5, marginTop: 6 }]} />
        </View>
      </View>
      <View style={[BLOCK, { aspectRatio: 4 / 5, borderRadius: RADIUS.card, marginTop: SPACING.md }]} />
    </View>
  );
}

export default function FeedSkeleton({ count = 2 }) {
  return (
    <View testID="feed-skeleton" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} />
      ))}
    </View>
  );
}
