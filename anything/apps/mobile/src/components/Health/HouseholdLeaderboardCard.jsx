// HouseholdLeaderboardCard — the private household leaderboard (unit E13 PR3).
//
// CELEBRATE the family. Shows each caregiver's contributions this week (moments / care / walks) with a
// friendly "most active caregiver 💪" — and NEVER shames the less-active co-parent (the server emits no
// least-active signal; this only renders a positive most-active badge). Renders only for a real
// household (2+ members); a solo owner sees nothing here.

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { useTranslation } from "react-i18next";
import { Trophy } from "lucide-react-native";
import { useHouseholdLeaderboard } from "@/hooks/useHouseholdLeaderboard";

const C = {
  card: "#FFFCF8",
  peach: "#FFD9B3",
  coral: "#FF6F61",
  sageDark: "#5A8A74",
  warmBrown: "#3B241B",
  mutedBrown: "#7A6254",
};

export function HouseholdLeaderboardCard({ petId }) {
  const { t } = useTranslation();
  const { data } = useHouseholdLeaderboard(petId);

  const members = data?.members || [];
  // Solo household (or opted out / empty) → render nothing.
  if (data?.opted_out || members.length < 2) return null;

  return (
    <View testID="household-leaderboard" style={styles.card}>
      <View style={styles.header}>
        <Trophy size={20} color={C.coral} />
        <Text style={styles.title}>{t("household.title")}</Text>
      </View>
      <Text style={styles.subtitle}>{t("household.subtitle")}</Text>

      {members.map((m) => {
        const isMostActive = m.member_user_id === data.most_active_user_id;
        return (
          <View key={m.member_user_id} style={styles.row} testID={`household-member-${m.member_user_id}`}>
            <Image source={{ uri: m.avatar_url }} style={styles.avatar} contentFit="cover" />
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>
                {m.username || t("household.someone")}
                {isMostActive ? (
                  <Text testID={`most-active-${m.member_user_id}`} style={styles.badge}>
                    {"  "}{t("household.mostActive")}
                  </Text>
                ) : null}
              </Text>
              <Text style={styles.stats}>
                {t("household.stats", { moments: m.moments, care: m.care_actions, walks: m.walks })}
              </Text>
            </View>
            <Text style={styles.total}>{m.total}</Text>
          </View>
        );
      })}
      <Text style={styles.footer}>{t("household.footer")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.card,
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: C.peach,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontSize: 16, fontWeight: "800", color: C.warmBrown },
  subtitle: { fontSize: 12, color: C.mutedBrown, marginTop: 2, marginBottom: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.peach },
  name: { fontSize: 14, fontWeight: "700", color: C.warmBrown },
  badge: { fontSize: 12, color: C.coral, fontWeight: "800" },
  stats: { fontSize: 12, color: C.mutedBrown, marginTop: 2 },
  total: { fontSize: 18, fontWeight: "900", color: C.sageDark },
  footer: { fontSize: 11, color: C.mutedBrown, marginTop: 8, fontStyle: "italic" },
});
