import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useTranslation } from "react-i18next";
import { WALK_ROUTINE_COLORS as C } from "@/constants/walkRoutineColors";
import { ROUTINE_FREQUENCY } from "@/data/routinesData";

const FREQUENCY_OPTIONS = [
  { value: ROUTINE_FREQUENCY.DAILY, i18nKey: "frequencySelector.everyDay" },
  { value: ROUTINE_FREQUENCY.WEEKDAYS, i18nKey: "frequencySelector.weekdays" },
  { value: ROUTINE_FREQUENCY.WEEKENDS, i18nKey: "frequencySelector.weekends" },
  { value: ROUTINE_FREQUENCY.CUSTOM, i18nKey: "frequencySelector.customDays" },
];

export default function FrequencySelector({ frequency, onFrequencyChange }) {
  const { t } = useTranslation();
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
        {t("frequencySelector.repeat")}
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
              {t(option.i18nKey)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </>
  );
}
