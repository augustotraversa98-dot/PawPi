import React from "react";
import { Text, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { COLORS, TYPE, SPACING } from "@/constants/theme";
import { PressableScale } from "@/components/ui";
import { startOver } from "@/utils/auth/recovery";

// In-progress onboarding state that must not leak into the next account.
export const ONBOARDING_DRAFT_KEYS = [
  "onboarding_progress",
  "onboarding_pet_photo",
  "create_first_moment",
];

// Low-emphasis escape for a signed-in user who has no pet yet and can't reach More/Settings:
// confirm → drop the onboarding draft → clear the session (setAuth(null) deletes the Keychain
// token) → Welcome.
export default function UseDifferentAccountLink({ style }) {
  const { t } = useTranslation();
  const router = useRouter();

  const confirm = () => {
    Alert.alert(
      t("onboarding.useDifferentAccountTitle"),
      t("onboarding.useDifferentAccountBody"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("onboarding.useDifferentAccountConfirm"),
          style: "destructive",
          onPress: async () => {
            try {
              await AsyncStorage.multiRemove(ONBOARDING_DRAFT_KEYS);
            } catch {
              // best-effort — never block the way out
            }
            // Lazy-require so importing the screens doesn't pull the auth store (SecureStore +
            // QueryClient) into unrelated test renders.
            const { useAuthStore } = require("@/utils/auth/store");
            startOver({ setAuth: useAuthStore.getState().setAuth, router });
          },
        },
      ],
    );
  };

  return (
    <PressableScale
      testID="onboarding-use-different-account"
      onPress={confirm}
      accessibilityRole="button"
      style={[{ paddingVertical: SPACING.md, alignItems: "center" }, style]}
    >
      <Text style={[TYPE.callout, { color: COLORS.mutedBrown, opacity: 0.8 }]}>
        {t("onboarding.useDifferentAccount")}
      </Text>
    </PressableScale>
  );
}
