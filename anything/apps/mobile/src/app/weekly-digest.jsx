// "Rex's Week" — the weekly digest screen (unit E11).
//
// Shows REAL owner-tz-week stats. The SERVER owns the honest `state` (rich | quiet | empty): a quiet
// or empty week degrades to a gentle, forward line — never a shame frame, never a fabricated number.
// One-tap "Share Rex's week" opens the E4 share card with the real stats.

import React from "react";
import { View, Text, ScrollView, TouchableOpacity, Switch, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Footprints, Sparkles, Heart, Flame, Cake } from "lucide-react-native";
import { useCurrentPet } from "@/hooks/usePetProfile";
import { useWeeklyDigest, useWeeklyDigestPrefs, useUpdateWeeklyDigestPrefs } from "@/hooks/useWeeklyDigest";
import { MemoryShareButton } from "@/components/Feed/MemoryShareButton";

const C = {
  cream: "#FFF7EF",
  card: "#FFFCF8",
  coral: "#FF6F61",
  peach: "#FFD9B3",
  sageDark: "#5A8A74",
  warmBrown: "#3B241B",
  mutedBrown: "#7A6254",
};

function StatTile({ icon, value, label, testID }) {
  return (
    <View testID={testID} style={styles.tile}>
      {icon}
      <Text testID={`${testID}-value`} style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

export default function WeeklyDigestScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const { data: currentPet } = useCurrentPet();
  const petId = currentPet?.id;
  const petName = currentPet?.name || t("weeklyDigest.petFallback");

  const { data, isLoading } = useWeeklyDigest(petId);
  const { data: prefs } = useWeeklyDigestPrefs();
  const updatePrefs = useUpdateWeeklyDigestPrefs();

  const state = data?.state || "rich";
  const headline =
    state === "empty"
      ? t("weeklyDigest.headlineEmpty", { name: petName })
      : state === "quiet"
        ? t("weeklyDigest.headlineQuiet", { name: petName })
        : t("weeklyDigest.headlineRich", { name: petName });

  const shareCard = {
    emoji: "🐾",
    headline: t("weeklyDigest.shareHeadline", { name: petName }),
    subtitle: t("weeklyDigest.shareSubtitle", {
      walks: data?.walks || 0,
      ringDays: data?.ring_days_closed || 0,
    }),
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.cream, paddingTop: insets.top }}>
      <View style={styles.header}>
        <TouchableOpacity testID="weekly-digest-back" onPress={() => router.back()} style={{ marginRight: 12 }}>
          <ArrowLeft size={22} color={C.warmBrown} />
        </TouchableOpacity>
        <Text style={{ fontSize: 20, fontWeight: "800", color: C.warmBrown }}>
          {t("weeklyDigest.title", { name: petName })}
        </Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}>
        {isLoading && <ActivityIndicator color={C.coral} testID="weekly-digest-loading" />}

        {!isLoading && (
          <>
            <View style={styles.hero}>
              <Text testID="weekly-digest-headline" style={styles.heroText}>{headline}</Text>
            </View>

            {/* Real stats — always the true numbers (0 shows honestly). */}
            <View style={styles.tiles}>
              <StatTile
                testID="tile-walks"
                icon={<Footprints size={20} color={C.sageDark} />}
                value={data?.walks ?? 0}
                label={t("weeklyDigest.walks")}
              />
              <StatTile
                testID="tile-ring"
                icon={<Sparkles size={20} color={C.coral} />}
                value={`${data?.ring_days_closed ?? 0}/${data?.ring_days_total ?? 7}`}
                label={t("weeklyDigest.ringDays")}
              />
              <StatTile
                testID="tile-care"
                icon={<Heart size={20} color={C.coral} />}
                value={data?.care_actions ?? 0}
                label={t("weeklyDigest.careActions")}
              />
              <StatTile
                testID="tile-streak"
                icon={<Flame size={20} color={C.coral} />}
                value={data?.streak?.current ?? 0}
                label={t("weeklyDigest.streak")}
              />
            </View>

            {/* Best moment of the week */}
            {data?.best_moment?.image_url ? (
              <View testID="best-moment" style={styles.momentCard}>
                <Text style={styles.sectionLabel}>{t("weeklyDigest.bestMoment")}</Text>
                <Image source={{ uri: data.best_moment.image_url }} style={{ width: "100%", height: 220 }} contentFit="cover" />
                {data.best_moment.caption ? (
                  <Text style={{ padding: 12, fontSize: 13, color: C.mutedBrown }}>{data.best_moment.caption}</Text>
                ) : null}
              </View>
            ) : null}

            {/* Friends' dogs this week (real, public activity only) */}
            {data?.friends?.length > 0 ? (
              <View testID="friends-strip">
                <Text style={styles.sectionLabel}>{t("weeklyDigest.friendsTitle")}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                  {data.friends.map((f) => (
                    <View key={f.pet_id} style={styles.friend} testID={`friend-${f.pet_id}`}>
                      <Image source={{ uri: f.avatar_url }} style={styles.friendAvatar} contentFit="cover" />
                      <Text style={styles.friendName} numberOfLines={1}>{f.name}</Text>
                    </View>
                  ))}
                </ScrollView>
              </View>
            ) : null}

            {/* Upcoming milestone preview */}
            {data?.milestone ? (
              <View testID="milestone-preview" style={styles.milestoneCard}>
                <Cake size={22} color={C.coral} />
                <Text style={{ flex: 1, fontSize: 14, fontWeight: "700", color: C.warmBrown }}>
                  {data.milestone.kind === "birthday"
                    ? t("weeklyDigest.milestoneBirthday", { name: petName, days: data.milestone.in_days })
                    : t("weeklyDigest.milestoneGotcha", { name: petName, days: data.milestone.in_days })}
                </Text>
              </View>
            ) : null}

            {/* Share */}
            <View style={{ alignItems: "center", marginTop: 20 }}>
              <MemoryShareButton petName={petName} label={t("weeklyDigest.share")} card={shareCard} />
            </View>

            {/* Weekly digest delivery preferences */}
            <Text style={styles.sectionLabel}>{t("weeklyDigest.prefsTitle")}</Text>
            <View style={styles.prefRow}>
              <Text style={styles.prefLabel}>{t("weeklyDigest.pushToggle")}</Text>
              <Switch
                testID="pref-push"
                value={prefs?.push_enabled ?? true}
                onValueChange={(v) => updatePrefs.mutate({ push_enabled: v })}
              />
            </View>
            <View style={styles.prefRow}>
              <Text style={styles.prefLabel}>{t("weeklyDigest.emailToggle")}</Text>
              <Switch
                testID="pref-email"
                value={prefs?.email_enabled ?? false}
                onValueChange={(v) => updatePrefs.mutate({ email_enabled: v })}
              />
            </View>
            <Text style={styles.prefHint}>{t("weeklyDigest.prefsHint")}</Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = {
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.peach,
  },
  hero: {
    backgroundColor: C.coral,
    borderRadius: 18,
    padding: 20,
    marginBottom: 16,
  },
  heroText: { fontSize: 18, fontWeight: "900", color: "#FFF", lineHeight: 24 },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "space-between" },
  tile: {
    width: "48%",
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: C.peach,
    gap: 4,
  },
  tileValue: { fontSize: 24, fontWeight: "900", color: C.warmBrown },
  tileLabel: { fontSize: 12, color: C.mutedBrown },
  momentCard: {
    backgroundColor: C.card,
    borderRadius: 18,
    overflow: "hidden",
    marginTop: 16,
    borderWidth: 1,
    borderColor: C.peach,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: C.mutedBrown,
    letterSpacing: 0.8,
    marginTop: 24,
    marginBottom: 12,
  },
  friend: { width: 72, alignItems: "center", marginRight: 12 },
  friendAvatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: C.peach },
  friendName: { fontSize: 11, color: C.mutedBrown, marginTop: 4, maxWidth: 72 },
  milestoneCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 14,
    marginTop: 16,
    borderWidth: 1.5,
    borderColor: C.peach,
  },
  prefRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: C.peach,
  },
  prefLabel: { fontSize: 14, color: C.warmBrown, fontWeight: "600" },
  prefHint: { fontSize: 12, color: C.mutedBrown, marginTop: 4 },
};
