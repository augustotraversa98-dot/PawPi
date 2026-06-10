import React, { useState } from "react";
import { View, Text, Pressable, Platform } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Calendar } from "lucide-react-native";
import {
  formatDisplayDate,
  initialPickerDate,
  toCanonicalDate,
} from "../utils/canonicalDateTime";

const C = {
  card: "#FFFBF7",
  warmBrown: "#3B241B",
  mutedBrown: "#8B7355",
  peach: "#FFE5D9",
  coral: "#FF6F61",
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
}) {
  const [open, setOpen] = useState(false);
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
        onPress={() => setOpen((o) => !o)}
        style={[
          {
            backgroundColor: C.card,
            borderRadius: 12,
            padding: 12,
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
            {
              fontSize: 15,
              color: display ? C.warmBrown : C.mutedBrown,
            },
            textStyle,
          ]}
        >
          {display || placeholder}
        </Text>
        <Calendar size={16} color={C.mutedBrown} />
      </Pressable>
      {open && (
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
