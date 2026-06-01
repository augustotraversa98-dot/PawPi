import React from "react";
import { View, Text, TextInput, TouchableOpacity } from "react-native";
import { WALK_ROUTINE_COLORS as C } from "@/constants/walkRoutineColors";

const PACE_OPTIONS = ["relaxed", "normal", "active"];

export default function DurationPaceSelector({
  durationMinutes,
  pace,
  onDurationChange,
  onPaceChange,
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        gap: 10,
        marginBottom: 16,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: 13,
            fontWeight: "700",
            color: C.warmBrown,
            marginBottom: 8,
          }}
        >
          Duration (min)
        </Text>
        <TextInput
          value={durationMinutes?.toString() || "30"}
          onChangeText={(text) => onDurationChange(parseInt(text) || 30)}
          placeholder="30"
          placeholderTextColor={C.mutedBrown}
          keyboardType="number-pad"
          style={{
            backgroundColor: C.sand,
            borderRadius: 12,
            padding: 12,
            fontSize: 14,
            color: C.warmBrown,
            borderWidth: 1,
            borderColor: C.peach,
          }}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: 13,
            fontWeight: "700",
            color: C.warmBrown,
            marginBottom: 8,
          }}
        >
          Pace
        </Text>
        <View style={{ gap: 4 }}>
          {PACE_OPTIONS.map((paceOption) => (
            <TouchableOpacity
              key={paceOption}
              onPress={() => onPaceChange(paceOption)}
              style={{
                backgroundColor: pace === paceOption ? C.sage + "20" : C.sand,
                borderRadius: 8,
                padding: 8,
                borderWidth: 1,
                borderColor: pace === paceOption ? C.sage : C.peach,
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: pace === paceOption ? "700" : "600",
                  color: pace === paceOption ? C.sage : C.warmBrown,
                  textAlign: "center",
                  textTransform: "capitalize",
                }}
              >
                {paceOption}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );
}
