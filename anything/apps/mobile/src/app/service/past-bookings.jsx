import React from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react-native";
import { COLORS } from "@/constants/colors";
import { TYPE, SPACING, MATERIALS, BLUR } from "@/constants/theme";
import { PressableScale, GlassSurface } from "@/components/ui";
import { RefreshableScrollView } from "@/components/RefreshableScrollView";
import { useMyBookings } from "@/hooks/useProviders";
import { PastBookingRow, EmptyRow } from "@/components/Services/MyActivity";

// Full PAST-bookings history (My Activity → Past → "See all"). The My Activity pane caps Past
// at 5; this screen lists ALL of useMyBookings().past with no cap, reusing the SAME row so the
// rendering + routing (→ /service/booking-summary) stay identical. Pushed over the tab bar;
// back returns to the caller.
export default function PastBookingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();

  const { data, isLoading, refetch } = useMyBookings();
  const past = data?.past ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
      <GlassSurface
        intensity={BLUR.thick}
        style={{ borderBottomWidth: 1, borderColor: MATERIALS.glassBorder }}
        contentStyle={{
          paddingTop: insets.top,
          paddingHorizontal: SPACING.xl,
          paddingBottom: SPACING.md + 2,
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <PressableScale
          onPress={() => router.back()}
          accessibilityLabel={t("common.back")}
          style={{ marginRight: SPACING.md + 2 }}
        >
          <ArrowLeft size={22} color={COLORS.warmBrown} />
        </PressableScale>
        <View style={{ flex: 1 }}>
          <Text style={[TYPE.title, { color: COLORS.warmBrown }]}>
            {t("activity.pastTitle")}
          </Text>
        </View>
      </GlassSurface>

      {isLoading ? (
        <View
          testID="past-bookings-loading"
          style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
        >
          <ActivityIndicator color={COLORS.coral} />
        </View>
      ) : (
        <RefreshableScrollView
          refetch={refetch}
          contentContainerStyle={{ padding: SPACING.lg, paddingBottom: insets.bottom + 40 }}
        >
          {past.length === 0 ? (
            <EmptyRow testID="past-bookings-empty" text={t("activity.emptyPast")} />
          ) : (
            past.map((b) => <PastBookingRow key={b.id} booking={b} />)
          )}
        </RefreshableScrollView>
      )}
    </View>
  );
}
