import React from "react";
import { View, Text, TouchableOpacity, ScrollView, Linking } from "react-native";
import { useTranslation } from "react-i18next";
import { Sparkles } from "lucide-react-native";
import { COLORS, TYPE, RADIUS, SPACING } from "@/constants/theme";
import { PRIVACY_POLICY_URL } from "@/constants/legal";

// The permission screen shown the first time a Vet Record document could be read (Apple 5.1.2(i)): who receives it (Anthropic), why,
// and that it is the person's choice. The document is already saved when this appears, so neither answer can lose it.
// Rendered inside AddDocumentModal's sheet; the caller owns what each button does.
export function AiDocConsentScreen({ onAllow, onNotNow }) {
  const { t } = useTranslation();
  const paragraph = [
    TYPE.body,
    { color: COLORS.mutedBrown, marginTop: SPACING.md, textAlign: "center", lineHeight: 21 },
  ];

  return (
    <ScrollView
      testID="ai-doc-consent"
      style={{ flex: 1 }}
      contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24, paddingBottom: 48 }}
    >
      <View style={{ alignItems: "center" }}>
        <Sparkles size={40} color={COLORS.coral} />
        <Text
          accessibilityRole="header"
          style={[
            TYPE.headline,
            { fontWeight: "800", color: COLORS.warmBrown, marginTop: SPACING.lg, textAlign: "center" },
          ]}
        >
          {t("health.vetRecord.aiConsent.title")}
        </Text>
        <Text style={paragraph}>{t("health.vetRecord.aiConsent.body")}</Text>
        <Text style={paragraph}>{t("health.vetRecord.aiConsent.limits")}</Text>
        {PRIVACY_POLICY_URL ? (
          <TouchableOpacity
            testID="ai-doc-consent-privacy"
            accessibilityRole="link"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            onPress={() => Linking.openURL(PRIVACY_POLICY_URL).catch(() => {})}
            style={{ marginTop: SPACING.lg, paddingVertical: 4 }}
          >
            <Text style={[TYPE.body, { color: COLORS.warmBrown, fontWeight: "700", textDecorationLine: "underline" }]}>
              {t("health.vetRecord.aiConsent.privacyLink")}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <TouchableOpacity
        testID="ai-doc-consent-allow"
        accessibilityRole="button"
        onPress={onAllow}
        style={{
          marginTop: SPACING.xxl,
          backgroundColor: COLORS.coral,
          borderRadius: RADIUS.control,
          minHeight: 52,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Text style={[TYPE.headline, { color: "#FFF", fontWeight: "800" }]}>
          {t("health.vetRecord.aiConsent.allow")}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        testID="ai-doc-consent-not-now"
        accessibilityRole="button"
        onPress={onNotNow}
        style={{ marginTop: SPACING.sm, minHeight: 48, justifyContent: "center", alignItems: "center" }}
      >
        <Text style={[TYPE.headline, { color: COLORS.mutedBrown, fontWeight: "700" }]}>
          {t("health.vetRecord.aiConsent.notNow")}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

export default AiDocConsentScreen;
