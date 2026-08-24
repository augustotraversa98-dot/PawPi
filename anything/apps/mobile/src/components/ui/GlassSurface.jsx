// GlassSurface (ticket 2.77 — Liquid Glass foundation; iOS 26 upgrade).
// The shared CHROME material for the navigation/control layer — floating headers,
// top bars, sheet tops, floating buttons. NOT for dense content cards, which stay
// opaque for readability (see <Card/>). Every header/bar in the app routes through
// here, so this one primitive is where the material lives.
//
// It renders the best material available, in priority order:
//   1. Reduce Transparency ON  → a SOLID surface (no meaning via transparency).
//   2. iOS 26 Liquid Glass available → the REAL refractive `GlassView` material
//      (expo-glass-effect), which the system renders + adapts.
//   3. Otherwise (iOS < 26, Android) → the expo-blur BlurView + warm tint
//      approximation we've always shipped.
//
// Apple's rule: glass is for chrome, never content, and never glass-on-glass —
// callers must not nest a GlassSurface inside another.

import React from "react";
import { View, StyleSheet, Platform } from "react-native";
import { BlurView } from "expo-blur";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { MATERIALS, BLUR } from "@/constants/theme";
import { useReduceTransparency } from "@/hooks/useAccessibilityPrefs";

// Whether the real iOS 26 Liquid Glass material is available. Guarded so it can
// never throw (the native module is absent on Android / in Jest → treat as
// unavailable and fall back to the BlurView path). Evaluated once at module load.
function detectLiquidGlass() {
  if (Platform.OS !== "ios") return false;
  try {
    return isLiquidGlassAvailable();
  } catch {
    return false;
  }
}
const LIQUID_GLASS = detectLiquidGlass();

export function GlassSurface({
  children,
  intensity = BLUR.regular,
  tint = BLUR.tint, // expo-blur tint ("light" | "dark" | "default")
  // Translucent overlay painted on top of the blur for the warm glass color.
  // On the real Liquid Glass path this is passed as the material's tintColor.
  glassColor = MATERIALS.glassTint,
  // Opaque color used when Reduce Transparency is on.
  solidColor = MATERIALS.solidFallback,
  borderColor = MATERIALS.glassBorder,
  // Android blur method. Default 'none' renders a flat translucent overlay (no
  // real blur); pass "dimezisBlurView" when you need an actual translucent blur
  // of the content behind (e.g. the locked-feed tease). Ignored on iOS.
  experimentalBlurMethod,
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

  // iOS 26: the genuine Liquid Glass material. The GlassView samples + refracts
  // the content scrolling behind it; a light warm tint keeps it on-brand.
  if (LIQUID_GLASS) {
    return (
      <View style={[{ overflow: "hidden", borderColor }, style]} {...rest}>
        <GlassView
          glassEffectStyle="regular"
          tintColor={glassColor}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View style={contentStyle}>{children}</View>
      </View>
    );
  }

  // iOS < 26 / Android: expo-blur approximation (warm tint over a BlurView).
  return (
    <View style={[{ overflow: "hidden", borderColor }, style]} {...rest}>
      <BlurView
        intensity={intensity}
        tint={tint}
        experimentalBlurMethod={experimentalBlurMethod}
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
