import React from "react";
import { View, Text } from "react-native";
import { healthColors } from "@/constants/healthColors";

export function InfoBox() {
  return (
    <View
      style={{
        marginTop: 20,
        backgroundColor: healthColors.sand,
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: healthColors.peach,
      }}
    >
      <Text
        style={{
          fontSize: 13,
          color: healthColors.mutedBrown,
          lineHeight: 19,
          textAlign: "center",
        }}
      >
        Keep all vet records in one place. Easily share medical history with new
        vets or specialists.
      </Text>
    </View>
  );
}
