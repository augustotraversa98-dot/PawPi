import React from "react";
import { View, TouchableOpacity, Text } from "react-native";
import { Download } from "lucide-react-native";
import { healthColors } from "@/constants/healthColors";

export function RecordCard({ record }) {
  const Icon = record.icon;

  return (
    <TouchableOpacity
      style={{
        backgroundColor: healthColors.card,
        borderRadius: 18,
        padding: 16,
        borderWidth: 1.5,
        borderColor: healthColors.peach,
        shadowColor: healthColors.terracotta,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
      }}
    >
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: 24,
          backgroundColor: record.color + "20",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Icon size={22} color={record.color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: 15,
            fontWeight: "700",
            color: healthColors.warmBrown,
            marginBottom: 3,
          }}
        >
          {record.title}
        </Text>
        <Text
          style={{
            fontSize: 12,
            color: healthColors.mutedBrown,
            marginBottom: 2,
          }}
        >
          {record.date}
        </Text>
        <Text
          style={{
            fontSize: 11,
            color: healthColors.mutedBrown,
          }}
        >
          {record.clinic}
        </Text>
      </View>
      <Download size={18} color={healthColors.mutedBrown} />
    </TouchableOpacity>
  );
}
