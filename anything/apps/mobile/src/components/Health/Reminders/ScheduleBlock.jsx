import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import DateField from "@/components/DateField";
import TimeField from "@/components/TimeField";
import { ROUTINE_FREQUENCY } from "@/data/routinesData";
import { canonicalizeDateValue } from "@/utils/canonicalDateTime";
import CadenceFrequencySelector, {
  CADENCE_OPTIONS_FULL,
} from "./CadenceFrequencySelector";
import DayChips from "./DayChips";

const C = {
  card: "#FFFBF7",
  peach: "#FFE5D9",
  warmBrown: "#3B241B",
  mutedBrown: "#8B7355",
  sand: "#F5EDE4",
};

// =========================================================================
// ScheduleBlock — the shared iOS-Reminders-style scheduling UI. Emits ONE
// canonical schedule object whose fields map 1:1 onto exactly what
// reminderGenerator.js reads per cadence (see REMINDER_CADENCE_SUPPORT_MATRIX.md):
//   frequency      → item.frequency        (selects the cadence path)
//   preferredTime  → item.preferredTime    (time-of-day, "HH:MM")
//   startDate      → getScheduleAnchor      (anchor for month-multiple/once/hourly)
//   preferredDay   → item.preferredDay      (weekly/biweekly single-day fallback)
//   days           → item.days              (custom + multi-day weekly/biweekly)
//   intervalHours  → resolveIntervalHours    (hourly)
//   reminderTiming → lead-time              (P1: stored only; P2 honors it)
// =========================================================================

// Hourly interval presets (hours between occurrences).
export const INTERVAL_PRESETS = [2, 4, 6, 8, 12];

// Early-reminder lead-time options. P1 stores the chosen value verbatim into the
// schedule object; generalizing the notification layer to honor it is P2.
export const EARLY_REMINDER_OPTIONS = [
  { value: "on_time", label: "At time" },
  { value: "5m", label: "5 min before" },
  { value: "15m", label: "15 min before" },
  { value: "30m", label: "30 min before" },
  { value: "1h", label: "1 hour before" },
  { value: "1d", label: "1 day before" },
  { value: "1w", label: "1 week before" },
];

const DEFAULT_INTERVAL_HOURS = 4;

// Cadences whose sub-control is the multi-select weekday chips.
export function usesDayChips(frequency) {
  return (
    frequency === ROUTINE_FREQUENCY.WEEKLY ||
    frequency === ROUTINE_FREQUENCY.BIWEEKLY ||
    frequency === ROUTINE_FREQUENCY.CUSTOM
  );
}

// Cadences anchored on the picked Date's day-of-month (no weekday sub-control).
export function isDateAnchored(frequency) {
  return (
    frequency === ROUTINE_FREQUENCY.MONTHLY ||
    frequency === ROUTINE_FREQUENCY.EVERY_3_MONTHS ||
    frequency === ROUTINE_FREQUENCY.EVERY_6_MONTHS ||
    frequency === ROUTINE_FREQUENCY.YEARLY ||
    frequency === ROUTINE_FREQUENCY.ONCE
  );
}

// Pure: build the canonical schedule object from a stored schedule item (or {}).
// Unknown/missing fields fall back to safe defaults; startDate stays "" when
// absent so the generator's anchor falls back to the routine's createdAt
// (preserving existing behavior for routines created before ScheduleBlock).
export function scheduleFromItem(item = {}) {
  return {
    frequency: item.frequency || ROUTINE_FREQUENCY.WEEKLY,
    preferredTime: item.preferredTime || "09:00",
    startDate: canonicalizeDateValue(item.startDate) || "",
    preferredDay: item.preferredDay ?? 6,
    days: Array.isArray(item.days) ? item.days : [],
    intervalHours: Number.isInteger(item.intervalHours)
      ? item.intervalHours
      : DEFAULT_INTERVAL_HOURS,
    reminderTiming: item.reminderTiming || "on_time",
  };
}

// Pure: a fresh schedule object for a NEW item. Defaults to a weekly check today
// at 09:00 on a single weekday, so weekly/biweekly day chips start non-empty.
export function defaultSchedule(today, overrides = {}) {
  const preferredDay = 6;
  return {
    frequency: ROUTINE_FREQUENCY.WEEKLY,
    preferredTime: "09:00",
    startDate: today ? canonicalizeDateValue(today) : "",
    preferredDay,
    days: [preferredDay],
    intervalHours: DEFAULT_INTERVAL_HOURS,
    reminderTiming: "on_time",
    ...overrides,
  };
}

// Pure: apply a frequency change, keeping the object coherent. Switching INTO a
// day-chip cadence with no days selected seeds the chips with the current
// preferredDay so the selection is never empty (an empty weekly days[] would
// silently fall back to the single preferredDay path).
export function applyFrequencyChange(schedule, frequency) {
  const next = { ...schedule, frequency };
  if (usesDayChips(frequency) && (!next.days || next.days.length === 0)) {
    next.days = [next.preferredDay ?? 6];
  }
  return next;
}

// Pure: apply a day-chip change. preferredDay tracks days[0] so the legacy
// single-day fallback and the schedule summary stay coherent.
export function applyDaysChange(schedule, days) {
  return {
    ...schedule,
    days,
    preferredDay: days.length ? days[0] : (schedule.preferredDay ?? 6),
  };
}

function SectionLabel({ children }) {
  return (
    <Text
      style={{
        fontSize: 13,
        fontWeight: "700",
        color: C.warmBrown,
        marginBottom: 8,
      }}
    >
      {children}
    </Text>
  );
}

function Hint({ children }) {
  return (
    <Text
      style={{
        fontSize: 12,
        color: C.mutedBrown,
        marginBottom: 12,
        lineHeight: 16,
      }}
    >
      {children}
    </Text>
  );
}

function Pill({ label, selected, onPress, color, testID }) {
  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      style={{
        backgroundColor: selected ? color + "20" : C.sand,
        borderRadius: 12,
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderWidth: 1.5,
        borderColor: selected ? color : C.peach,
      }}
    >
      <Text
        style={{
          fontSize: 13,
          fontWeight: selected ? "700" : "600",
          color: selected ? color : C.warmBrown,
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

/**
 * ScheduleBlock — controlled. `value` is the canonical schedule object (use
 * scheduleFromItem / defaultSchedule to build it); `onChange` receives the next
 * object. Compose inside any routine modal's scroll content.
 */
export default function ScheduleBlock({
  value,
  onChange,
  color = "#F4A460",
  style,
  testID = "schedule-block",
}) {
  const schedule = value || defaultSchedule();
  const { frequency } = schedule;

  const set = (patch) => onChange({ ...schedule, ...patch });

  return (
    <View style={style}>
      {/* Date */}
      <SectionLabel>Date</SectionLabel>
      <View style={{ marginBottom: 16 }}>
        <DateField
          value={schedule.startDate}
          onChange={(startDate) => set({ startDate })}
          accentColor={color}
          testID={`${testID}-date`}
        />
      </View>

      {/* Time */}
      <SectionLabel>Time</SectionLabel>
      <View style={{ marginBottom: 16 }}>
        <TimeField
          value={schedule.preferredTime}
          onChange={(preferredTime) => set({ preferredTime })}
          testID={`${testID}-time`}
        />
      </View>

      {/* Frequency */}
      <SectionLabel>Frequency</SectionLabel>
      <CadenceFrequencySelector
        value={frequency}
        onChange={(freq) => onChange(applyFrequencyChange(schedule, freq))}
        options={CADENCE_OPTIONS_FULL}
        color={color}
        style={{ marginBottom: 16 }}
        testID={`${testID}-frequency`}
      />

      {/* Hourly → interval presets */}
      {frequency === ROUTINE_FREQUENCY.HOURLY && (
        <>
          <SectionLabel>Every</SectionLabel>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 8,
              marginBottom: 16,
            }}
          >
            {INTERVAL_PRESETS.map((h) => (
              <Pill
                key={h}
                testID={`${testID}-interval-${h}`}
                label={`${h} hours`}
                selected={schedule.intervalHours === h}
                onPress={() => set({ intervalHours: h })}
                color={color}
              />
            ))}
          </View>
        </>
      )}

      {/* Weekly / Biweekly / Custom → multi-select weekday chips */}
      {usesDayChips(frequency) && (
        <>
          <SectionLabel>
            {frequency === ROUTINE_FREQUENCY.CUSTOM ? "Days" : "On these days"}
          </SectionLabel>
          <DayChips
            value={schedule.days}
            onChange={(days) => onChange(applyDaysChange(schedule, days))}
            multiSelect
            color={color}
            style={{ marginBottom: 8 }}
            testID={`${testID}-days`}
          />
          {frequency === ROUTINE_FREQUENCY.BIWEEKLY && (
            <Hint>Repeats every other week, starting the week of the date above.</Hint>
          )}
          {frequency !== ROUTINE_FREQUENCY.BIWEEKLY && <View style={{ marginBottom: 8 }} />}
        </>
      )}

      {/* Month-multiple / Once → anchored on the picked date */}
      {isDateAnchored(frequency) && (
        <Hint>
          {frequency === ROUTINE_FREQUENCY.ONCE
            ? "Fires once on the date and time above."
            : "Repeats on that day of the month, starting from the date above."}
        </Hint>
      )}

      {/* Early reminder (lead-time) */}
      <SectionLabel>Early reminder</SectionLabel>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {EARLY_REMINDER_OPTIONS.map((opt) => (
          <Pill
            key={opt.value}
            testID={`${testID}-early-${opt.value}`}
            label={opt.label}
            selected={schedule.reminderTiming === opt.value}
            onPress={() => set({ reminderTiming: opt.value })}
            color={color}
          />
        ))}
      </View>
    </View>
  );
}
