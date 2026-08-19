import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useTranslation } from "react-i18next";
import DateField from "@/components/DateField";
import TimeField from "@/components/TimeField";
import { ROUTINE_FREQUENCY } from "@/data/routinesData";
import { canonicalizeDateValue } from "@/utils/canonicalDateTime";
import CadenceFrequencySelector, {
  CADENCE_OPTIONS_FULL,
  CADENCE_LABELS,
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
  hideTime = false,
  cadenceOptions = CADENCE_OPTIONS_FULL,
  testID = "schedule-block",
}) {
  const { t } = useTranslation();
  const schedule = value || defaultSchedule();
  const { frequency } = schedule;

  const earlyReminderLabel = (v) => {
    switch (v) {
      case "on_time": return t("health.reminders.schedule.earlyAtTime");
      case "5m": return t("health.reminders.schedule.earlyMinBefore", { n: 5 });
      case "15m": return t("health.reminders.schedule.earlyMinBefore", { n: 15 });
      case "30m": return t("health.reminders.schedule.earlyMinBefore", { n: 30 });
      case "1h": return t("health.reminders.schedule.earlyHourBefore", { n: 1 });
      case "1d": return t("health.reminders.schedule.earlyDayBefore", { n: 1 });
      case "1w": return t("health.reminders.schedule.earlyWeekBefore", { n: 1 });
      default: return v;
    }
  };

  // Local UI-only state: the Frequency list starts collapsed (a value is always
  // set) and shows just the header + current label, iOS-Reminders style. This
  // never touches the emitted schedule object.
  const [freqExpanded, setFreqExpanded] = React.useState(false);

  const set = (patch) => onChange({ ...schedule, ...patch });

  const selectFrequency = (freq) => {
    onChange(applyFrequencyChange(schedule, freq));
    setFreqExpanded(false); // collapse back to the header after picking
  };

  return (
    <View style={style}>
      {/* Date */}
      <SectionLabel>{t("health.reminders.schedule.date")}</SectionLabel>
      <View style={{ marginBottom: 16 }}>
        <DateField
          value={schedule.startDate}
          onChange={(startDate) => set({ startDate })}
          accentColor={color}
          testID={`${testID}-date`}
        />
      </View>

      {/* Time — omitted when the host modal owns the time-of-day control
          (e.g. MedicalCare keeps dose times in its own multi-add Time(s) field). */}
      {!hideTime && (
        <>
          <SectionLabel>{t("health.reminders.schedule.time")}</SectionLabel>
          <View style={{ marginBottom: 16 }}>
            <TimeField
              value={schedule.preferredTime}
              onChange={(preferredTime) => set({ preferredTime })}
              testID={`${testID}-time`}
            />
          </View>
        </>
      )}

      {/* Frequency (collapsible, iOS-Reminders style) — a tappable header shows
          the current selection's label; tapping toggles the full list. */}
      <TouchableOpacity
        testID={`${testID}-frequency-toggle`}
        onPress={() => setFreqExpanded((e) => !e)}
        accessibilityRole="button"
        activeOpacity={0.7}
        style={{
          backgroundColor: C.card,
          borderRadius: 12,
          padding: 12,
          borderWidth: 1.5,
          borderColor: C.peach,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: freqExpanded ? 8 : 16,
        }}
      >
        <Text style={{ fontSize: 13, fontWeight: "700", color: C.warmBrown }}>
          {t("health.reminders.schedule.frequency")}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text
            testID={`${testID}-frequency-value`}
            style={{ fontSize: 15, fontWeight: "600", color: C.mutedBrown }}
          >
            {CADENCE_LABELS[frequency] ?? frequency}
          </Text>
          <Text style={{ fontSize: 12, color: C.mutedBrown }}>
            {freqExpanded ? "▲" : "▼"}
          </Text>
        </View>
      </TouchableOpacity>
      {freqExpanded && (
        <CadenceFrequencySelector
          value={frequency}
          onChange={selectFrequency}
          options={cadenceOptions}
          color={color}
          style={{ marginBottom: 16 }}
          testID={`${testID}-frequency`}
        />
      )}

      {/* Hourly → interval presets */}
      {frequency === ROUTINE_FREQUENCY.HOURLY && (
        <>
          <SectionLabel>{t("health.reminders.schedule.every")}</SectionLabel>
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
                label={t("health.reminders.schedule.hoursN", { count: h })}
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
            {frequency === ROUTINE_FREQUENCY.CUSTOM
              ? t("health.reminders.schedule.days")
              : t("health.reminders.schedule.onTheseDays")}
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
            <Hint>{t("health.reminders.schedule.biweeklyHint")}</Hint>
          )}
          {frequency !== ROUTINE_FREQUENCY.BIWEEKLY && <View style={{ marginBottom: 8 }} />}
        </>
      )}

      {/* Month-multiple / Once → anchored on the picked date */}
      {isDateAnchored(frequency) && (
        <Hint>
          {frequency === ROUTINE_FREQUENCY.ONCE
            ? t("health.reminders.schedule.onceHint")
            : t("health.reminders.schedule.monthlyHint")}
        </Hint>
      )}

      {/* Early reminder (lead-time) */}
      <SectionLabel>{t("health.reminders.schedule.earlyReminder")}</SectionLabel>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {EARLY_REMINDER_OPTIONS.map((opt) => (
          <Pill
            key={opt.value}
            testID={`${testID}-early-${opt.value}`}
            label={earlyReminderLabel(opt.value)}
            selected={schedule.reminderTiming === opt.value}
            onPress={() => set({ reminderTiming: opt.value })}
            color={color}
          />
        ))}
      </View>
    </View>
  );
}
