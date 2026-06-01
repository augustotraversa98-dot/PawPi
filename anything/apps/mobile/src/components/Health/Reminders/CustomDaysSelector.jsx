import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { WALK_ROUTINE_COLORS as C } from "@/constants/walkRoutineColors";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function CustomDaysSelector({ selectedDays, onToggleDay }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text
        style={{
          fontSize: 12,
          fontWeight: "600",
          color: C.mutedBrown,
          marginBottom: 8,
        }}
      >
        Select Days
      </Text>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 6,
        }}
      >
        {DAYS.map((day, dayIndex) => {
          const selected = (selectedDays || []).includes(dayIndex);
          return (
            <TouchableOpacity
              key={dayIndex}
              onPress={() => onToggleDay(dayIndex)}
              style={{
                width: 42,
                height: 42,
                borderRadius: 21,
                backgroundColor: selected ? C.sage : C.sand,
                justifyContent: "center",
                alignItems: "center",
                borderWidth: 1,
                borderColor: selected ? C.sage : C.peach,
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "700",
                  color: selected ? "#FFF" : C.mutedBrown,
                }}
              >
                {day}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
