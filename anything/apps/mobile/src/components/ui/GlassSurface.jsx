// GlassSurface (ticket 2.77 — Liquid Glass foundation).
// An RN approximation of iOS 27 "Liquid Glass": an expo-blur BlurView with a
// translucent warm tint painted over it + a hairline edge for separation. Used
// for CHROME and floating overlays (tab bar, headers, sheet tops) — not for
// dense content cards, which should stay opaque for readability (see <Card/>).
//
// Accessibility: when Reduce Transparency is on, it renders a SOLID surface
// instead of the blur (no meaning is ever carried by transparency alone).

import React from "react";
import { View, StyleSheet } from "react-native";
import { BlurView } from "expo-blur";
import { MATERIALS, BLUR } from "@/constants/theme";
import { useReduceTransparency } from "@/hooks/useAccessibilityPrefs";

export function GlassSurface({
  children,
  intensity = BLUR.regular,
  tint = BLUR.tint, // expo-blur tint ("light" | "dark" | "default")
  // Translucent overlay painted on top of the blur for the warm glass color.
  glassColor = MATERIALS.glassTint,
  // Opaque color used when Reduce Transparency is on.
  solidColor = MATERIALS.solidFallback,
  borderColor = MATERIALS.glassBorder,
  style,
  contentStyle,
  // Test/override escape hatch; defaults to the live OS setting.
  forceSolid,
  ...rest
}) {
  const reduceTransparency = useReduceTransparency();
  const solid = forceSolid ?? reduceTransparency;

  if (solid) {
    return (
      <View
        style={[{ backgroundColor: solidColor, borderColor, overflow: "hidden" }, style]}
        {...rest}
      >
        <View style={contentStyle}>{children}</View>
      </View>
    );
  }

  return (
    <View style={[{ overflow: "hidden", borderColor }, style]} {...rest}>
      <BlurView
        intensity={intensity}
        tint={tint}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {/* Warm tint over the blur so the glass reads in the palette. */}
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: glassColor }]}
      />
      <View style={contentStyle}>{children}</View>
    </View>
  );
}

export default GlassSurface;
