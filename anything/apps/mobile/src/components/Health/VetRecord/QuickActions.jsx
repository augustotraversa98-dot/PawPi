import React from "react";
import { View, TouchableOpacity, Text } from "react-native";
import { Plus, Share2 } from "lucide-react-native";
import { healthColors } from "@/constants/healthColors";

export function QuickActions() {
  return (
    <View
      style={{
        flexDirection: "row",
        gap: 10,
        marginBottom: 24,
      }}
    >
      <TouchableOpacity
        style={{
          flex: 1,
          backgroundColor: healthColors.coral,
          borderRadius: 16,
          paddingVertical: 14,
          paddingHorizontal: 16,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          shadowColor: healthColors.coral,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.25,
          shadowRadius: 8,
          elevation: 4,
        }}
      >
        <Plus size={18} color="#FFF" />
        <Text
          style={{
            fontSize: 14,
            fontWeight: "800",
            color: "#FFF",
          }}
        >
          Add Record
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={{
          flex: 1,
          backgroundColor: healthColors.card,
          borderRadius: 16,
          paddingVertical: 14,
          paddingHorizontal: 16,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          borderWidth: 1.5,
          borderColor: healthColors.peach,
        }}
      >
        <Share2 size={18} color={healthColors.terracotta} />
        <Text
          style={{
            fontSize: 14,
            fontWeight: "700",
            color: healthColors.warmBrown,
          }}
        >
          Share Records
        </Text>
      </TouchableOpacity>
    </View>
  );
}
