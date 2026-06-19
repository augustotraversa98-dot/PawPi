// Sheet (ticket 2.77 — Liquid Glass foundation).
// The shared material surface for sheet/modal CONTAINERS: a large top radius, a
// soft top shadow lifting it off the scrim, and an optional grabber handle — the
// iOS 27 sheet anatomy. The body is opaque for readability; pass `glassHeader`
// to float a translucent header region (e.g. a sticky title bar) on top.
//
// This is a surface, not a presenter — wrap it in an RN <Modal> (or the existing
// KeyboardSafeFormModal) for actual presentation. Behavior stays with the caller.

import React from "react";
import { View } from "react-native";
import {
  COLORS,
  RADIUS,
  ELEVATION,
  MATERIALS,
  SPACING,
} from "@/constants/theme";

// The small drag affordance at the top of an iOS sheet.
export function Grabber({ color = MATERIALS.hairline }) {
  return (
    <View style={{ alignItems: "center", paddingTop: SPACING.sm, paddingBottom: SPACING.xs }}>
      <View
        style={{
          width: 40,
          height: 5,
          borderRadius: RADIUS.chip,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

export function Sheet({
  children,
  grabber = true,
  color = MATERIALS.surface,
  radius = RADIUS.sheet,
  style,
  ...rest
}) {
  return (
    <View
      style={[
        {
          flex: 1,
          backgroundColor: color,
          borderTopLeftRadius: radius,
          borderTopRightRadius: radius,
          overflow: "hidden",
        },
        ELEVATION.lg,
        style,
      ]}
      {...rest}
    >
      {grabber ? <Grabber /> : null}
      {children}
    </View>
  );
}

export default Sheet;
