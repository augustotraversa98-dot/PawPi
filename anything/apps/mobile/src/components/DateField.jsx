import React, { useMemo, useState } from "react";
import { View, Text, Pressable, Platform } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Calendar } from "lucide-react-native";
import {
  formatDisplayDate,
  initialPickerDate,
  normalizePickerBound,
  pickedDateToCanonical,
} from "../utils/canonicalDateTime";
import { currentDateLocale } from "../utils/localeDateTime";
import { COLORS, MATERIALS, RADIUS, SPACING, TYPE } from "@/constants/theme";
import { useTranslation } from "react-i18next";

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
 * ("MM/DD/YYYY", ISO datetimes). Displays localized ("21 April 2025" / "21 de
 * abril de 2025"). `onChange` ALWAYS receives canonical "YYYY-MM-DD".
 *
 * Hardened (night run 2026-11-23): null / undefined / "" / 0 / Invalid Date / an
 * epoch (1969-1970) value all read as EMPTY (placeholder, picker opens on today);
 * the picker is only ever handed a valid Date; a dismissed, empty, invalid or
 * epoch-timestamp pick is ignored and keeps the previous value; min/max are
 * normalised (valid + stable per day) before they reach the native picker.
 */
export default function DateField({
  value,
  onChange,
  placeholder,
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
  const { t } = useTranslation();
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : internalOpen;
  const setOpen = (next) => {
    if (isControlled) onToggle?.(next);
    else setInternalOpen(next);
  };
  const display = formatDisplayDate(value);

  // Stable, valid bounds (a bare `new Date()` prop would change every render).
  const minMs = normalizePickerBound(minimumDate, "start")?.getTime();
  const maxMs = normalizePickerBound(maximumDate, "end")?.getTime();
  const minDate = useMemo(
    () => (minMs === undefined ? undefined : new Date(minMs)),
    [minMs],
  );
  const maxDate = useMemo(
    () => (maxMs === undefined ? undefined : new Date(maxMs)),
    [maxMs],
  );
  const pickerValue = useMemo(
    () =>
      initialPickerDate(value, new Date(), {
        minimumDate: minDate,
        maximumDate: maxDate,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [value, minMs, maxMs, isOpen],
  );

  const handleChange = (event, selected) => {
    // Android's calendar is a dialog: it closes itself, and "dismissed"
    // means the user cancelled. iOS inline commits on day tap; close then.
    setOpen(false);
    // null → dismissed / no date / Invalid Date / epoch timestamp: keep the old value.
    const canonical = pickedDateToCanonical(event, selected);
    if (canonical) onChange(canonical);
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
          {display || placeholder || t("leftoverUi.selectDate")}
        </Text>
        <Calendar size={16} color={C.mutedBrown} />
      </Pressable>
      {isOpen && (
        <DateTimePicker
          testID={testID ? `${testID}-picker` : undefined}
          value={pickerValue}
          mode="date"
          // Month and day names in the app's language, not the phone's (iOS).
          locale={currentDateLocale()}
          display={Platform.OS === "ios" ? "inline" : "calendar"}
          onChange={handleChange}
          minimumDate={minDate}
          maximumDate={maxDate}
          accentColor={accentColor}
          themeVariant="light"
        />
      )}
    </View>
  );
}
