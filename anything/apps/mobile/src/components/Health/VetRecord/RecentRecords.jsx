import React from "react";
import { View, Text } from "react-native";
import { RecordCard } from "./RecordCard";
import { healthColors } from "@/constants/healthColors";

export function RecentRecords({ records }) {
  return (
    <View style={{ marginBottom: 24 }}>
      <Text
        style={{
          fontSize: 15,
          fontWeight: "700",
          color: healthColors.warmBrown,
          marginBottom: 12,
        }}
      >
        Recent Records
      </Text>
      <View style={{ gap: 12 }}>
        {records.map((record, idx) => (
          <RecordCard key={idx} record={record} />
        ))}
      </View>
    </View>
  );
}
