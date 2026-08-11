import React from "react";
import { View, Text, Image, FlatList, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Store, ChevronRight } from "lucide-react-native";
import { Card, PressableScale } from "@/components/ui";
import { COLORS } from "@/constants/colors";
import { TYPE, RADIUS, SPACING } from "@/constants/theme";
import { useFollowedProviders } from "@/hooks/useProviders";

// "Businesses you follow" (ticket 2.92) — the list of providers the signed-in pet owner follows.
// Real data via GET /api/providers/following; empty → empty state; each row opens that business.
// Reachable from the More hub. Reuses the simple card/row list pattern (like the 2.61 follows list).
export default function FollowingBusinessesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const { data: providers = [], isLoading } = useFollowedProviders();

  const openProvider = (p) => {
    if (!p?.slug) return;
    router.push({ pathname: "/service/provider", params: { slug: String(p.slug) } });
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
      <View
        style={{
          paddingTop: insets.top + SPACING.sm,
          paddingHorizontal: SPACING.xl,
          paddingBottom: SPACING.md,
          flexDirection: "row",
          alignItems: "center",
          borderBottomWidth: 1,
          borderBottomColor: COLORS.peach,
          backgroundColor: COLORS.card,
        }}
      >
        <PressableScale onPress={() => router.back()} style={{ marginRight: SPACING.md }}>
          <ArrowLeft size={22} color={COLORS.warmBrown} />
        </PressableScale>
        <Text style={[TYPE.title2, { color: COLORS.warmBrown }]} numberOfLines={1}>
          {t("storefront.follow.listTitle")}
        </Text>
      </View>

      {isLoading ? (
        <ActivityIndicator color={COLORS.coral} style={{ marginTop: SPACING.xl }} />
      ) : (
        <FlatList
          data={providers}
          keyExtractor={(p) => String(p.id)}
          contentContainerStyle={{ padding: SPACING.xl, paddingBottom: insets.bottom + SPACING.xl }}
          ListEmptyComponent={
            <View testID="following-empty" style={{ alignItems: "center", marginTop: SPACING.xl * 2 }}>
              <Store size={34} color={COLORS.mutedBrown} />
              <Text
                style={[TYPE.callout, { color: COLORS.warmBrown, marginTop: SPACING.md, fontWeight: "700" }]}
              >
                {t("storefront.follow.listEmpty")}
              </Text>
              <Text style={[TYPE.footnote, { color: COLORS.mutedBrown, marginTop: 4, textAlign: "center" }]}>
                {t("storefront.follow.listSubtitle")}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <PressableScale
              testID="following-row"
              onPress={() => openProvider(item)}
              style={{ marginBottom: SPACING.sm + 2 }}
            >
              <Card level="sm" radius={RADIUS.md} style={{ padding: SPACING.md + 2, flexDirection: "row", alignItems: "center", gap: SPACING.md }}>
                {item.logo_url ? (
                  <Image
                    source={{ uri: item.logo_url }}
                    style={{ width: 44, height: 44, borderRadius: RADIUS.control, backgroundColor: COLORS.sand }}
                  />
                ) : (
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: RADIUS.control,
                      backgroundColor: COLORS.sand,
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    <Store size={20} color={COLORS.coral} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={[TYPE.callout, { color: COLORS.warmBrown, fontWeight: "800" }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  {item.provider_type ? (
                    <Text
                      style={[TYPE.footnote, { color: COLORS.mutedBrown, textTransform: "capitalize" }]}
                      numberOfLines={1}
                    >
                      {item.provider_type}
                    </Text>
                  ) : null}
                </View>
                <ChevronRight size={18} color={COLORS.peach} />
              </Card>
            </PressableScale>
          )}
        />
      )}
    </View>
  );
}
