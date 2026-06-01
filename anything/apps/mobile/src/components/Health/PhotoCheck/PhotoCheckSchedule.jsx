import React, { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { Camera, Check, Info } from "lucide-react-native";
import {
  PHOTO_CHECK_SCHEDULES,
  FREQUENCY_OPTIONS,
  BODY_AREA_LABELS,
} from "@/data/photoCheckData";

const C = {
  cream: "#FFF7EF",
  card: "#FFFBF7",
  coral: "#FF6F61",
  peach: "#FFE5D9",
  terracotta: "#B75D32",
  warmBrown: "#3B241B",
  mutedBrown: "#8B7355",
  sage: "#A7BFA3",
  sand: "#F5EDE4",
};

const BODY_AREA_COLORS = {
  paws: "#FFB74D",
  ears: "#9575CD",
  eyes: "#64B5F6",
  teeth: "#4DB6AC",
  skin_fur: "#FF8A65",
  face: "#FF6F61",
  full_body: "#A7BFA3",
  other: "#B75D32",
};

const DEFAULT_FREQUENCIES = {
  paws: "weekly",
  eyes: "weekly",
  ears: "every_2_weeks",
  teeth: "monthly",
  skin_fur: "monthly",
  face: "monthly",
  full_body: "monthly",
  other: "off",
};

export default function PhotoCheckSchedule() {
  const [schedules, setSchedules] = useState(PHOTO_CHECK_SCHEDULES);

  const handleFrequencyChange = (area, frequency) => {
    setSchedules((prev) => ({
      ...prev,
      [area]: {
        ...prev[area],
        frequency,
      },
    }));
  };

  const bodyAreas = Object.keys(BODY_AREA_LABELS);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.cream }}>
      <View style={{ padding: 16 }}>
        {/* Section Title */}
        <View style={{ marginBottom: 20 }}>
          <Text
            style={{
              fontSize: 20,
              fontWeight: "800",
              color: C.warmBrown,
              marginBottom: 4,
            }}
          >
            Photo Check Schedule
          </Text>
          <Text style={{ fontSize: 14, color: C.mutedBrown, lineHeight: 20 }}>
            Set how often you want to photograph each body area
          </Text>
        </View>

        {/* Body Area Schedule Settings */}
        <View style={{ gap: 16, marginBottom: 24 }}>
          {bodyAreas.map((area) => {
            const schedule = schedules[area];
            const currentFrequency = schedule?.frequency || "off";
            const color = BODY_AREA_COLORS[area] || C.terracotta;
            const defaultFrequency = DEFAULT_FREQUENCIES[area];

            return (
              <View
                key={area}
                style={{
                  backgroundColor: C.card,
                  borderRadius: 18,
                  padding: 16,
                  borderWidth: 1.5,
                  borderColor: C.peach,
                }}
              >
                {/* Area Header */}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    marginBottom: 14,
                  }}
                >
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 22,
                      backgroundColor: color + "20",
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    <Camera size={20} color={color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: 15,
                        fontWeight: "700",
                        color: C.warmBrown,
                        marginBottom: 2,
                      }}
                    >
                      {BODY_AREA_LABELS[area]}
                    </Text>
                    <Text
                      style={{
                        fontSize: 11,
                        color: C.mutedBrown,
                      }}
                    >
                      Suggested:{" "}
                      {
                        FREQUENCY_OPTIONS.find(
                          (opt) => opt.value === defaultFrequency,
                        )?.label
                      }
                    </Text>
                  </View>
                </View>

                {/* Frequency Options */}
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: 8,
                  }}
                >
                  {FREQUENCY_OPTIONS.map((option) => {
                    const isSelected = currentFrequency === option.value;
                    return (
                      <TouchableOpacity
                        key={option.value}
                        onPress={() =>
                          handleFrequencyChange(area, option.value)
                        }
                        style={{
                          backgroundColor: isSelected ? color : C.sand,
                          borderRadius: 12,
                          paddingVertical: 8,
                          paddingHorizontal: 14,
                          borderWidth: 1.5,
                          borderColor: isSelected ? color : C.peach,
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        {isSelected && <Check size={14} color="#FFF" />}
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: isSelected ? "800" : "600",
                            color: isSelected ? "#FFF" : C.warmBrown,
                          }}
                        >
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            );
          })}
        </View>

        {/* Info Box */}
        <View
          style={{
            backgroundColor: C.sand,
            borderRadius: 16,
            padding: 16,
            borderWidth: 1,
            borderColor: C.peach,
            flexDirection: "row",
            gap: 10,
          }}
        >
          <Info size={16} color={C.mutedBrown} style={{ marginTop: 2 }} />
          <Text
            style={{
              fontSize: 12,
              color: C.mutedBrown,
              lineHeight: 18,
              flex: 1,
            }}
          >
            Regular photo checks help you track visible changes over time.
            You'll receive reminders when it's time to photograph each area.
          </Text>
        </View>

        {/* Safety Info */}
        <View
          style={{
            marginTop: 16,
            backgroundColor: C.sand,
            borderRadius: 16,
            padding: 16,
            borderWidth: 1,
            borderColor: C.peach,
          }}
        >
          <Text
            style={{
              fontSize: 13,
              color: C.mutedBrown,
              lineHeight: 19,
              textAlign: "center",
            }}
          >
            Photo Check helps you track visible changes over time. It does not
            diagnose or replace veterinary care.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}
