import React from "react";
import { View, Text, ActivityIndicator, FlatList } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft, BadgeCheck, Clock, CheckCircle, XCircle } from "lucide-react-native";
import { PressableScale } from "@/components/ui";
import { COLORS } from "@/constants/colors";
import { TYPE, RADIUS, SPACING } from "@/constants/theme";
import { useMyClaims } from "@/hooks/useProviderClaims";

// "My claims" — the caller's business-claim history (0125). One row per (business,
// claimant) — a re-opened rejected claim shows as pending on the SAME row (the API
// updates the existing row rather than inserting a duplicate).
export default function MyClaimsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const { data: claims, isLoading, refetch, isRefetching } = useMyClaims();

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
        <Text style={[TYPE.h3, { color: COLORS.brown }]}>{t("claim.myClaimsTitle")}</Text>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={COLORS.coral} />
        </View>
      ) : (claims ?? []).length === 0 ? (
        <View style={{ padding: SPACING.xl, alignItems: "center", gap: SPACING.md }}>
          <BadgeCheck size={40} color={COLORS.coral} />
          <Text style={[TYPE.h4, { color: COLORS.brown, textAlign: "center" }]}>
            {t("claim.myClaimsEmptyTitle")}
          </Text>
          <Text style={[TYPE.body, { color: COLORS.brown, opacity: 0.7, textAlign: "center" }]}>
            {t("claim.myClaimsEmptyBody")}
          </Text>
        </View>
      ) : (
        <FlatList
          data={claims}
          keyExtractor={(c) => String(c.id)}
          contentContainerStyle={{ padding: SPACING.md, gap: SPACING.sm }}
          refreshing={isRefetching}
          onRefresh={refetch}
          renderItem={({ item }) => (
            <PressableScale
              onPress={() =>
                item.provider_slug
                  ? router.push({
                      pathname: "/service/provider",
                      params: { slug: item.provider_slug },
                    })
                  : null
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
              <Text style={[TYPE.h4, { color: COLORS.brown }]}>{item.provider_name}</Text>
              <ClaimStatusChip status={item.status} />
            </PressableScale>
          )}
        />
      )}
    </View>
  );
}

function ClaimStatusChip({ status }) {
  const { t } = useTranslation();
  const map = {
    pending: { Icon: Clock, color: COLORS.coral, label: t("claim.statusPending") },
    approved: { Icon: CheckCircle, color: "#2FA84F", label: t("claim.statusApproved") },
    rejected: { Icon: XCircle, color: "#B33A3A", label: t("claim.statusRejected") },
    withdrawn: { Icon: XCircle, color: COLORS.brown, label: t("claim.statusWithdrawn") },
  };
  const spec = map[status] || map.pending;
  const { Icon, color, label } = spec;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <Icon size={14} color={color} />
      <Text style={[TYPE.caption, { color, fontWeight: "700" }]}>{label}</Text>
    </View>
  );
}
