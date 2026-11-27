import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Circle, CircleDot, Info, Square, SquareCheck } from "lucide-react-native";
import { COLORS, MATERIALS, RADIUS, SPACING, TYPE } from "@/constants/theme";

// The pieces the share sheet and the record link steps are built from.

export const text = [TYPE.callout, { color: COLORS.warmBrown, lineHeight: 20 }];
export const bold = [TYPE.callout, { color: COLORS.warmBrown, fontWeight: "800" }];
export const muted = [TYPE.footnote, { color: COLORS.mutedBrown, lineHeight: 18 }];
export const card = {
  backgroundColor: MATERIALS.surface,
  borderRadius: RADIUS.control,
  borderWidth: 1,
  borderColor: MATERIALS.hairline,
  padding: SPACING.lg,
  marginBottom: SPACING.sm,
};
export const row = { flexDirection: "row", gap: 12 };
export const picked = { borderColor: COLORS.coral, borderWidth: 2 };

export function Heading({ children }) {
  return (
    <Text
      accessibilityRole="header"
      style={[TYPE.headline, { color: COLORS.warmBrown, marginTop: SPACING.lg, marginBottom: SPACING.sm }]}
    >
      {children}
    </Text>
  );
}

// A radio or checkbox row with a title and an optional explanation.
export function Choice({ testID, role, selected, onPress, title, description }) {
  const On = role === "checkbox" ? SquareCheck : CircleDot;
  const Off = role === "checkbox" ? Square : Circle;
  const Icon = selected ? On : Off;
  return (
    <TouchableOpacity
      testID={testID}
      accessibilityRole={role}
      accessibilityState={role === "checkbox" ? { checked: selected } : { selected }}
      onPress={onPress}
      style={[card, row, { alignItems: "center" }, selected && picked]}
    >
      <Icon size={22} color={selected ? COLORS.coral : COLORS.mutedBrown} />
      <View style={{ flex: 1 }}>
        <Text style={[TYPE.callout, { fontWeight: "700", color: COLORS.warmBrown }]}>{title}</Text>
        {description ? <Text style={muted}>{description}</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

export function Note({ icon: Icon = Info, children, testID, style }) {
  return (
    <View testID={testID} style={[card, { flexDirection: "row", gap: 8 }, style]}>
      <Icon size={16} color={COLORS.mutedBrown} style={{ marginTop: 2 }} />
      <View style={{ flex: 1, gap: 4 }}>{children}</View>
    </View>
  );
}
