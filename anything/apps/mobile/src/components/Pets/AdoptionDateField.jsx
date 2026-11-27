import React, { useState } from "react";
import { View, Text, Keyboard } from "react-native";
import { useTranslation } from "react-i18next";
import DateField from "@/components/DateField";
import { PressableScale } from "@/components/ui";
import { COLORS, TYPE, SPACING } from "@/constants/theme";

/**
 * The optional adoption date: a past or present date that can be removed again. It never replaces the birth date.
 * Shared by onboarding, Edit Pet Profile and the medical profile.
 */
export default function AdoptionDateField({ value, onChange, fieldStyle, textStyle }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <View>
      <DateField
        testID="adoption-date-field"
        value={value}
        onChange={onChange}
        placeholder={t("feedUi.adoptionDateField.placeholder")}
        maximumDate={new Date()}
        fieldStyle={fieldStyle}
        textStyle={textStyle}
        open={open}
        onToggle={(next) => {
          // The inline calendar must not open behind the keyboard.
          if (next) Keyboard.dismiss();
          setOpen(next);
        }}
      />
      {value ? (
        <PressableScale
          testID="adoption-date-remove"
          accessibilityRole="button"
          onPress={() => {
            setOpen(false);
            onChange("");
          }}
          style={{ alignSelf: "flex-start", paddingVertical: SPACING.sm }}
        >
          <Text style={[TYPE.footnote, { color: COLORS.coral, fontWeight: "700" }]}>
            {t("feedUi.adoptionDateField.remove")}
          </Text>
        </PressableScale>
      ) : null}
    </View>
  );
}
