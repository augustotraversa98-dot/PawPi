// ErrorState — the canonical "this failed to load" block (consistency audit S-01/S-02).
// A failed query must never read as an empty list ("no lost pets nearby", "no allergies recorded"):
// show a friendly line and a Retry. Strings default to the shared `common.somethingWrong` /
// `common.retry` keys (EN + ES); pass `message` for a context-specific line.

import React from "react";
import { View, Text } from "react-native";
import { useTranslation } from "react-i18next";
import { COLORS } from "@/constants/theme";
import { PressableScale } from "./PressableScale";

export function ErrorState({ onRetry, message, testID = "error-state", style }) {
  const { t } = useTranslation();
  return (
    <View testID={testID} style={[{ alignItems: "center", padding: 24 }, style]}>
      <Text style={{ textAlign: "center", color: COLORS.mutedBrown, fontSize: 14, lineHeight: 20 }}>
        {message || t("common.somethingWrong")}
      </Text>
      {onRetry ? (
        <PressableScale
          testID={`${testID}-retry`}
          onPress={onRetry}
          accessibilityRole="button"
          style={{
            marginTop: 12,
            minHeight: 44,
            paddingHorizontal: 20,
            borderRadius: 20,
            backgroundColor: COLORS.coral,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: COLORS.cream, fontWeight: "700" }}>{t("common.retry")}</Text>
        </PressableScale>
      ) : null}
    </View>
  );
}

export default ErrorState;
