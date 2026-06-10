import React from "react";
import { View, Text, TouchableOpacity } from "react-native";

const C = {
  peach: "#FFE5D9",
  mutedBrown: "#8B7355",
  sand: "#F5EDE4",
};

// Index matches DAYS_OF_WEEK in routinesData (Monday = 0), the same
// convention the reminder generator uses ((getDay() + 6) % 7).
export const DAY_CHIP_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Shared day-of-week chips for weekly/biweekly calendar-cadence routines.
 * Controlled: `value` is an integer[] (Monday = 0), `onChange` receives the
 * next integer[]. With `multiSelect={false}` a tap replaces the selection.
 */
export default function DayChips({
  value = [],
  onChange,
  multiSelect = true,
  color = "#4DB8E8",
  style,
  testID = "day-chips",
}) {
  const toggle = (day) => {
    if (!multiSelect) {
      onChange([day]);
      return;
    }
    onChange(
      value.includes(day)
        ? value.filter((d) => d !== day)
        : [...value, day].sort((a, b) => a - b),
    );
  };

  return (
    <View style={[{ flexDirection: "row", flexWrap: "wrap", gap: 8 }, style]}>
      {DAY_CHIP_LABELS.map((label, day) => {
        const selected = value.includes(day);
        return (
          <TouchableOpacity
            key={day}
            testID={`${testID}-${day}`}
            onPress={() => toggle(day)}
            style={{
              width: 45,
              height: 45,
              borderRadius: 23,
              backgroundColor: selected ? color : C.sand,
              justifyContent: "center",
              alignItems: "center",
              borderWidth: 1,
              borderColor: selected ? color : C.peach,
            }}
          >
            <Text
              style={{
                fontSize: 12,
                fontWeight: "700",
                color: selected ? "#FFF" : C.mutedBrown,
              }}
            >
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
