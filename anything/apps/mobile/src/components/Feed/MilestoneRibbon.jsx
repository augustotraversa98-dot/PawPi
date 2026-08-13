// MilestoneRibbon — the celebratory banner over a milestone-day moment (unit E3). Birthday or
// gotcha/adoption anniversary, with the years when known. Celebratory only — never a "you forgot".

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { COLORS } from "@/constants/colors";

export function MilestoneRibbon({ type, years, petName }) {
  const { t } = useTranslation();
  if (type !== "birthday" && type !== "gotcha") return null;
  const title = t(type === "birthday" ? "milestones.ribbonBirthday" : "milestones.ribbonGotcha", {
    name: petName || "",
  });
  const yearsText = years > 0 ? t("milestones.years", { count: years }) : null;
  return (
    <View style={styles.ribbon} accessibilityRole="text">
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      {yearsText ? <Text style={styles.years}>{yearsText}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  ribbon: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "rgba(255,111,97,0.92)", // coral banner
  },
  title: { color: "#FFF", fontWeight: "800", fontSize: 14 },
  years: {
    color: COLORS.warmBrown,
    fontWeight: "800",
    fontSize: 12,
    backgroundColor: "rgba(255,255,255,0.85)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: "hidden",
  },
});

export default MilestoneRibbon;
