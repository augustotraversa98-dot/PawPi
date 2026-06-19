// Elevation + material tokens (ticket 2.77 — Liquid Glass foundation).
// Lighter, warm-tinted shadows (less chunky chrome) and a small set of SEMANTIC
// material tokens layered on the existing palette. Glass tints are translucent
// derivations of COLORS hues — the redesign changes MATERIAL, not the hues.

import { COLORS } from "./colors";

// Soft, low-contrast elevation levels. Shadow color is warm (terracotta) so it
// reads as depth in the palette rather than a grey drop-shadow. `elevation` is
// the Android counterpart of the iOS shadow* props.
export const ELEVATION = {
  none: {},
  sm: {
    shadowColor: COLORS.terracotta,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  md: {
    shadowColor: COLORS.terracotta,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 3,
  },
  lg: {
    shadowColor: COLORS.terracotta,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
};

// Semantic material tokens. The `glass*` values are meant to sit on top of an
// expo-blur layer (chrome/overlays); the opaque `surface*` values are for
// content cards that must stay readable over busy feeds. `solidFallback` is what
// a glass surface degrades to when Reduce Transparency is on.
export const MATERIALS = {
  // Opaque content surfaces.
  surface: COLORS.card, // #FFFCF8 — primary card
  surfaceAlt: COLORS.cream, // #FFF7EF — screen background
  surfaceSunken: COLORS.sand, // #F8EBDD — inset fields / wells

  // Translucent chrome tints (paint OVER a BlurView).
  glassTint: "rgba(255, 247, 239, 0.72)", // cream @ 72%
  glassTintStrong: "rgba(255, 247, 239, 0.85)", // cream @ 85% (denser bars)
  glassTintLight: "rgba(255, 252, 248, 0.6)", // card @ 60% (subtle)
  glassBorder: "rgba(255, 217, 179, 0.6)", // peach hairline on glass

  // The opaque surface a glass layer falls back to under Reduce Transparency.
  solidFallback: COLORS.cream,

  // Scrim behind modals/sheets and a hairline divider color.
  overlay: "rgba(59, 36, 27, 0.45)", // warmBrown @ 45%
  hairline: "rgba(255, 217, 179, 0.7)", // peach @ 70%
};

// Default blur intensities for expo-blur (0–100). Tuned so chrome stays legible
// while still diffusing busy content behind it (the iOS 27 tuning goal).
export const BLUR = {
  thin: 20,
  regular: 40,
  thick: 60,
  // expo-blur tint that matches the warm palette.
  tint: "light",
};
