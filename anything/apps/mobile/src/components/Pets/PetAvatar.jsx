import React from "react";
import { View, Text } from "react-native";
import { Image } from "expo-image";
import { Dog } from "lucide-react-native";
import { COLORS } from "@/constants/colors";

// Derive up-to-two initials from a name ("Buddy" -> "BU", "Max Power" -> "MP").
// Returns "" when there is no usable name so callers fall back to the glyph.
export function getInitials(name) {
  if (!name) return "";
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

// Shared avatar with a proper fallback chain:
//   1. the real photo (uri) if present,
//   2. else initials from `name` on the brand color,
//   3. else a neutral Dog glyph.
// Never renders a broken image and never a hardcoded sample photo/name.
export function PetAvatar({ uri, name, size = 44 }) {
  const radius = size / 2;

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: radius }}
        contentFit="cover"
      />
    );
  }

  const initials = getInitials(name);

  if (initials) {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: COLORS.coral,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Text
          style={{
            color: "#FFFFFF",
            fontWeight: "700",
            fontSize: size * 0.4,
          }}
        >
          {initials}
        </Text>
      </View>
    );
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: COLORS.sand,
        justifyContent: "center",
        alignItems: "center",
        borderWidth: 1,
        borderColor: COLORS.peach,
      }}
    >
      <Dog size={size * 0.55} color={COLORS.coral} />
    </View>
  );
}
