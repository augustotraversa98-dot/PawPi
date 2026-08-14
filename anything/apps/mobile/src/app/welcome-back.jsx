// "Welcome back — here's what your pack did" (unit E12).
//
// Shown when a lapsed owner returns. WARM, never guilt: it celebrates what's waiting (friends' real
// recent moments, an upcoming milestone) and offers a free one-tap streak repair within the grace
// window. All real — a clean empty state when there's nothing, never fabricated activity.

import React from "react";
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Cake, Flame } from "lucide-react-native";
import { useCurrentPet } from "@/hooks/usePetProfile";
import { useReengagement, useReengagementAction } from "@/hooks/useReengagement";

const C = {
  cream: "#FFF7EF",
  card: "#FFFCF8",
  coral: "#FF6F61",
  peach: "#FFD9B3",
  sageDark: "#5A8A74",
  warmBrown: "#3B241B",
  mutedBrown: "#7A6254",
};

export default function WelcomeBackScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const { data: currentPet } = useCurrentPet();
  const petId = currentPet?.id;
  const petName = currentPet?.name || t("welcomeBack.petFallback");

  const { data, isLoading } = useReengagement(petId);
  const action = useReengagementAction(petId);
  const wb = data?.welcome_back || {};

  const onRepair = async () => {
    try { await action.repair(); } catch { /* friendly no-op */ }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.cream, paddingTop: insets.top }}>
      <View style={styles.header}>
        <TouchableOpacity testID="welcome-back-close" onPress={() => router.back()} style={{ marginRight: 12 }}>
          <ArrowLeft size={22} color={C.warmBrown} />
        </TouchableOpacity>
        <Text style={{ fontSize: 20, fontWeight: "800", color: C.warmBrown }}>
          {t("welcomeBack.title", { name: petName })}
        </Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}>
        {isLoading && <ActivityIndicator color={C.coral} testID="welcome-back-loading" />}

        {!isLoading && (
          <>
            <View style={styles.hero}>
              <Text testID="welcome-back-headline" style={styles.heroText}>
                {t("welcomeBack.headline", { name: petName })}
              </Text>
            </View>

            {/* One-tap streak repair (free, within the grace window) */}
            {wb.repair_available ? (
              <TouchableOpacity testID="welcome-back-repair" onPress={onRepair} style={styles.repairCard}>
                <Flame size={22} color={C.coral} />
                <Text style={{ flex: 1, fontSize: 14, fontWeight: "700", color: C.warmBrown }}>
                  {t("welcomeBack.repair", { name: petName })}
                </Text>
              </TouchableOpacity>
            ) : null}

            {/* Upcoming milestone */}
            {wb.milestone ? (
              <View testID="welcome-back-milestone" style={styles.milestoneCard}>
                <Cake size={22} color={C.coral} />
                <Text style={{ flex: 1, fontSize: 14, fontWeight: "700", color: C.warmBrown }}>
                  {wb.milestone.kind === "birthday"
                    ? t("welcomeBack.milestoneBirthday", { name: petName, days: wb.milestone.in_days })
                    : t("welcomeBack.milestoneGotcha", { name: petName, days: wb.milestone.in_days })}
                </Text>
              </View>
            ) : null}

            {/* Friends' real recent moments */}
            {wb.friends?.length > 0 ? (
              <View testID="welcome-back-friends">
                <Text style={styles.sectionLabel}>{t("welcomeBack.friendsTitle")}</Text>
                {wb.friends.map((f) => (
                  <View key={f.pet_id} style={styles.friendCard} testID={`wb-friend-${f.pet_id}`}>
                    {f.image_url ? (
                      <Image source={{ uri: f.image_url }} style={{ width: "100%", height: 200 }} contentFit="cover" />
                    ) : null}
                    <Text style={{ padding: 12, fontSize: 14, fontWeight: "700", color: C.warmBrown }}>
                      {t("welcomeBack.friendPosted", { name: f.name })}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.empty}>{t("welcomeBack.friendsEmpty", { name: petName })}</Text>
            )}

            {/* Gentle opt-out */}
            <TouchableOpacity testID="welcome-back-optout" onPress={() => action.optOut()} style={{ marginTop: 24 }}>
              <Text style={styles.optOut}>{t("welcomeBack.optOut")}</Text>
            </TouchableOpacity>
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
  hero: { backgroundColor: C.coral, borderRadius: 18, padding: 20, marginBottom: 16 },
  heroText: { fontSize: 18, fontWeight: "900", color: "#FFF", lineHeight: 24 },
  repairCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: C.card, borderRadius: 16, padding: 16, marginBottom: 12,
    borderWidth: 1.5, borderColor: C.coral,
  },
  milestoneCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: C.card, borderRadius: 16, padding: 14, marginBottom: 12,
    borderWidth: 1.5, borderColor: C.peach,
  },
  sectionLabel: {
    fontSize: 12, fontWeight: "800", color: C.mutedBrown, letterSpacing: 0.8,
    marginTop: 12, marginBottom: 12,
  },
  friendCard: {
    backgroundColor: C.card, borderRadius: 18, overflow: "hidden", marginBottom: 14,
    borderWidth: 1, borderColor: C.peach,
  },
  empty: { fontSize: 13, color: C.mutedBrown, marginTop: 12 },
  optOut: { fontSize: 13, color: C.mutedBrown, textAlign: "center", textDecorationLine: "underline" },
};
