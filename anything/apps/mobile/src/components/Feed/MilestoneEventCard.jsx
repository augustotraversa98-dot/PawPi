// MilestoneEventCard / FollowedMilestones (unit E3) — the feed EVENT that a pet's followers see on
// its birthday or gotcha day: "🎉 It's Bella's Gotcha Day!". Social-reciprocity spike — tap to visit
// the pet, or send a paw on its milestone moment (when it has posted today). Real dates only: nothing
// renders unless a followed pet has a real milestone today.

import React, { useState } from "react";
import { View, Text, Image, Pressable, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { Card } from "@/components/ui/Card";
import { useFollowedMilestones } from "@/hooks/useFollowedMilestones";
import { useTogglePaw } from "@/hooks/useFeedPosts";
import { COLORS } from "@/constants/colors";

function MilestoneEventCard({ milestone: m }) {
  const { t } = useTranslation();
  const router = useRouter();
  const paw = useTogglePaw(m.today_post_id);
  const [pawed, setPawed] = useState(false);

  const title = t(m.type === "birthday" ? "milestones.eventBirthday" : "milestones.eventGotcha", {
    name: m.pet_name,
  });
  const yearsText = m.years > 0 ? t("milestones.eventYears", { count: m.years }) : null;

  const openProfile = () =>
    router.push({
      pathname: "/pet-profile",
      params: { petId: String(m.pet_id), dogName: m.pet_name, petHandle: m.pet_handle || "" },
    });

  const sendPaw = () => {
    if (!m.today_post_id || pawed) return;
    setPawed(true);
    paw.mutate({ isPawed: false }); // isPawed=false → POST a paw
  };

  return (
    <Card style={styles.card}>
      <Pressable style={styles.row} onPress={openProfile} accessibilityRole="button">
        {m.pet_avatar ? (
          <Image source={{ uri: m.pet_avatar }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={{ fontSize: 20 }}>🐾</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{title}</Text>
          {yearsText ? <Text style={styles.years}>{yearsText}</Text> : null}
        </View>
      </Pressable>
      {m.today_post_id ? (
        <Pressable
          style={[styles.pawBtn, pawed && styles.pawBtnDone]}
          onPress={sendPaw}
          disabled={pawed}
          accessibilityRole="button"
        >
          <Text style={[styles.pawText, pawed && styles.pawTextDone]}>
            {pawed ? "🐾 ✓" : t("milestones.sendPaw")}
          </Text>
        </Pressable>
      ) : null}
    </Card>
  );
}

export function FollowedMilestones({ viewerPetId }) {
  const { data } = useFollowedMilestones(viewerPetId);
  const milestones = data?.milestones || [];
  if (!milestones.length) return null;
  return (
    <View style={{ marginBottom: 8 }}>
      {milestones.map((m) => (
        <MilestoneEventCard key={m.pet_id} milestone={m} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 14, marginHorizontal: 16, marginBottom: 10, backgroundColor: "#FFF3EC" },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.sand },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  title: { fontSize: 15, fontWeight: "800", color: COLORS.warmBrown },
  years: { marginTop: 2, fontSize: 12, color: COLORS.terracotta, fontWeight: "700" },
  pawBtn: {
    marginTop: 12,
    alignSelf: "flex-start",
    backgroundColor: COLORS.coral,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
  },
  pawBtnDone: { backgroundColor: "#E7F1E4" },
  pawText: { color: "#FFF", fontWeight: "800", fontSize: 13 },
  pawTextDone: { color: COLORS.sageDark },
});

export default FollowedMilestones;
