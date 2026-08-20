import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useTranslation } from "react-i18next";
import { ROUTINE_FREQUENCY } from "@/data/routinesData";

const C = {
  card: "#FFFBF7",
  peach: "#FFE5D9",
  warmBrown: "#3B241B",
};

// English labels are used as a fallback when a caller renders outside a
// translation context; the component itself localizes via `t()` below.
export const CADENCE_LABELS = {
  [ROUTINE_FREQUENCY.HOURLY]: "Hourly",
  [ROUTINE_FREQUENCY.DAILY]: "Daily",
  [ROUTINE_FREQUENCY.WEEKLY]: "Weekly",
  [ROUTINE_FREQUENCY.BIWEEKLY]: "Every 2 weeks",
  [ROUTINE_FREQUENCY.MONTHLY]: "Monthly",
  [ROUTINE_FREQUENCY.EVERY_3_MONTHS]: "Every 3 months",
  [ROUTINE_FREQUENCY.EVERY_6_MONTHS]: "Every 6 months",
  [ROUTINE_FREQUENCY.YEARLY]: "Yearly",
  [ROUTINE_FREQUENCY.CUSTOM]: "Custom",
  [ROUTINE_FREQUENCY.ONCE]: "Once / Never",
};

const CADENCE_I18N_KEYS = {
  [ROUTINE_FREQUENCY.HOURLY]: "cadenceSelector.labels.hourly",
  [ROUTINE_FREQUENCY.DAILY]: "cadenceSelector.labels.daily",
  [ROUTINE_FREQUENCY.WEEKLY]: "cadenceSelector.labels.weekly",
  [ROUTINE_FREQUENCY.BIWEEKLY]: "cadenceSelector.labels.biweekly",
  [ROUTINE_FREQUENCY.MONTHLY]: "cadenceSelector.labels.monthly",
  [ROUTINE_FREQUENCY.EVERY_3_MONTHS]: "cadenceSelector.labels.every3Months",
  [ROUTINE_FREQUENCY.EVERY_6_MONTHS]: "cadenceSelector.labels.every6Months",
  [ROUTINE_FREQUENCY.YEARLY]: "cadenceSelector.labels.yearly",
  [ROUTINE_FREQUENCY.CUSTOM]: "cadenceSelector.labels.custom",
  [ROUTINE_FREQUENCY.ONCE]: "cadenceSelector.labels.once",
};

export const CADENCE_OPTIONS = [
  ROUTINE_FREQUENCY.DAILY,
  ROUTINE_FREQUENCY.WEEKLY,
  ROUTINE_FREQUENCY.BIWEEKLY,
  ROUTINE_FREQUENCY.MONTHLY,
];

// Full iOS-Reminders-style cadence list used by ScheduleBlock (top to bottom).
export const CADENCE_OPTIONS_FULL = [
  ROUTINE_FREQUENCY.HOURLY,
  ROUTINE_FREQUENCY.DAILY,
  ROUTINE_FREQUENCY.WEEKLY,
  ROUTINE_FREQUENCY.BIWEEKLY,
  ROUTINE_FREQUENCY.MONTHLY,
  ROUTINE_FREQUENCY.EVERY_3_MONTHS,
  ROUTINE_FREQUENCY.EVERY_6_MONTHS,
  ROUTINE_FREQUENCY.YEARLY,
  ROUTINE_FREQUENCY.CUSTOM,
  ROUTINE_FREQUENCY.ONCE,
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
  const { t } = useTranslation();
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
              {CADENCE_I18N_KEYS[freq] ? t(CADENCE_I18N_KEYS[freq]) : CADENCE_LABELS[freq]}
            </Text>
            {recommended === freq && (
              <Text
                testID={`${testID}-recommended-${freq}`}
                style={{ fontSize: 12, fontWeight: "700", color }}
              >
                {t("cadenceSelector.recommended")}
              </Text>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
