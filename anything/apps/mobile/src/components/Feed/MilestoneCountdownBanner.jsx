// MilestoneCountdownBanner (unit E3) — a gentle "coming up" banner in the 3 days before a pet's
// birthday or gotcha day. Celebratory anticipation, never a chore. Renders nothing outside the window
// or when no real date is set. (Also the state that feeds the E5 countdown notification.)

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { getUpcomingMilestone } from "@/utils/feedDelight";
import { getLocalPostDateString } from "@/utils/dateUtils";
import { COLORS } from "@/constants/colors";

export function MilestoneCountdownBanner({ birthday, adoptionDate, petName, style }) {
  const { t } = useTranslation();
  const up = getUpcomingMilestone(
    { birthday, adoption_date: adoptionDate },
    getLocalPostDateString(),
  );
  if (!up) return null;
  const title = t(
    up.type === "birthday" ? "milestones.countdownBirthday" : "milestones.countdownGotcha",
    { name: petName || "" },
  );
  const daysText = t("milestones.inDays", { count: up.daysUntil });
  return (
    <View style={[styles.banner, style]} accessibilityRole="text">
      <Text style={styles.text}>
        {title} {daysText}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: "#FFF3EC",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
  },
  text: { color: COLORS.terracotta, fontWeight: "700", fontSize: 13 },
});

export default MilestoneCountdownBanner;
