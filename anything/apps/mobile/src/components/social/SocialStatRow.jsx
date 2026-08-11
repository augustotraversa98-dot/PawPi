import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { COLORS, TYPE, MATERIALS, SPACING } from "@/constants/theme";

// Shared social stat strip — the pet social profile (pet-profile.jsx) and the business
// storefront (service/provider.jsx) render the SAME row so the two profiles read alike.
// Presentational only: the caller passes already-resolved label strings + values (the pet
// screen is English-only; the business screen passes t()-translated labels), so this file
// never touches i18n. Each stat: { key, value, label, color?, onPress?, testID? }. A stat
// with onPress renders as a tappable pill (testID defaults to `stat-<label>`); otherwise a
// plain pill. Hairline dividers sit between pills.
export function SocialStatRow({ stats = [] }) {
  return (
    <View
      style={{
        backgroundColor: MATERIALS.surface,
        flexDirection: "row",
        paddingVertical: SPACING.lg + 2,
        paddingHorizontal: SPACING.md,
        borderBottomWidth: 1,
        borderBottomColor: MATERIALS.hairline,
      }}
    >
      {stats.map((stat, i) => (
        <React.Fragment key={stat.key ?? stat.label}>
          {i > 0 ? (
            <View style={{ width: 1, backgroundColor: MATERIALS.hairline }} />
          ) : null}
          <StatPill {...stat} />
        </React.Fragment>
      ))}
    </View>
  );
}

function StatPill({ value, label, color, onPress, testID }) {
  const inner = (
    <>
      <Text style={[TYPE.title2, { color: color || COLORS.warmBrown }]}>
        {value}
      </Text>
      <Text style={[TYPE.caption, { color: COLORS.mutedBrown, marginTop: 2 }]}>
        {label}
      </Text>
    </>
  );
  if (onPress) {
    return (
      <TouchableOpacity
        testID={testID ?? `stat-${label}`}
        onPress={onPress}
        activeOpacity={0.7}
        style={{ alignItems: "center", flex: 1 }}
      >
        {inner}
      </TouchableOpacity>
    );
  }
  return <View style={{ alignItems: "center", flex: 1 }}>{inner}</View>;
}

export default SocialStatRow;
