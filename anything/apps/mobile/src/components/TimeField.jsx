import React, { useState } from "react";
import { View, Text, Pressable, Platform } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Clock } from "lucide-react-native";
import {
  formatDisplayTime,
  initialPickerTime,
  toCanonicalTime,
} from "../utils/canonicalDateTime";

const C = {
  card: "#FFFBF7",
  warmBrown: "#3B241B",
  mutedBrown: "#8B7355",
  peach: "#FFE5D9",
};

/**
 * TimeField — app-wide time input.
 *
 * Closed state looks like the existing form fields (pass `fieldStyle` to
 * match the host form). Tapping it opens the native WHEEL/SPINNER
 * (iOS display="spinner", Android spinner dialog) — never typed text.
 * Opens on the current value if set, otherwise on now.
 *
 * `value` accepts canonical "HH:MM" plus legacy "HH:MM:SS". Displays per
 * the device 12/24h preference, e.g. "8:00 PM".
 * `onChange` ALWAYS receives canonical "HH:MM" (24h).
 */
export default function TimeField({
  value,
  onChange,
  placeholder = "Select time",
  fieldStyle,
  textStyle,
  testID,
}) {
  const [open, setOpen] = useState(false);
  const display = formatDisplayTime(value);

  const handleOpenToggle = () => {
    const next = !open;
    setOpen(next);
    // iOS spinner has no confirm step — it only fires onChange when a wheel
    // moves. Commit the opening value for an empty field so what the wheels
    // show is what the field holds.
    if (next && Platform.OS === "ios" && !display) {
      onChange(toCanonicalTime(initialPickerTime(value)));
    }
  };

  const handleChange = (event, selected) => {
    if (Platform.OS === "android") {
      // Android spinner is a dialog with OK/Cancel; it closes itself.
      setOpen(false);
      if (event?.type === "dismissed" || !selected) return;
      onChange(toCanonicalTime(selected));
      return;
    }
    // iOS spinner stays open (tap the field again to collapse); every wheel
    // settle commits the canonical value.
    if (selected) onChange(toCanonicalTime(selected));
  };

  return (
    <View>
      <Pressable
        testID={testID}
        onPress={handleOpenToggle}
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
        <Clock size={16} color={C.mutedBrown} />
      </Pressable>
      {open && (
        <DateTimePicker
          testID={testID ? `${testID}-picker` : undefined}
          value={initialPickerTime(value)}
          mode="time"
          display="spinner"
          onChange={handleChange}
          themeVariant="light"
        />
      )}
    </View>
  );
}
