import React from "react";
import { View, Text, Switch } from "react-native";
import { WALK_ROUTINE_COLORS as C } from "@/constants/walkRoutineColors";

export default function ReminderSettings({
  reminderEnabled,
  timeSensitive,
  onReminderEnabledChange,
  onTimeSensitiveChange,
}) {
  return (
    <View
      style={{
        backgroundColor: C.sand,
        borderRadius: 12,
        padding: 12,
        marginBottom: 12,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <Text
          style={{
            fontSize: 14,
            fontWeight: "600",
            color: C.warmBrown,
          }}
        >
          Reminder enabled
        </Text>
        <Switch
          value={reminderEnabled}
          onValueChange={onReminderEnabledChange}
          trackColor={{ false: C.peach, true: C.sage + "60" }}
          thumbColor={reminderEnabled ? C.sage : "#fff"}
        />
      </View>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text
          style={{
            fontSize: 14,
            fontWeight: "600",
            color: C.warmBrown,
          }}
        >
          Time-sensitive
        </Text>
        <Switch
          value={timeSensitive}
          onValueChange={onTimeSensitiveChange}
          trackColor={{ false: C.peach, true: C.coral + "60" }}
          thumbColor={timeSensitive ? C.coral : "#fff"}
        />
      </View>
    </View>
  );
}
