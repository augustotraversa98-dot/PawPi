import React from "react";
import { View, Text, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Store } from "lucide-react-native";
import { COLORS, TYPE, SPACING } from "@/constants/theme";

// Business logo (round) or a Store fallback tile. Shared by the business tab headers so a
// business with no logo still reads as a business, not a blank circle.
export function BusinessLogo({ uri, size = 40 }) {
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: COLORS.sand }}
      />
    );
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: COLORS.sand,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Store size={size * 0.5} color={COLORS.coral} />
    </View>
  );
}

// Compact header for the secondary business tabs (Bookings/Messages/Profile): the active
// business logo + name, then a screen title/subtitle. Reflects the CURRENTLY-ACTIVE provider
// (the switcher lives in the Today header; every tab follows it via useActiveProvider). An
// optional `right` slot hosts a per-tab action.
export default function BusinessHeader({ businessName, logoUri, title, subtitle, right }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        paddingTop: insets.top + SPACING.sm,
        paddingHorizontal: SPACING.xl,
        paddingBottom: SPACING.md,
        backgroundColor: COLORS.card,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.peach,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.md }}>
        <BusinessLogo uri={logoUri} size={36} />
        <Text
          style={[TYPE.subhead, { color: COLORS.mutedBrown, flex: 1, fontWeight: "700" }]}
          numberOfLines={1}
        >
          {businessName}
        </Text>
        {right ?? null}
      </View>
      <Text style={[TYPE.title2, { color: COLORS.warmBrown, marginTop: SPACING.sm }]}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={[TYPE.footnote, { color: COLORS.mutedBrown, marginTop: 2 }]}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}
