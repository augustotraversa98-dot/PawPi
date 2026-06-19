// Button (ticket 2.77 — Liquid Glass foundation).
// The canonical app button: token-driven sizing/radius/type, a soft warm shadow
// on the filled variant, and the PressableScale spring on press. Variants keep
// the existing palette (coral primary). Purely presentational — pass onPress.
//
// Variants: "primary" (coral fill) | "secondary" (outline) | "tonal" (soft sand)
//           | "ghost" (text only). Sizes: "sm" | "md" | "lg".

import React from "react";
import { Text, View, ActivityIndicator } from "react-native";
import {
  COLORS,
  RADIUS,
  TYPE,
  ELEVATION,
  SPACING,
} from "@/constants/theme";
import { PressableScale } from "./PressableScale";

const SIZES = {
  sm: { paddingV: SPACING.sm, paddingH: SPACING.lg, type: TYPE.subhead },
  md: { paddingV: 14, paddingH: SPACING.xl, type: TYPE.headline },
  lg: { paddingV: SPACING.lg, paddingH: SPACING.xxl, type: TYPE.headline },
};

function variantStyle(variant, disabled) {
  switch (variant) {
    case "secondary":
      return {
        container: { backgroundColor: "transparent", borderWidth: 1.5, borderColor: COLORS.peach },
        label: { color: COLORS.coral },
        elevation: ELEVATION.none,
      };
    case "tonal":
      return {
        container: { backgroundColor: COLORS.sand, borderWidth: 1, borderColor: COLORS.peach },
        label: { color: COLORS.terracotta },
        elevation: ELEVATION.none,
      };
    case "ghost":
      return {
        container: { backgroundColor: "transparent" },
        label: { color: COLORS.coral },
        elevation: ELEVATION.none,
      };
    case "primary":
    default:
      return {
        container: { backgroundColor: COLORS.coral },
        label: { color: "#FFF" },
        elevation: disabled ? ELEVATION.none : ELEVATION.sm,
      };
  }
}

export function Button({
  title,
  children,
  onPress,
  variant = "primary",
  size = "md",
  disabled = false,
  loading = false,
  icon = null, // optional leading element
  fullWidth = true,
  style,
  textStyle,
  ...rest
}) {
  const s = SIZES[size] || SIZES.md;
  const v = variantStyle(variant, disabled);
  const isDisabled = disabled || loading;

  return (
    <PressableScale
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={[
        {
          borderRadius: RADIUS.control,
          paddingVertical: s.paddingV,
          paddingHorizontal: s.paddingH,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: SPACING.sm,
          alignSelf: fullWidth ? "stretch" : "flex-start",
          opacity: isDisabled ? 0.6 : 1,
        },
        v.container,
        v.elevation,
        // Tint the filled shadow with the fill color for a cohesive glow.
        variant === "primary" && !isDisabled ? { shadowColor: COLORS.coral } : null,
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator size="small" color={v.label.color} />
      ) : (
        <>
          {icon ? <View>{icon}</View> : null}
          {children ?? (
            <Text style={[s.type, v.label, textStyle]}>{title}</Text>
          )}
        </>
      )}
    </PressableScale>
  );
}

export default Button;
