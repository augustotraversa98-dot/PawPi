// LeaderboardCard — weekly care-effort leagues (unit E8).
//
// XP comes from care effort (walks, ring closes, care actions, paws GIVEN), never popularity. Three
// flavors (Friends / Breed / Neighborhood); breed + neighborhood are density-gated server-side, so
// when the requested flavor is too sparse the card shows a clean "not enough dogs yet" note and the
// friends board instead — never an empty/fake board. Neighborhood needs a one-time coarse-area opt-in
// (never a home address).

import React, { useState } from "react";
import { View, Text, Pressable, TextInput, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/Card";
import { useLeaderboard, useSetLeaderboardArea } from "@/hooks/useLeaderboard";
import { COLORS } from "@/constants/colors";

const FLAVORS = ["friends", "breed", "neighborhood"];
const TIER_EMOJI = { gold: "🥇", silver: "🥈", bronze: "🥉" };
const MOVE_EMOJI = { promoted: "⬆️", relegated: "⬇️", same: "" };

export function LeaderboardCard({ petId }) {
  const { t } = useTranslation();
  const [flavor, setFlavor] = useState("friends");
  const { data } = useLeaderboard(petId, flavor);
  const setArea = useSetLeaderboardArea(petId);
  const [area, setAreaText] = useState("");

  const board = data?.board || [];
  const gated = !!data?.gated;
  const me = data?.me;
  const movement = data?.movement;
  const shownFlavor = data?.flavor || flavor;
  const needsOptIn = flavor === "neighborhood" && board.length === 0 && !gated;

  return (
    <Card style={styles.card}>
      <Text style={styles.title}>{t("leaderboard.title")}</Text>
      <Text style={styles.subtitle}>{t("leaderboard.subtitle")}</Text>

      <View style={styles.tabs}>
        {FLAVORS.map((f) => (
          <Pressable
            key={f}
            onPress={() => setFlavor(f)}
            accessibilityRole="button"
            style={[styles.tab, flavor === f && styles.tabActive]}
          >
            <Text style={[styles.tabText, flavor === f && styles.tabTextActive]}>
              {t(`leaderboard.flavor_${f}`)}
            </Text>
          </Pressable>
        ))}
      </View>

      {gated ? (
        <Text style={styles.gated}>{t(`leaderboard.gated_${flavor}`)}</Text>
      ) : null}

      {needsOptIn ? (
        <View style={styles.optIn}>
          <Text style={styles.optInHint}>{t("leaderboard.optInHint")}</Text>
          <View style={styles.optInRow}>
            <TextInput
              value={area}
              onChangeText={setAreaText}
              placeholder={t("leaderboard.areaPlaceholder")}
              placeholderTextColor={COLORS.mutedBrown}
              style={styles.input}
              accessibilityLabel={t("leaderboard.areaPlaceholder")}
            />
            <Pressable
              style={styles.optInBtn}
              onPress={() => area.trim() && setArea.mutate({ optIn: true, area: area.trim() })}
              accessibilityRole="button"
            >
              <Text style={styles.optInBtnText}>{t("leaderboard.optIn")}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {board.length === 0 && !needsOptIn ? (
        <Text style={styles.empty}>{t("leaderboard.empty")}</Text>
      ) : null}

      {board.map((row) => (
        <View key={row.pet_id} style={[styles.row, row.is_me && styles.rowMe]}>
          <Text style={styles.rank}>#{row.rank}</Text>
          <Text style={[styles.name, row.is_me && styles.nameMe]} numberOfLines={1}>
            {row.name}
            {row.is_me ? ` · ${t("leaderboard.you")}` : ""}
          </Text>
          <Text style={styles.xp}>{t("leaderboard.xp", { xp: row.xp })}</Text>
        </View>
      ))}

      {me ? (
        <Text style={styles.meLine}>
          {TIER_EMOJI[me.tier] || ""} {t(`leaderboard.tier_${me.tier}`)} {MOVE_EMOJI[movement] || ""}
          {movement === "promoted" ? ` ${t("leaderboard.promoted")}` : ""}
        </Text>
      ) : null}

      <Text style={styles.footer}>{t("leaderboard.effortNote")}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16 },
  title: { fontSize: 16, fontWeight: "800", color: COLORS.warmBrown },
  subtitle: { marginTop: 2, fontSize: 12, color: COLORS.mutedBrown, marginBottom: 10 },
  tabs: { flexDirection: "row", gap: 8, marginBottom: 12 },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 999, backgroundColor: COLORS.sand, alignItems: "center" },
  tabActive: { backgroundColor: COLORS.coral },
  tabText: { fontSize: 12, fontWeight: "700", color: COLORS.mutedBrown },
  tabTextActive: { color: "#FFF" },
  gated: { fontSize: 12, color: COLORS.mutedBrown, marginBottom: 8, lineHeight: 17 },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 8, gap: 10 },
  rowMe: { backgroundColor: "#FFF3E9", borderRadius: 10, paddingHorizontal: 8 },
  rank: { width: 34, fontSize: 14, fontWeight: "800", color: COLORS.terracotta },
  name: { flex: 1, fontSize: 14, fontWeight: "600", color: COLORS.warmBrown },
  nameMe: { fontWeight: "800" },
  xp: { fontSize: 13, fontWeight: "700", color: COLORS.mutedBrown },
  meLine: { marginTop: 10, fontSize: 13, fontWeight: "800", color: COLORS.terracotta },
  empty: { fontSize: 13, color: COLORS.mutedBrown, lineHeight: 18, marginBottom: 4 },
  optIn: { marginBottom: 8 },
  optInHint: { fontSize: 12, color: COLORS.mutedBrown, marginBottom: 8, lineHeight: 17 },
  optInRow: { flexDirection: "row", gap: 8 },
  input: {
    flex: 1, backgroundColor: COLORS.sand, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
    color: COLORS.warmBrown, fontSize: 14,
  },
  optInBtn: { backgroundColor: COLORS.coral, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 16 },
  optInBtnText: { color: "#FFF", fontWeight: "800", fontSize: 14 },
  footer: { marginTop: 12, fontSize: 11, color: COLORS.mutedBrown, lineHeight: 15 },
});

export default LeaderboardCard;
