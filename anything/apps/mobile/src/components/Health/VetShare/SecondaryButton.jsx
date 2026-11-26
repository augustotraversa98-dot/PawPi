import React from "react";
import { Text, TouchableOpacity } from "react-native";
import { COLORS, MATERIALS, RADIUS, SPACING, TYPE } from "@/constants/theme";

export default function SecondaryButton({ label, onPress, disabled, testID }) {
  return (
    <TouchableOpacity
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={{
        marginTop: SPACING.sm,
        borderRadius: RADIUS.control,
        borderWidth: 1.5,
        borderColor: MATERIALS.hairline,
        paddingVertical: 12,
        paddingHorizontal: SPACING.lg,
        alignItems: "center",
      }}
    >
      <Text style={[TYPE.callout, { fontWeight: "800", color: COLORS.terracotta, textAlign: "center" }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}
