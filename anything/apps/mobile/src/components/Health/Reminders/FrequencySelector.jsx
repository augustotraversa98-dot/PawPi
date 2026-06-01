import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { WALK_ROUTINE_COLORS as C } from "@/constants/walkRoutineColors";
import { ROUTINE_FREQUENCY } from "@/data/routinesData";

const FREQUENCY_OPTIONS = [
  { value: ROUTINE_FREQUENCY.DAILY, label: "Every day" },
  { value: ROUTINE_FREQUENCY.WEEKDAYS, label: "Weekdays" },
  { value: ROUTINE_FREQUENCY.WEEKENDS, label: "Weekends" },
  { value: ROUTINE_FREQUENCY.CUSTOM, label: "Custom days" },
];

export default function FrequencySelector({ frequency, onFrequencyChange }) {
  return (
    <>
      <Text
        style={{
          fontSize: 13,
          fontWeight: "700",
          color: C.warmBrown,
          marginBottom: 8,
        }}
      >
        Repeat
      </Text>
      <View style={{ gap: 8, marginBottom: 16 }}>
        {FREQUENCY_OPTIONS.map((option) => (
          <TouchableOpacity
            key={option.value}
            onPress={() => onFrequencyChange(option.value)}
            style={{
              backgroundColor:
                frequency === option.value ? C.sage + "20" : C.sand,
              borderRadius: 10,
              padding: 12,
              borderWidth: 1,
              borderColor: frequency === option.value ? C.sage : C.peach,
            }}
          >
            <Text
              style={{
                fontSize: 14,
                fontWeight: frequency === option.value ? "700" : "600",
                color: frequency === option.value ? C.sage : C.warmBrown,
              }}
            >
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </>
  );
}
