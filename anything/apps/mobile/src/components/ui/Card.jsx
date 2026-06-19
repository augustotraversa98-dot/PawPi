// Card (ticket 2.77 — Liquid Glass foundation).
// An OPAQUE content surface with the new softer radius, hairline edge, and a
// light warm shadow (lighter chrome than the old chunky cards). Content cards
// stay opaque on purpose — glass is for chrome, readability wins for content.
//
// `level` selects the elevation token. Pass `padded` for the standard inset, or
// override everything via `style`. Purely presentational — no behavior.

import React from "react";
import { View } from "react-native";
import { COLORS, RADIUS, ELEVATION, MATERIALS, SPACING } from "@/constants/theme";

export function Card({
  children,
  level = "md", // "none" | "sm" | "md" | "lg"
  radius = RADIUS.card,
  padded = false,
  color = MATERIALS.surface,
  borderColor = MATERIALS.hairline,
  style,
  ...rest
}) {
  return (
    <View
      style={[
        {
          backgroundColor: color,
          borderRadius: radius,
          borderWidth: 1,
          borderColor,
        },
        ELEVATION[level] || ELEVATION.md,
        padded && { padding: SPACING.lg },
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}

export default Card;
