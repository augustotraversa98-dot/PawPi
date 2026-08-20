import React from "react";
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ChevronRight, Sparkles } from "lucide-react-native";
import { useCurrentPet } from "@/hooks/usePetProfile";
import { usePetHistory } from "@/hooks/useMemories";
import { usePostingStreak } from "@/hooks/useFeedPosts";
import { getLocalPostDateString } from "@/utils/dateUtils";
import { onThisDay, detectMilestones } from "@/utils/memoriesWrapped";
import { MemoryShareButton } from "@/components/Feed/MemoryShareButton";

const C = {
  cream: "#FFF7EF",
  card: "#FFFCF8",
  coral: "#FF6F61",
  peach: "#FFD9B3",
  sand: "#F8EBDD",
  sageDark: "#5A8A74",
  warmBrown: "#3B241B",
  mutedBrown: "#7A6254",
};

export default function MemoriesScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: currentPet } = useCurrentPet();
  const petId = currentPet?.id;
  const petName = currentPet?.name;

  const { data: history, isLoading } = usePetHistory(petId);
  const { streak } = usePostingStreak(petId);

  const today = getLocalPostDateString();
  const memories = onThisDay(history || [], today);
  const milestones = detectMilestones(currentPet, {
    postDates: (history || []).map((p) => p.post_date),
    currentStreak: streak || 0,
    today,
  });

  return (
    <View style={{ flex: 1, backgroundColor: C.cream, paddingTop: insets.top }}>
      <View style={styles.header}>
        <TouchableOpacity testID="memories-back" onPress={() => router.back()} style={{ marginRight: 12 }}>
          <ArrowLeft size={22} color={C.warmBrown} />
        </TouchableOpacity>
        <Text style={{ fontSize: 20, fontWeight: "800", color: C.warmBrown }}>{t("memoriesScreen.title")}</Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}>
        {/* Wrapped entry */}
        <TouchableOpacity
          testID="open-wrapped"
          onPress={() => router.push("/wrapped")}
          style={styles.wrappedBanner}
        >
          <Sparkles size={24} color="#FFF" />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: "900", color: "#FFF" }}>
              {petName ? t("memoriesScreen.wrappedTitle", { name: petName }) : t("memoriesScreen.wrappedTitleGeneric")}
            </Text>
            <Text style={{ fontSize: 12, color: "#FFF", opacity: 0.9, marginTop: 2 }}>
              {t("memoriesScreen.wrappedSubtitle")}
            </Text>
          </View>
          <ChevronRight size={20} color="#FFF" />
        </TouchableOpacity>

        {/* Milestones */}
        {milestones.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>{t("memoriesScreen.todaysCelebrations")}</Text>
            {milestones.map((m) => (
              <View key={m.key} testID={`milestone-${m.key}`} style={styles.milestoneCard}>
                <Text style={{ fontSize: 38 }}>{m.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: "800", color: C.warmBrown }}>{m.title}</Text>
                  <Text style={{ fontSize: 13, color: C.mutedBrown, marginTop: 2 }}>{m.subtitle}</Text>
                </View>
                <MemoryShareButton
                  petName={petName}
                  label={t("common.share")}
                  card={{ emoji: m.emoji, headline: m.title, subtitle: m.subtitle }}
                />
              </View>
            ))}
          </>
        )}

        {/* On this day */}
        <Text style={styles.sectionLabel}>{t("memoriesScreen.onThisDay")}</Text>
        {isLoading && <ActivityIndicator color={C.coral} />}
        {!isLoading && memories.length === 0 && (
          <Text style={{ fontSize: 13, color: C.mutedBrown }}>
            {t("memoriesScreen.empty")}
          </Text>
        )}
        {memories.map((m) => (
          <View key={m.id} testID={`memory-${m.id}`} style={styles.memoryCard}>
            <Image source={{ uri: m.image_url }} style={{ width: "100%", height: 240 }} contentFit="cover" />
            <View style={{ padding: 14, flexDirection: "row", alignItems: "center" }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: "800", color: C.warmBrown }}>
                  {t("memoriesScreen.yearsAgo", { count: m.yearsAgo })}
                </Text>
                {m.caption ? (
                  <Text style={{ fontSize: 13, color: C.mutedBrown, marginTop: 2 }}>{m.caption}</Text>
                ) : null}
              </View>
              <MemoryShareButton
                petName={petName}
                label="Share"
                card={{
                  photoUri: m.image_url,
                  headline: `${petName || t("memoriesScreen.myPup")} · ${t("memoriesScreen.yearsAgo", { count: m.yearsAgo })}`,
                  subtitle: t("memoriesScreen.onThisDayLower"),
                }}
              />
            </View>
          </View>
        ))}
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
  wrappedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: C.coral,
    borderRadius: 18,
    padding: 18,
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: C.mutedBrown,
    letterSpacing: 0.8,
    marginTop: 24,
    marginBottom: 12,
  },
  milestoneCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: C.peach,
  },
  memoryCard: {
    backgroundColor: C.card,
    borderRadius: 18,
    overflow: "hidden",
    marginBottom: 14,
    borderWidth: 1,
    borderColor: C.peach,
  },
};
