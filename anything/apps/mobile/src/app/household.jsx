// The multi-pet household home (unit E14).
//
// Lists all the household's dogs (owned + co-cared) with each one's ring status + streak at a glance;
// tapping a dog switches the ACTIVE pet (persisted selection — every useCurrentPet consumer follows it,
// so ring / health / profile / feed authoring all respect the tap). Optional opt-in family streak: a
// household flame that advances when EVERY dog's ring closed. Never shames one dog for another.

import React from "react";
import { View, Text, ScrollView, TouchableOpacity, Switch, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Flame, Check, Circle } from "lucide-react-native";
import { useHousehold, useFamilyStreakOptIn } from "@/hooks/useHousehold";
import useSelectedPetStore from "@/store/selectedPetStore";

const C = {
  cream: "#FFF7EF",
  card: "#FFFCF8",
  coral: "#FF6F61",
  peach: "#FFD9B3",
  sageDark: "#5A8A74",
  warmBrown: "#3B241B",
  mutedBrown: "#7A6254",
};

export default function HouseholdScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const { data, isLoading } = useHousehold();
  const familyStreak = useFamilyStreakOptIn();
  const selectedPetId = useSelectedPetStore((s) => s.selectedPetId);
  const setSelectedPetId = useSelectedPetStore((s) => s.setSelectedPetId);

  const dogs = data?.dogs || [];
  const fs = data?.family_streak;
  const showFamilyStreak = (data?.owned_count || 0) >= 2;

  const onSwitch = (petId) => {
    setSelectedPetId(petId); // persisted; reflected across every surface via useCurrentPet
    router.back();
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.cream, paddingTop: insets.top }}>
      <View style={styles.header}>
        <TouchableOpacity testID="household-back" onPress={() => router.back()} style={{ marginRight: 12 }}>
          <ArrowLeft size={22} color={C.warmBrown} />
        </TouchableOpacity>
        <Text style={{ fontSize: 20, fontWeight: "800", color: C.warmBrown }}>{t("household.homeTitle")}</Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}>
        {isLoading && <ActivityIndicator color={C.coral} testID="household-loading" />}

        {!isLoading && (
          <>
            {/* Family streak (opt-in, 2+ dogs) */}
            {showFamilyStreak ? (
              <View testID="family-streak" style={styles.familyCard}>
                <Flame size={24} color={fs?.opted_in ? C.coral : C.mutedBrown} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.familyTitle}>{t("household.familyStreakTitle")}</Text>
                  <Text style={styles.familyHint}>
                    {fs?.opted_in
                      ? t("household.familyStreakActive", { count: fs?.current ?? 0 })
                      : t("household.familyStreakHint")}
                  </Text>
                </View>
                <Switch
                  testID="family-streak-toggle"
                  value={!!fs?.opted_in}
                  onValueChange={(v) => (v ? familyStreak.optIn() : familyStreak.optOut())}
                />
              </View>
            ) : null}

            <Text style={styles.sectionLabel}>{t("household.dogsLabel")}</Text>
            {dogs.map((d) => {
              const isActive = d.id === selectedPetId;
              return (
                <TouchableOpacity
                  key={d.id}
                  testID={`household-dog-${d.id}`}
                  onPress={() => onSwitch(d.id)}
                  style={[styles.dogRow, isActive && styles.dogRowActive]}
                >
                  <Image source={{ uri: d.avatar_url }} style={styles.dogAvatar} contentFit="cover" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dogName}>
                      {d.name}
                      {!d.is_mine ? <Text style={styles.coCared}>  {t("household.coCared")}</Text> : null}
                    </Text>
                    <Text style={styles.dogStreak}>
                      {t("household.streakDays", { count: d.streak?.current ?? 0 })}
                    </Text>
                  </View>
                  <View style={styles.ring} testID={`household-ring-${d.id}`}>
                    {d.ring_closed ? (
                      <Check size={18} color={C.sageDark} />
                    ) : (
                      <Circle size={18} color={C.peach} />
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
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
  familyCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: C.peach,
  },
  familyTitle: { fontSize: 15, fontWeight: "800", color: C.warmBrown },
  familyHint: { fontSize: 12, color: C.mutedBrown, marginTop: 2 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: C.mutedBrown,
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  dogRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: C.peach,
  },
  dogRowActive: { borderColor: C.coral, borderWidth: 2 },
  dogAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: C.peach },
  dogName: { fontSize: 15, fontWeight: "800", color: C.warmBrown },
  coCared: { fontSize: 12, color: C.sageDark, fontWeight: "700" },
  dogStreak: { fontSize: 12, color: C.mutedBrown, marginTop: 2 },
  ring: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
};
