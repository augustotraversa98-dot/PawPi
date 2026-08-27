import React from "react";
import { View, Text, ActivityIndicator, FlatList } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft, PawPrint, MapPin } from "lucide-react-native";
import { PressableScale } from "@/components/ui";
import { COLORS } from "@/constants/colors";
import { TYPE, RADIUS, SPACING } from "@/constants/theme";
import { useDiscoverProviders } from "@/hooks/useProviders";
import PetPolicyBadge from "@/components/Providers/PetPolicyBadge";

// Pet-friendly directory — surfaces the seeded provider_type='pet_friendly' rows
// (0124 loader) via the extended discover route. Each row shows the location, the
// dogs-allowed badge (from provider_locations.pet_policy), and tapping a row goes
// to the storefront profile where the caller can also open a claim if they own it.
export default function PetFriendlyScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const { data: providers, isLoading, refetch, isRefetching } = useDiscoverProviders({
    provider_type: "pet_friendly",
  });

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.cream, paddingTop: insets.top }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: SPACING.md,
          paddingVertical: SPACING.sm,
          gap: SPACING.md,
        }}
      >
        <PressableScale
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t("common.back")}
        >
          <ArrowLeft size={22} color={COLORS.brown} />
        </PressableScale>
        <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.sm, flex: 1 }}>
          <PawPrint size={20} color={COLORS.coral} />
          <Text style={[TYPE.h3, { color: COLORS.brown }]}>{t("petFriendly.title")}</Text>
        </View>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={COLORS.coral} />
        </View>
      ) : (providers ?? []).length === 0 ? (
        <View style={{ padding: SPACING.xl, alignItems: "center", gap: SPACING.md }}>
          <PawPrint size={40} color={COLORS.coral} />
          <Text style={[TYPE.h4, { color: COLORS.brown, textAlign: "center" }]}>
            {t("petFriendly.emptyTitle")}
          </Text>
          <Text style={[TYPE.body, { color: COLORS.brown, opacity: 0.7, textAlign: "center" }]}>
            {t("petFriendly.emptyBody")}
          </Text>
        </View>
      ) : (
        <FlatList
          data={providers}
          keyExtractor={(p) => String(p.id)}
          contentContainerStyle={{ padding: SPACING.md, gap: SPACING.sm }}
          refreshing={isRefetching}
          onRefresh={refetch}
          renderItem={({ item }) => (
            <PressableScale
              onPress={() =>
                router.push({
                  pathname: "/service/provider",
                  params: { slug: item.slug },
                })
              }
              accessibilityRole="button"
              style={{
                padding: SPACING.md,
                borderRadius: RADIUS.md,
                borderWidth: 1,
                borderColor: COLORS.peach,
                backgroundColor: COLORS.card,
                gap: SPACING.xs,
              }}
            >
              <Text style={[TYPE.h4, { color: COLORS.brown }]}>{item.name}</Text>
              {item.location_address ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <MapPin size={12} color={COLORS.brown} />
                  <Text
                    style={[TYPE.caption, { color: COLORS.brown, opacity: 0.7, flex: 1 }]}
                    numberOfLines={1}
                  >
                    {item.location_address}
                  </Text>
                </View>
              ) : null}
              <PetPolicyBadge policy={item.pet_policy} />
            </PressableScale>
          )}
        />
      )}
    </View>
  );
}
