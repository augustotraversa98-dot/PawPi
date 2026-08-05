import React from "react";
import { View, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react-native";
import { COLORS } from "@/constants/colors";
import { TYPE, SPACING, MATERIALS, BLUR } from "@/constants/theme";
import { PressableScale, GlassSurface } from "@/components/ui";
import MyActivity from "@/components/Services/MyActivity";

// Thin wrapper around the shared My Activity surface so the existing deep-link to
// /service/activity still works (pushed over the tab bar, with a back header). The Services
// tab renders <MyActivity/> directly under its [Discover | My Activity] toggle instead.
export default function ActivityScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();

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
            {t("activity.title")}
          </Text>
          <Text style={[TYPE.footnote, { color: COLORS.mutedBrown, marginTop: 1 }]}>
            {t("activity.subtitle")}
          </Text>
        </View>
      </GlassSurface>

      <MyActivity />
    </View>
  );
}
