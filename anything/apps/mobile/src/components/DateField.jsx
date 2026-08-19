import React, { useState } from "react";
import { View, Text, Pressable, Platform } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Calendar } from "lucide-react-native";
import {
  formatDisplayDate,
  initialPickerDate,
  toCanonicalDate,
} from "../utils/canonicalDateTime";
import { COLORS, MATERIALS, RADIUS, SPACING, TYPE } from "@/constants/theme";

// 2.77: sourced from the design tokens (was a local hex map) — same hues, softer
// radius + the shared input look.
const C = {
  card: MATERIALS.surface,
  warmBrown: COLORS.warmBrown,
  mutedBrown: COLORS.mutedBrown,
  peach: MATERIALS.hairline,
  coral: COLORS.coral,
};

/**
 * DateField — app-wide date input.
 *
 * Closed state looks like the existing form fields (pass `fieldStyle` to
 * match the host form). Tapping it opens an inline native CALENDAR
 * (iOS display="inline", Android display="calendar") — never typed text.
 * Opens on the current value if set, otherwise on today.
 *
 * `value` accepts canonical "YYYY-MM-DD" plus legacy stored values
 * ("MM/DD/YYYY", ISO datetimes). Displays as "21 April 2025".
 * `onChange` ALWAYS receives canonical "YYYY-MM-DD".
 */
export default function DateField({
  value,
  onChange,
  placeholder = "Select date",
  fieldStyle,
  textStyle,
  minimumDate,
  maximumDate,
  accentColor = C.coral,
  testID,
  // Optional controlled open state. When `open`/`onToggle` are provided the
  // host owns visibility (used to keep sibling pickers mutually exclusive);
  // otherwise the field manages its own inline calendar.
  open,
  onToggle,
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : internalOpen;
  const setOpen = (next) => {
    if (isControlled) onToggle?.(next);
    else setInternalOpen(next);
  };
  const display = formatDisplayDate(value);

  const handleChange = (event, selected) => {
    // Android's calendar is a dialog: it closes itself, and "dismissed"
    // means the user cancelled. iOS inline commits on day tap; close then.
    setOpen(false);
    if (event?.type === "dismissed" || !selected) return;
    onChange(toCanonicalDate(selected));
  };

  return (
    <View>
      <Pressable
        testID={testID}
        onPress={() => setOpen(!isOpen)}
        style={[
          {
            backgroundColor: C.card,
            borderRadius: RADIUS.control,
            padding: SPACING.md,
            borderWidth: 1,
            borderColor: C.peach,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          },
          fieldStyle,
        ]}
      >
        <Text
          style={[
            TYPE.body,
            {
              color: display ? C.warmBrown : C.mutedBrown,
            },
            textStyle,
          ]}
        >
          {display || placeholder}
        </Text>
        <Calendar size={16} color={C.mutedBrown} />
      </Pressable>
      {isOpen && (
        <DateTimePicker
          testID={testID ? `${testID}-picker` : undefined}
          value={initialPickerDate(value)}
          mode="date"
          display={Platform.OS === "ios" ? "inline" : "calendar"}
          onChange={handleChange}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          accentColor={accentColor}
          themeVariant="light"
        />
      )}
    </View>
  );
}
