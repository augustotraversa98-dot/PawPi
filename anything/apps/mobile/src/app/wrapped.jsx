import React from "react";
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { useCurrentPet } from "@/hooks/usePetProfile";
import { usePetHistory } from "@/hooks/useMemories";
import { getLocalPostDateString } from "@/utils/dateUtils";
import { buildWrapped, wrappedSlides } from "@/utils/memoriesWrapped";
import { MemoryShareButton } from "@/components/Feed/MemoryShareButton";

const C = {
  cream: "#FFF7EF",
  card: "#FFFCF8",
  coral: "#FF6F61",
  peach: "#FFD9B3",
  warmBrown: "#3B241B",
  mutedBrown: "#7A6254",
};

export default function WrappedScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: currentPet } = useCurrentPet();
  const petName = currentPet?.name;

  const { data: history, isLoading } = usePetHistory(currentPet?.id);
  const today = getLocalPostDateString();
  const wrapped = buildWrapped(currentPet, {
    postDates: (history || []).map((p) => p.post_date),
    today,
  });
  const slides = wrappedSlides(wrapped);

  return (
    <View style={{ flex: 1, backgroundColor: C.cream, paddingTop: insets.top }}>
      <View style={styles.header}>
        <TouchableOpacity testID="wrapped-back" onPress={() => router.back()} style={{ marginRight: 12 }}>
          <ArrowLeft size={22} color={C.warmBrown} />
        </TouchableOpacity>
        <Text style={{ fontSize: 20, fontWeight: "800", color: C.warmBrown }}>
          {petName ? `${petName}'s Wrapped` : "Wrapped"}
        </Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}>
        {isLoading && <ActivityIndicator color={C.coral} />}

        {!isLoading && !wrapped.hasEnough && (
          <View testID="wrapped-empty" style={{ alignItems: "center", padding: 30 }}>
            <Text style={{ fontSize: 44 }}>🌱</Text>
            <Text style={{ fontSize: 17, fontWeight: "800", color: C.warmBrown, marginTop: 14, textAlign: "center" }}>
              Your Wrapped is growing
            </Text>
            <Text style={{ fontSize: 13, color: C.mutedBrown, marginTop: 6, textAlign: "center", lineHeight: 19 }}>
              {wrapped.message}
            </Text>
          </View>
        )}

        {!isLoading && wrapped.hasEnough &&
          slides.map((s) => (
            <View key={s.key} testID={`slide-${s.key}`} style={styles.slide}>
              <Text style={{ fontSize: 52, marginBottom: 10 }}>{s.emoji}</Text>
              {s.stat ? (
                <Text style={{ fontSize: 48, fontWeight: "900", color: C.coral, textAlign: "center" }}>{s.stat}</Text>
              ) : null}
              {s.headline ? (
                <Text style={{ fontSize: 24, fontWeight: "900", color: C.warmBrown, textAlign: "center" }}>{s.headline}</Text>
              ) : null}
              <Text style={{ fontSize: 15, fontWeight: "600", color: C.mutedBrown, textAlign: "center", marginTop: 8 }}>
                {s.label || s.sub}
              </Text>
              <View style={{ marginTop: 16 }}>
                <MemoryShareButton
                  petName={petName}
                  label="Share slide"
                  card={{
                    emoji: s.emoji,
                    stat: s.stat,
                    statLabel: s.label,
                    headline: s.headline || `${petName || "My pup"}'s Wrapped`,
                    subtitle: s.sub || s.label,
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
  slide: {
    backgroundColor: C.card,
    borderRadius: 22,
    padding: 28,
    marginBottom: 16,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: C.peach,
  },
};
