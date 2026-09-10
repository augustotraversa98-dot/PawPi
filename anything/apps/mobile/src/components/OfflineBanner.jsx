import React from "react";
import { View, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { COLORS, TYPE, SPACING } from "@/constants/theme";
import { useIsOnline } from "@/utils/connectivity";

/**
 * Thin top strip shown while the device is offline (AUDIT_2026-09 A-06). Screens keep
 * rendering whatever is cached; this explains why lists look empty or a save failed,
 * instead of leaving the user to guess. Renders nothing while online.
 */
export function OfflineBanner() {
  const online = useIsOnline();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  if (online) return null;

  return (
    <View
      accessibilityRole="alert"
      testID="offline-banner"
      pointerEvents="none"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        paddingTop: insets.top,
        paddingBottom: SPACING.xs,
        paddingHorizontal: SPACING.md,
        backgroundColor: COLORS.warmBrown,
        alignItems: "center",
      }}
    >
      <Text style={[TYPE.caption, { color: COLORS.cream, textAlign: "center" }]}>
        {t("common.offlineBanner")}
      </Text>
    </View>
  );
}

export default OfflineBanner;
