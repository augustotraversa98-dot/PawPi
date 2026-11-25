import React from "react";
import { Text } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { COLORS, TYPE, SPACING } from "@/constants/theme";
import { PressableScale } from "@/components/ui";

// For someone who joined PawPi to help with a dog that already exists: skip creating a dog, use the owner's code.
export default function HaveInviteCodeLink({ style }) {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <PressableScale
      testID="onboarding-have-invite-code"
      accessibilityRole="button"
      onPress={() => router.push("/pet-sharing?tab=shared")}
      style={[{ paddingVertical: SPACING.md, alignItems: "center" }, style]}
    >
      <Text style={[TYPE.callout, { color: COLORS.coral, fontWeight: "700" }]}>
        {t("onboarding.haveInviteCode")}
      </Text>
    </PressableScale>
  );
}
