import React from "react";
import { View, Text, TextInput } from "react-native";
import DateField from "@/components/DateField";
import { COLORS, TYPE, RADIUS, SPACING, MATERIALS } from "@/constants/theme";
import { PressableScale } from "@/components/ui";

const inputStyle = {
  backgroundColor: MATERIALS.surfaceSunken,
  borderRadius: RADIUS.control,
  padding: SPACING.md + 2,
  ...TYPE.body,
  color: COLORS.warmBrown,
  borderWidth: 1,
  borderColor: MATERIALS.hairline,
};

/**
 * Birthday vs. estimated-age input, shared by profile-edit.jsx and
 * EditMedicalProfileModal.jsx (the onboarding version of this toggle is
 * StepBirthday, which additionally folds in adoption day). Model
 * (docs/roadmap.md): a known birthday always wins and the age shown
 * elsewhere is calculated live from it; an estimated age (years/months) is
 * only used when the owner has explicitly said the birthday isn't known —
 * `birthdayUnknown` is that explicit choice, not just "birthday is blank".
 */
export default function BirthdayOrAgeField({
  birthdayUnknown,
  onToggleUnknown,
  birthday,
  onBirthdayChange,
  ageYears,
  onAgeYearsChange,
  ageMonths,
  onAgeMonthsChange,
}) {
  const options = [
    { value: false, label: "I know the birthday" },
    { value: true, label: "I'm not sure" },
  ];

  return (
    <View>
      <View
        style={{
          flexDirection: "row",
          gap: SPACING.sm,
          marginBottom: SPACING.sm + 2,
        }}
      >
        {options.map((opt) => (
          <PressableScale
            key={String(opt.value)}
            testID={opt.value ? "birthday-unsure" : "birthday-known"}
            onPress={() => onToggleUnknown(opt.value)}
            accessibilityRole="button"
            style={{
              flex: 1,
              paddingVertical: SPACING.sm + 2,
              paddingHorizontal: SPACING.md,
              borderRadius: RADIUS.control,
              backgroundColor:
                birthdayUnknown === opt.value
                  ? COLORS.coral
                  : MATERIALS.surfaceSunken,
              borderWidth: 1,
              borderColor:
                birthdayUnknown === opt.value ? COLORS.coral : MATERIALS.hairline,
              alignItems: "center",
            }}
          >
            <Text
              style={[
                TYPE.footnote,
                {
                  fontWeight: "700",
                  color: birthdayUnknown === opt.value ? "#FFF" : COLORS.warmBrown,
                },
              ]}
            >
              {opt.label}
            </Text>
          </PressableScale>
        ))}
      </View>

      {birthdayUnknown ? (
        <View style={{ flexDirection: "row", gap: SPACING.md }}>
          <View style={{ flex: 1 }}>
            <Text
              style={[
                TYPE.footnote,
                { color: COLORS.mutedBrown, marginBottom: SPACING.xs + 2 },
              ]}
            >
              Estimated years
            </Text>
            <TextInput
              testID="estimated-age-years"
              style={inputStyle}
              placeholder="0"
              placeholderTextColor={COLORS.mutedBrown}
              value={ageYears}
              onChangeText={(text) =>
                onAgeYearsChange(text.replace(/[^0-9]/g, ""))
              }
              keyboardType="number-pad"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={[
                TYPE.footnote,
                { color: COLORS.mutedBrown, marginBottom: SPACING.xs + 2 },
              ]}
            >
              Estimated months
            </Text>
            <TextInput
              testID="estimated-age-months"
              style={inputStyle}
              placeholder="0"
              placeholderTextColor={COLORS.mutedBrown}
              value={ageMonths}
              onChangeText={(text) =>
                onAgeMonthsChange(text.replace(/[^0-9]/g, ""))
              }
              keyboardType="number-pad"
            />
          </View>
        </View>
      ) : (
        <DateField
          testID="birthday-field"
          value={birthday}
          onChange={onBirthdayChange}
          maximumDate={new Date()}
          fieldStyle={{
            backgroundColor: MATERIALS.surfaceSunken,
            padding: SPACING.md + 2,
            borderColor: MATERIALS.hairline,
          }}
          textStyle={{ ...TYPE.body }}
        />
      )}
    </View>
  );
}
