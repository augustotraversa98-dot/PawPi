import React from "react";
import { View, Text } from "react-native";
import { Info } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { COLORS } from "@/constants/colors";
import { TYPE, RADIUS, SPACING } from "@/constants/theme";

// Why an unclaimed listing's storefront has no Book or Message action.
export default function UnclaimedNotice() {
  const { t } = useTranslation();
  return (
    <View
      testID="provider-unclaimed-notice"
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        gap: SPACING.sm,
        marginBottom: SPACING.md,
        borderRadius: RADIUS.control,
        backgroundColor: COLORS.sand,
        padding: SPACING.md,
      }}
    >
      <Info size={18} color={COLORS.warmBrown} />
      <Text style={[TYPE.subhead, { color: COLORS.warmBrown, flex: 1 }]}>
        {t("providers.unclaimed.notice")}
      </Text>
    </View>
  );
}
