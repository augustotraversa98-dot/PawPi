import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { ROUTINE_FREQUENCY } from "@/data/routinesData";

const C = {
  card: "#FFFBF7",
  peach: "#FFE5D9",
  warmBrown: "#3B241B",
};

export const CADENCE_LABELS = {
  [ROUTINE_FREQUENCY.DAILY]: "Daily",
  [ROUTINE_FREQUENCY.WEEKLY]: "Weekly",
  [ROUTINE_FREQUENCY.BIWEEKLY]: "Every 2 weeks",
  [ROUTINE_FREQUENCY.MONTHLY]: "Monthly",
};

export const CADENCE_OPTIONS = [
  ROUTINE_FREQUENCY.DAILY,
  ROUTINE_FREQUENCY.WEEKLY,
  ROUTINE_FREQUENCY.BIWEEKLY,
  ROUTINE_FREQUENCY.MONTHLY,
];

/**
 * Shared calendar-cadence frequency radio list (Daily / Weekly / Every 2
 * weeks / Monthly) for the routine-creation modals. Day-pattern routines
 * (Feeding/Walk) use FrequencySelector instead — keep the two separate.
 *
 * `recommended` marks an option with a hint but never restricts the set.
 */
export default function CadenceFrequencySelector({
  value,
  onChange,
  options = CADENCE_OPTIONS,
  recommended,
  color = "#4DB8E8",
  style,
  testID = "cadence-frequency",
}) {
  return (
    <View style={[{ gap: 8 }, style]}>
      {options.map((freq) => {
        const selected = value === freq;
        return (
          <TouchableOpacity
            key={freq}
            testID={`${testID}-${freq}`}
            onPress={() => onChange(freq)}
            style={{
              backgroundColor: selected ? color + "20" : C.card,
              borderRadius: 12,
              padding: 14,
              borderWidth: 1.5,
              borderColor: selected ? color : C.peach,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Text
              style={{
                fontSize: 15,
                fontWeight: selected ? "700" : "600",
                color: selected ? color : C.warmBrown,
              }}
            >
              {CADENCE_LABELS[freq]}
            </Text>
            {recommended === freq && (
              <Text
                testID={`${testID}-recommended-${freq}`}
                style={{ fontSize: 12, fontWeight: "700", color }}
              >
                Recommended
              </Text>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
