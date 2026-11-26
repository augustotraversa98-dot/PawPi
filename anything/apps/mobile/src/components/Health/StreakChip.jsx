// StreakChip — the 🔥 ring-close streak badge (unit E2). Compact, shown on the pet-profile header and
// the feed header. Renders nothing at 0 (no fake number, no shame). Reads the Care Ring's streak.

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { useCareRing } from "@/hooks/useCareRing";
import { streakCount } from "@/utils/careRing";
import { COLORS } from "@/constants/colors";

export function StreakChip({ petId, style }) {
  const { data } = useCareRing(petId);
  const count = streakCount(data);
  if (!petId) return null;
  return <StreakBadge count={count} style={style} />;
}

// The chip itself, for a count already known (a friend's dog — their Care Ring is private).
export function StreakBadge({ count, style, accessibilityLabel }) {
  const { t } = useTranslation();
  if (!(count > 0)) return null;
  return (
    <View style={[styles.chip, style]} accessibilityRole="text">
      <Text style={styles.text} accessibilityLabel={accessibilityLabel}>
        {t("health.careRing.streakChip", { count })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFE7D6",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  text: { fontSize: 13, fontWeight: "800", color: COLORS.terracotta },
});

export default StreakChip;
