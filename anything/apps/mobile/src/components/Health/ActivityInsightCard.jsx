// ActivityInsightCard — a positive, behavioral activity reward (unit E9).
//
// The server picks the insight `kind` and can never return a negative comparison, so this only maps a
// kind → localized POSITIVE copy. Always behavioral, never diagnostic — the disclaimer stays visible.

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/Card";
import { useActivityInsight } from "@/hooks/useActivityInsight";
import { COLORS } from "@/constants/colors";

// The full set of kinds the server can return — all positive/forward.
const KINDS = new Set(["cohort_top", "best_month", "more_than_last", "keep_going", "gentle_nudge"]);

export function activityInsightText(t, data, petName) {
  if (!data || !KINDS.has(data.kind)) return null;
  const name = petName || t("activityInsight.petFallback");
  const p = data.params || {};
  switch (data.kind) {
    case "cohort_top":
      return t("activityInsight.cohortTop", { name, percentile: p.percentile, breed: p.breed });
    case "best_month":
      return t("activityInsight.bestMonth", { name, walks: p.walks });
    case "more_than_last":
      return t("activityInsight.moreThanLast", { name, diff: p.diff });
    case "keep_going":
      return t("activityInsight.keepGoing", { name });
    case "gentle_nudge":
    default:
      return t("activityInsight.gentleNudge", { name });
  }
}

export function ActivityInsightCard({ petId, petName }) {
  const { t } = useTranslation();
  const { data } = useActivityInsight(petId);
  const text = activityInsightText(t, data, petName);
  if (!text) return null;

  return (
    <Card style={styles.card}>
      <Text style={styles.emoji}>📈</Text>
      <Text style={styles.text}>{text}</Text>
      <Text style={styles.disclaimer}>{t("activityInsight.disclaimer")}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16 },
  emoji: { fontSize: 22, marginBottom: 6 },
  text: { fontSize: 15, fontWeight: "700", color: COLORS.warmBrown, lineHeight: 21 },
  disclaimer: { marginTop: 8, fontSize: 11, color: COLORS.mutedBrown, lineHeight: 15 },
});

export default ActivityInsightCard;
