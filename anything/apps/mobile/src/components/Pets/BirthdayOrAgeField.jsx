import React, { useState } from "react";
import { View, Text, TextInput, Keyboard } from "react-native";
import { Check } from "lucide-react-native";
import DateField from "@/components/DateField";
import { COLORS, TYPE, RADIUS, SPACING, MATERIALS } from "@/constants/theme";
import { PressableScale } from "@/components/ui";
import { useTranslation } from "react-i18next";

const inputStyle = {
  backgroundColor: MATERIALS.surfaceSunken,
  borderRadius: RADIUS.control,
  padding: SPACING.md + 2,
  ...TYPE.body,
  color: COLORS.warmBrown,
  borderWidth: 1,
  borderColor: MATERIALS.hairline,
};

const captionStyle = [TYPE.footnote, { color: COLORS.mutedBrown }];

function EstimateInput({ testID, label, value, onChange }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={[...captionStyle, { marginBottom: SPACING.xs + 2 }]}>{label}</Text>
      <TextInput
        testID={testID}
        accessibilityLabel={label}
        style={inputStyle}
        placeholder="0"
        placeholderTextColor={COLORS.mutedBrown}
        value={value}
        onChangeText={(text) => onChange(text.replace(/[^0-9]/g, ""))}
        keyboardType="number-pad"
        maxLength={2}
      />
    </View>
  );
}

/**
 * Birth date, or an estimated age when the owner doesn't know it. Shared by onboarding, Edit Pet Profile and the
 * medical profile. The birth date comes first; "I don't know the exact date" (`birthdayUnknown`, an explicit
 * choice, not just a blank date) swaps it for the estimate. Only one of the two is saved.
 * `estimateGrows`: the server keeps the date an estimate is given, so the age counts up from it.
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
  estimateGrows = false,
}) {
  const { t } = useTranslation();
  const [calendarOpen, setCalendarOpen] = useState(false);

  return (
    <View>
      {birthdayUnknown ? null : (
        <DateField
          testID="birthday-field"
          value={birthday}
          onChange={onBirthdayChange}
          placeholder={t("feedUi.birthdayOrAgeField.pickBirthDate")}
          maximumDate={new Date()}
          fieldStyle={{
            backgroundColor: MATERIALS.surfaceSunken,
            padding: SPACING.md + 2,
            borderColor: MATERIALS.hairline,
          }}
          textStyle={{ ...TYPE.body }}
          open={calendarOpen}
          onToggle={(next) => {
            // The inline calendar must not open behind the keyboard.
            if (next) Keyboard.dismiss();
            setCalendarOpen(next);
          }}
        />
      )}

      <PressableScale
        testID="birthday-unsure"
        accessibilityRole="checkbox"
        accessibilityState={{ checked: !!birthdayUnknown }}
        onPress={() => {
          Keyboard.dismiss();
          setCalendarOpen(false);
          onToggleUnknown(!birthdayUnknown);
        }}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: SPACING.sm,
          paddingVertical: SPACING.md,
        }}
      >
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            borderWidth: 2,
            borderColor: COLORS.coral,
            backgroundColor: birthdayUnknown ? COLORS.coral : "transparent",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {birthdayUnknown ? <Check size={14} color="#FFF" /> : null}
        </View>
        <Text style={[TYPE.callout, { flex: 1, fontWeight: "700", color: COLORS.warmBrown }]}>
          {t("feedUi.birthdayOrAgeField.unknownDate")}
        </Text>
      </PressableScale>

      {birthdayUnknown ? (
        <View>
          <View style={{ flexDirection: "row", gap: SPACING.md }}>
            <EstimateInput
              testID="estimated-age-years"
              label={t("feedUi.birthdayOrAgeField.estimatedYears")}
              value={ageYears}
              onChange={onAgeYearsChange}
            />
            <EstimateInput
              testID="estimated-age-months"
              label={t("feedUi.birthdayOrAgeField.estimatedMonths")}
              value={ageMonths}
              onChange={onAgeMonthsChange}
            />
          </View>
          <Text style={[...captionStyle, { marginTop: SPACING.sm }]}>
            {estimateGrows
              ? t("feedUi.birthdayOrAgeField.estimateGrows")
              : t("feedUi.birthdayOrAgeField.estimateHint")}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
