// VetSummaryReadinessCard — the E10 positive payoff loop (docs/pet-owner-engagement.md).
//
// Two positive nudges, never shaming:
//   • Monthly care recap — "{name}'s care was X% this month" from REAL ring completion.
//   • Vet-Summary readiness — grows as REAL records fill: "the more you log, the better {name}'s next
//     vet summary". Links to the existing Vet Summary. Celebrates progress; an empty state is a gentle
//     invite, never a gap-shame.

import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/Card";
import { useVetSummaryReadiness } from "@/hooks/useHealthReinforcement";
import { useShareStats } from "@/hooks/useShareStats";
import { COLORS } from "@/constants/colors";

export function VetSummaryReadinessCard({ petId, petName }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { data: readiness } = useVetSummaryReadiness(petId);
  const { data: stats } = useShareStats(petId);
  const name = petName || t("vetReadiness.petFallback");

  const recap = stats?.care_recap;
  const hasRecap = recap && recap.days_elapsed > 0;

  const filled = readiness?.filled ?? 0;
  const total = readiness?.total ?? 4;
  const level = readiness?.level || "start";
  const pct = total > 0 ? Math.round((filled / total) * 100) : 0;

  return (
    <Card style={styles.card}>
      {hasRecap ? (
        <Text style={styles.recap}>
          🗓️{" "}
          {recap.percent > 0
            ? t("vetReadiness.recap", { name, percent: recap.percent })
            : t("vetReadiness.recapStart", { name })}
        </Text>
      ) : null}

      <Text style={styles.title}>{t("vetReadiness.title", { name })}</Text>
      <Text style={styles.sub}>{t(`vetReadiness.level_${level}`, { name })}</Text>

      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${Math.max(pct, 4)}%` }]} />
      </View>
      <Text style={styles.count}>{t("vetReadiness.count", { filled, total })}</Text>

      <Pressable
        style={styles.link}
        onPress={() => router.push("/(tabs)/more/vet")}
        accessibilityRole="button"
      >
        <Text style={styles.linkText}>{t("vetReadiness.viewSummary")} →</Text>
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16 },
  recap: { fontSize: 15, fontWeight: "800", color: COLORS.terracotta, marginBottom: 10, lineHeight: 21 },
  title: { fontSize: 16, fontWeight: "800", color: COLORS.warmBrown },
  sub: { marginTop: 4, fontSize: 13, color: COLORS.mutedBrown, lineHeight: 18 },
  barTrack: { marginTop: 12, height: 10, borderRadius: 999, backgroundColor: COLORS.sand, overflow: "hidden" },
  barFill: { height: 10, borderRadius: 999, backgroundColor: COLORS.coral },
  count: { marginTop: 6, fontSize: 12, fontWeight: "700", color: COLORS.mutedBrown },
  link: { marginTop: 12 },
  linkText: { fontSize: 14, fontWeight: "800", color: COLORS.coral },
});

export default VetSummaryReadinessCard;
