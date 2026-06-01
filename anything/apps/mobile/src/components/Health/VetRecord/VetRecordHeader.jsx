import React from "react";
import { View, Text } from "react-native";
import { healthColors } from "@/constants/healthColors";

export function VetRecordHeader() {
  return (
    <View style={{ marginBottom: 20 }}>
      <Text
        style={{
          fontSize: 20,
          fontWeight: "800",
          color: healthColors.warmBrown,
          marginBottom: 4,
        }}
      >
        Vet Record
      </Text>
      <Text
        style={{ fontSize: 14, color: healthColors.mutedBrown, lineHeight: 20 }}
      >
        Medical history, visits, and documents for Phoebe
      </Text>
    </View>
  );
}
