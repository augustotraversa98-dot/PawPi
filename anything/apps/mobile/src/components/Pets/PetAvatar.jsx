import React from "react";
import { View } from "react-native";
import { Image } from "expo-image";
import { Dog } from "lucide-react-native";
import { COLORS } from "@/constants/colors";

// Pet avatar with a neutral Dog-icon fallback when there's no real photo.
// Never renders a sample/placeholder image — only the owner's actual avatar_url.
export function PetAvatar({ uri, size = 44 }) {
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
