import React from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { Check } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { COLORS, TYPE, SPACING, RADIUS, MATERIALS } from "@/constants/theme";
import { PressableScale } from "@/components/ui";

// Status line + tappable alternatives under a handle input. One component so onboarding and
// profile edit say exactly the same thing (checking / available / taken / invalid / unverified).
const ERROR_RED = "#FF4444";

export default function HandleAvailabilityHint({
  availability,
  onPickAlternative,
  testIDPrefix = "handle",
}) {
  const { t } = useTranslation();
  const { status, reason, alternatives = [] } = availability;

  if (status === "idle") return null;

  if (status === "checking") {
    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.xs, marginTop: SPACING.sm }}>
        <ActivityIndicator size="small" color={COLORS.mutedBrown} />
        <Text testID={`${testIDPrefix}-checking`} style={[TYPE.callout, { color: COLORS.mutedBrown }]}>
          {t("onboarding.handleChecking")}
        </Text>
      </View>
    );
  }

  if (status === "available") {
    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.xs, marginTop: SPACING.sm }}>
        <Check size={16} color={COLORS.sageDark} />
        <Text testID={`${testIDPrefix}-available`} style={[TYPE.callout, { color: COLORS.sageDark }]}>
          {t("onboarding.handleAvailable")}
        </Text>
      </View>
    );
  }

  if (status === "unverified") {
    return (
      <Text testID={`${testIDPrefix}-unverified`} style={[TYPE.callout, { color: COLORS.mutedBrown, marginTop: SPACING.sm }]}>
        {t("onboarding.handleUnverified")}
      </Text>
    );
  }

  if (status === "invalid") {
    return (
      <Text testID={`${testIDPrefix}-error`} style={[TYPE.callout, { color: ERROR_RED, marginTop: SPACING.sm }]}>
        {t(`onboarding.handleReason.${reason || "invalid_chars"}`)}
      </Text>
    );
  }

  // taken
  return (
    <View style={{ marginTop: SPACING.sm }}>
      <Text testID={`${testIDPrefix}-error`} style={[TYPE.callout, { color: ERROR_RED }]}>
        {t("onboarding.handleTaken")}
      </Text>
      {alternatives.length > 0 ? (
        <View style={{ marginTop: SPACING.xs }}>
          <Text style={[TYPE.callout, { color: COLORS.mutedBrown }]}>
            {t("onboarding.handleTakenAlternatives")}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: SPACING.xs, marginTop: SPACING.xs }}>
            {alternatives.map((alt) => (
              <PressableScale
                key={alt}
                testID={`${testIDPrefix}-alt-${alt}`}
                accessibilityRole="button"
                accessibilityLabel={`@${alt}`}
                onPress={() => onPickAlternative?.(alt)}
                style={{
                  backgroundColor: MATERIALS.surfaceSunken,
                  borderWidth: 1,
                  borderColor: COLORS.coral,
                  borderRadius: RADIUS.control,
                  paddingVertical: 8,
                  paddingHorizontal: SPACING.md,
                  minHeight: 44,
                  justifyContent: "center",
                }}
              >
                <Text style={[TYPE.callout, { fontWeight: "600", color: COLORS.warmBrown }]}>@{alt}</Text>
              </PressableScale>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}
