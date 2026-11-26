import React from "react";
import { Alert, Linking, Text, TouchableOpacity, View } from "react-native";
import { Mail, Phone } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { COLORS } from "@/constants/colors";
import { TYPE, RADIUS, SPACING } from "@/constants/theme";
import { mailUrl, telUrl } from "@/utils/finderContact";

function ActionButton({ testID, icon: Icon, label, accessibilityLabel, onPress }) {
  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: SPACING.xs,
        minHeight: 44,
        paddingHorizontal: SPACING.lg,
        paddingVertical: SPACING.sm,
        borderRadius: RADIUS.control,
        backgroundColor: COLORS.coral,
      }}
    >
      <Icon size={16} color={COLORS.cream} />
      <Text style={[TYPE.subhead, { fontWeight: "800", color: COLORS.cream }]}>{label}</Text>
    </TouchableOpacity>
  );
}

// The finder's name, phone and email on an emergency notification, with tap-to-call and tap-to-email. When the
// phone cannot open the link (no phone app, no mail account), the value is shown so it can be copied by hand.
export default function EmergencyContactActions({ finder, onOpen }) {
  const { t } = useTranslation();
  if (!finder || (!finder.name && !finder.phone && !finder.email)) return null;

  const open = async (url, value) => {
    onOpen?.();
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert(t("notifications.emergencyOpenError"), value);
    }
  };

  const call = finder.phone ? telUrl(finder.phone) : null;
  const write = finder.email ? mailUrl(finder.email) : null;
  const line = [TYPE.subhead, { fontWeight: "700", color: COLORS.warmBrown }];

  return (
    <View testID="emergency-finder" style={{ marginTop: SPACING.sm, gap: SPACING.xs }}>
      {finder.name ? <Text style={line}>{finder.name}</Text> : null}
      {finder.phone ? (
        <Text selectable style={line}>
          {finder.phone}
        </Text>
      ) : null}
      {finder.email ? (
        <Text selectable style={line}>
          {finder.email}
        </Text>
      ) : null}
      {call || write ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm, marginTop: SPACING.xs }}>
          {call ? (
            <ActionButton
              testID="emergency-call"
              icon={Phone}
              label={t("notifications.emergencyCall")}
              accessibilityLabel={t("notifications.emergencyCallA11y", { value: finder.phone })}
              onPress={() => open(call, finder.phone)}
            />
          ) : null}
          {write ? (
            <ActionButton
              testID="emergency-email"
              icon={Mail}
              label={t("notifications.emergencyWrite")}
              accessibilityLabel={t("notifications.emergencyWriteA11y", { value: finder.email })}
              onPress={() => open(write, finder.email)}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
