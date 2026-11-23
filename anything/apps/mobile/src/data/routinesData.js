/**
 * Routines Data Model
 * Routines are the source of truth for generating reminders
 */

import { formatDisplayDate, formatDisplayTime } from "@/utils/canonicalDateTime";
import { COLORS } from "@/constants/theme";
import { formatLocalDate, formatLocalTime } from "@/utils/localeDateTime";
import { tr } from "@/utils/healthText";

export const ROUTINE_TYPES = {
  FEEDING: "feeding",
  WALK: "walk",
  MEDICATION: "medication",
  PHOTO_CHECK: "photo_check",
  GENERAL_CHECK: "general_check",
  WEIGHT_CHECK: "weight_check",
  PREVENTIVE: "preventive",
  VACCINE: "vaccine",
  VET_APPOINTMENT: "vet_appointment",
  // New grouped types
  MEDICAL_CARE: "medical_care",
  WELLNESS_CHECK: "wellness_check",
};

export const MEDICAL_CARE_SUBTYPES = {
  MEDICATION: "medication",
  VACCINE: "vaccine",
  FLEA_TICK: "flea_tick",
  DEWORMING: "deworming",
  HEARTWORM: "heartworm",
  SUPPLEMENT: "supplement",
  OTHER: "other",
};

export const WELLNESS_CHECK_ITEMS = {
  GENERAL: "general",
  WEIGHT: "weight",
  BODY_CONDITION: "body_condition",
  MOBILITY: "mobility",
  MOOD_ENERGY: "mood_energy",
  SKIN_COAT: "skin_coat",
  APPETITE_HYDRATION: "appetite_hydration",
  CUSTOM: "custom",
};

export const ROUTINE_FREQUENCY = {
  DAILY: "daily",
  WEEKDAYS: "weekdays",
  WEEKENDS: "weekends",
  WEEKLY: "weekly",
  BIWEEKLY: "biweekly",
  MONTHLY: "monthly",
  EVERY_3_MONTHS: "every_3_months",
  EVERY_6_MONTHS: "every_6_months",
  YEARLY: "yearly",
  CUSTOM: "custom",
  // Non-repeating — fires exactly once and never recurs (iOS "Never").
  ONCE: "once",
  // Intra-day interval — fires every `intervalHours` hours from the start
  // anchor (iOS "Hourly", implemented as a user-chosen interval like 2/4/6/8/12h
  // to keep reminder volume sane). The only cadence with multiple occurrences
  // per day; see the instance-id convention in reminderGenerator.js.
  HOURLY: "hourly",
};

// Lowercase, human cadence labels for routine-card schedule summaries (localized getters: they resolve
// through i18n at read time and fall back to the English text). Covers the
// full ROUTINE_FREQUENCY set; the humanizing fallback (underscores → spaces) means
// no raw enum (e.g. "every_3_months") can ever surface in a summary, even for a
// future cadence not yet listed here.
export const CADENCE_LABELS = {
  get [ROUTINE_FREQUENCY.DAILY]() {
    return tr("healthDataUi.cadence.daily", "daily");
  },
  get [ROUTINE_FREQUENCY.WEEKDAYS]() {
    return tr("healthDataUi.cadence.weekdays", "weekdays");
  },
  get [ROUTINE_FREQUENCY.WEEKENDS]() {
    return tr("healthDataUi.cadence.weekends", "weekends");
  },
  get [ROUTINE_FREQUENCY.WEEKLY]() {
    return tr("healthDataUi.cadence.weekly", "weekly");
  },
  get [ROUTINE_FREQUENCY.BIWEEKLY]() {
    return tr("healthDataUi.cadence.biweekly", "every 2 weeks");
  },
  get [ROUTINE_FREQUENCY.MONTHLY]() {
    return tr("healthDataUi.cadence.monthly", "monthly");
  },
  get [ROUTINE_FREQUENCY.EVERY_3_MONTHS]() {
    return tr("healthDataUi.cadence.every_3_months", "every 3 months");
  },
  get [ROUTINE_FREQUENCY.EVERY_6_MONTHS]() {
    return tr("healthDataUi.cadence.every_6_months", "every 6 months");
  },
  get [ROUTINE_FREQUENCY.YEARLY]() {
    return tr("healthDataUi.cadence.yearly", "yearly");
  },
  get [ROUTINE_FREQUENCY.CUSTOM]() {
    return tr("healthDataUi.cadence.custom", "custom");
  },
  get [ROUTINE_FREQUENCY.ONCE]() {
    return tr("healthDataUi.cadence.once", "once");
  },
  get [ROUTINE_FREQUENCY.HOURLY]() {
    return tr("healthDataUi.cadence.hourly", "hourly");
  },
};

// Resolve a cadence enum to its human label. Falsy → "" (nothing to render);
// unknown → underscores replaced with spaces, so a raw enum never shows.
export function getCadenceLabel(freq) {
  if (!freq) return "";
  return CADENCE_LABELS[freq] || String(freq).replace(/_/g, " ");
}

export const DAYS_OF_WEEK = {
  MONDAY: 0,
  TUESDAY: 1,
  WEDNESDAY: 2,
  THURSDAY: 3,
  FRIDAY: 4,
  SATURDAY: 5,
  SUNDAY: 6,
};

export const BODY_AREAS = {
  PAWS: "paws",
  EARS: "ears",
  EYES: "eyes",
  TEETH: "teeth",
  SKIN_FUR: "skin_fur",
  FACE: "face",
  FULL_BODY: "full_body",
  OTHER: "other",
};

export const BODY_AREA_CONFIG = {
  [BODY_AREAS.PAWS]: {
    label: "Paws",
    icon: "🐾",
    defaultFrequency: ROUTINE_FREQUENCY.WEEKLY,
  },
  [BODY_AREAS.EARS]: {
    label: "Ears",
    icon: "👂",
    defaultFrequency: ROUTINE_FREQUENCY.BIWEEKLY,
  },
  [BODY_AREAS.EYES]: {
    label: "Eyes",
    icon: "👁️",
    defaultFrequency: ROUTINE_FREQUENCY.WEEKLY,
  },
  [BODY_AREAS.TEETH]: {
    label: "Teeth",
    icon: "🦷",
    defaultFrequency: ROUTINE_FREQUENCY.MONTHLY,
  },
  [BODY_AREAS.SKIN_FUR]: {
    label: "Skin / Fur",
    icon: "🧴",
    defaultFrequency: ROUTINE_FREQUENCY.MONTHLY,
  },
  [BODY_AREAS.FACE]: {
    label: "Face",
    icon: "😊",
    defaultFrequency: ROUTINE_FREQUENCY.MONTHLY,
  },
  [BODY_AREAS.FULL_BODY]: {
    label: "Full Body",
    icon: "🔍",
    defaultFrequency: ROUTINE_FREQUENCY.MONTHLY,
  },
  [BODY_AREAS.OTHER]: {
    label: "Other",
    icon: "📋",
    defaultFrequency: ROUTINE_FREQUENCY.MONTHLY,
  },
};

export const ROUTINE_TYPE_CONFIG = {
  [ROUTINE_TYPES.FEEDING]: {
    icon: "🍽️",
    get label() {
      return tr("healthDataUi.routineType.feeding.label", "Feeding");
    },
    color: COLORS.coral,
    get description() {
      return tr("healthDataUi.routineType.feeding.description", "Meal times, snacks, and food reminders");
    },
  },
  [ROUTINE_TYPES.WALK]: {
    icon: "🚶",
    get label() {
      return tr("healthDataUi.routineType.walk.label", "Walks");
    },
    color: COLORS.sage,
    get description() {
      return tr("healthDataUi.routineType.walk.description", "Walk schedule, social walks, and activity tracking");
    },
  },
  [ROUTINE_TYPES.PHOTO_CHECK]: {
    icon: "📸",
    get label() {
      return tr("healthDataUi.routineType.photo_check.label", "Photo Check");
    },
    color: "#4DB8E8",
    get description() {
      return tr("healthDataUi.routineType.photo_check.description", "Recurring photos of paws, ears, teeth, eyes, and more");
    },
  },
  [ROUTINE_TYPES.MEDICAL_CARE]: {
    icon: "💊",
    get label() {
      return tr("healthDataUi.routineType.medical_care.label", "Medical Care");
    },
    color: COLORS.terracotta,
    get description() {
      return tr("healthDataUi.routineType.medical_care.description", "Medication, vaccines, flea/tick prevention, and supplements");
    },
  },
  [ROUTINE_TYPES.WELLNESS_CHECK]: {
    icon: "⚖️",
    get label() {
      return tr("healthDataUi.routineType.wellness_check.label", "Wellness Check");
    },
    color: "#F4A460",
    get description() {
      return tr("healthDataUi.routineType.wellness_check.description", "Weight, body condition, mood, and quick health checks");
    },
  },
  [ROUTINE_TYPES.VET_APPOINTMENT]: {
    icon: "🩺",
    get label() {
      return tr("healthDataUi.routineType.vet_appointment.label", "Vet Appointment");
    },
    color: "#4DB8E8",
    get description() {
      return tr("healthDataUi.routineType.vet_appointment.description", "Scheduled vet visits and follow-ups");
    },
  },
  // Legacy types (kept for backward compatibility)
  [ROUTINE_TYPES.MEDICATION]: {
    icon: "💊",
    get label() {
      return tr("healthDataUi.routineType.medication.label", "Medication");
    },
    color: COLORS.terracotta,
    get description() {
      return tr("healthDataUi.routineType.medication.description", "Medication schedule");
    },
    legacy: true,
    newType: ROUTINE_TYPES.MEDICAL_CARE,
  },
  [ROUTINE_TYPES.GENERAL_CHECK]: {
    icon: "✅",
    get label() {
      return tr("healthDataUi.routineType.general_check.label", "General Check");
    },
    color: "#F4A460",
    get description() {
      return tr("healthDataUi.routineType.general_check.description", "Daily health check");
    },
    legacy: true,
    newType: ROUTINE_TYPES.WELLNESS_CHECK,
  },
  [ROUTINE_TYPES.WEIGHT_CHECK]: {
    icon: "⚖️",
    get label() {
      return tr("healthDataUi.routineType.weight_check.label", "Weight Check");
    },
    color: COLORS.terracotta,
    get description() {
      return tr("healthDataUi.routineType.weight_check.description", "Weight monitoring");
    },
    legacy: true,
    newType: ROUTINE_TYPES.WELLNESS_CHECK,
  },
  [ROUTINE_TYPES.PREVENTIVE]: {
    icon: "🛡️",
    get label() {
      return tr("healthDataUi.routineType.preventive.label", "Preventive Care");
    },
    color: COLORS.sage,
    get description() {
      return tr("healthDataUi.routineType.preventive.description", "Flea, tick, heartworm prevention");
    },
    legacy: true,
    newType: ROUTINE_TYPES.MEDICAL_CARE,
  },
  [ROUTINE_TYPES.VACCINE]: {
    icon: "💉",
    get label() {
      return tr("healthDataUi.routineType.vaccine.label", "Vaccine");
    },
    color: COLORS.coral,
    get description() {
      return tr("healthDataUi.routineType.vaccine.description", "Vaccination schedule");
    },
    legacy: true,
    newType: ROUTINE_TYPES.MEDICAL_CARE,
  },
};

// Localized phrase helpers for the schedule / next-reminder summaries below. English is the
// fallback (identical to the pre-i18n text), so English output and English tests are unchanged.
const sched = (key, en, params) => tr(`healthDataUi.sched.${key}`, en, params);
const nextText = (key, en, params) => tr(`healthDataUi.next.${key}`, en, params);
const DAY_IDS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const DAY_EN = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const dayLongName = (i) =>
  DAY_IDS[i] ? tr(`healthDataUi.days.${DAY_IDS[i]}`, DAY_EN[i]) : "";
// "Every Monday" -> es "Todos los lunes": the day needs its own (plural, with article) form.
const dayEveryName = (i) =>
  DAY_IDS[i] ? tr(`healthDataUi.daysEvery.${DAY_IDS[i]}`, DAY_EN[i]) : "";
const DAY_ABBR_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_ABBR_IDS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const dayAbbrName = (i) =>
  DAY_ABBR_IDS[i] ? tr(`walkItem.days.${DAY_ABBR_IDS[i]}`, DAY_ABBR_EN[i]) : undefined;
const joinAnd = (parts) => parts.join(sched("and", " and "));
const AREA_ID_EN = {
  paws: "Paws",
  ears: "Ears",
  eyes: "Eyes",
  teeth: "Teeth",
  skin_fur: "Skin/Fur",
  face: "Face",
  full_body: "Full Body",
  other: "Other",
};
const areaLabelText = (bodyArea) =>
  AREA_ID_EN[bodyArea] ? tr(`routineCard.areas.${bodyArea}`, AREA_ID_EN[bodyArea]) : bodyArea;
const WELLNESS_ITEM_EN = {
  general: "General",
  weight: "Weight",
  body_condition: "Body condition",
  mobility: "Mobility",
  mood_energy: "Mood/Energy",
  skin_coat: "Skin/Coat",
  appetite_hydration: "Appetite/Hydration",
};
const wellnessItemText = (checkType) =>
  WELLNESS_ITEM_EN[checkType]
    ? sched(`wellnessItems.${checkType}`, WELLNESS_ITEM_EN[checkType])
    : checkType;

/**
 * Get human-readable schedule summary
 */
export function getScheduleSummary(routine) {
  if (!routine.isActive) return sched("inactive", "Inactive");

  // Handle Medical Care routine with items array
  if (
    routine.type === ROUTINE_TYPES.MEDICAL_CARE &&
    Array.isArray(routine.medicalCareItems) &&
    routine.medicalCareItems.length > 0
  ) {
    const items = routine.medicalCareItems;
    const itemTypeLabels = {
      medication: "Medication",
      vaccine: "Vaccine",
      flea_tick: "Flea/tick",
      deworming: "Deworming",
      heartworm: "Heartworm",
      supplement: "Supplement",
      other: "Other",
    };
    const summaries = items.map((it) => {
      const label =
        it.name ||
        (itemTypeLabels[it.type]
          ? sched(`itemTypes.${it.type}`, itemTypeLabels[it.type])
          : sched("itemTypes.item", "Item"));
      let detail = "";
      if (
        it.type === MEDICAL_CARE_SUBTYPES.MEDICATION ||
        it.type === MEDICAL_CARE_SUBTYPES.SUPPLEMENT
      ) {
        const times = (it.times || []).join(" · ");
        detail = times
          ? sched("dailyAt", "daily at {{times}}", { times })
          : sched("daily", "daily");
      } else if (it.type === MEDICAL_CARE_SUBTYPES.VACCINE) {
        detail = it.nextDue
          ? sched("nextDue", "next due {{date}}", { date: it.nextDue })
          : "";
      } else if (it.repeatInterval) {
        detail = getCadenceLabel(it.repeatInterval);
      }
      return detail ? `${label} (${detail})` : label;
    });
    return summaries.join("\n");
  }

  // Handle Feeding routine with meal-specific schedules
  if (routine.type === ROUTINE_TYPES.FEEDING && routine.meals) {
    const activeMeals = routine.meals.filter(
      (m) => m.reminderEnabled !== false,
    );
    if (activeMeals.length === 0)
      return sched("noMealReminders", "No active meal reminders");

    // If all meals have the same frequency, show consolidated
    const frequencies = [...new Set(activeMeals.map((m) => m.frequency))];
    if (
      frequencies.length === 1 &&
      frequencies[0] === ROUTINE_FREQUENCY.DAILY
    ) {
      const times = activeMeals.map((m) => m.time);
      const timeStrings = times.map((time) => {
        return formatDisplayTime(time);
      });
      return sched("everyDayAt", "Every day at {{times}}", {
        times: joinAnd(timeStrings),
      });
    }

    // Otherwise show meal count with varied schedules
    return sched(
      "mealsCustom",
      activeMeals.length > 1
        ? "{{count}} meals with custom schedules"
        : "{{count}} meal with custom schedules",
      { count: activeMeals.length },
    );
  }

  // Handle Walk routine with walk-specific schedules
  if (routine.type === ROUTINE_TYPES.WALK && routine.walks) {
    const activeWalks = routine.walks.filter(
      (w) => w.reminderEnabled !== false,
    );
    if (activeWalks.length === 0)
      return sched("noWalkReminders", "No active walk reminders");

    // Check if all walks have same frequency
    const frequencies = [...new Set(activeWalks.map((w) => w.frequency))];
    const allDaily =
      frequencies.length === 1 && frequencies[0] === ROUTINE_FREQUENCY.DAILY;

    if (allDaily) {
      // All walks are daily - show times
      const timeStrings = activeWalks.map((w) => {
        return formatDisplayTime(w.time);
      });
      return sched("dailyAtWalks", "Daily at {{times}}", {
        times: timeStrings.join(" · "),
      });
    }

    // Different schedules - show individual walk summaries
    const summaries = activeWalks.map((w) => {
      const timeStr = formatDisplayTime(w.time);

      let freqStr = "";
      switch (w.frequency) {
        case ROUTINE_FREQUENCY.DAILY:
          freqStr = sched("walkFreq.daily", "daily");
          break;
        case ROUTINE_FREQUENCY.WEEKDAYS:
          freqStr = sched("walkFreq.weekdays", "weekdays");
          break;
        case ROUTINE_FREQUENCY.WEEKENDS:
          freqStr = sched("walkFreq.weekends", "weekends");
          break;
        case ROUTINE_FREQUENCY.CUSTOM:
          if (w.days && w.days.length > 0) {
            const dayStrs = w.days.map((d) => dayAbbrName(d));
            freqStr = dayStrs.join("/");
          } else {
            freqStr = sched("walkFreq.custom", "custom");
          }
          break;
        default:
          freqStr = sched("walkFreq.custom", "custom");
      }

      return sched("walkSummary", "{{name}} {{freq}} at {{time}}", {
        name: w.name,
        freq: freqStr,
        time: timeStr,
      });
    });

    return summaries.join(" · ");
  }

  // Handle Photo Check routine with multi-area support
  if (routine.type === ROUTINE_TYPES.PHOTO_CHECK) {
    // Support both new multi-area format and legacy single-area format
    const photoCheckSchedules =
      routine.photoCheckSchedule && Array.isArray(routine.photoCheckSchedule)
        ? routine.photoCheckSchedule
        : routine.bodyArea
          ? [
              {
                bodyArea: routine.bodyArea,
                frequency: routine.frequency || ROUTINE_FREQUENCY.WEEKLY,
                preferredDay: routine.preferredDay ?? 6,
                preferredTime: routine.times?.[0] || "10:00",
                reminderEnabled: routine.notificationEnabled ?? true,
              },
            ]
          : [];

    const activeSchedules = photoCheckSchedules.filter(
      (s) => s.reminderEnabled !== false,
    );

    if (activeSchedules.length === 0)
      return sched("noPhotoReminders", "No active photo check reminders");

    // Helper to format area label
    const getAreaLabel = areaLabelText;

    // Helper to format frequency (shared full-cadence label map)
    const getFreqLabel = getCadenceLabel;

    // Helper to format time
    const formatTime = (time) => {
      return formatDisplayTime(time);
    };

    // Helper to get day name
    const getDayName = dayLongName;

    // Check if all schedules are the same
    const first = activeSchedules[0];
    const allSameSchedule = activeSchedules.every(
      (s) =>
        s.frequency === first.frequency &&
        s.preferredDay === first.preferredDay &&
        s.preferredTime === first.preferredTime,
    );

    if (allSameSchedule) {
      // All areas have the same schedule - show combined
      const areaList = activeSchedules
        .map((s) => getAreaLabel(s.bodyArea))
        .join(" · ");
      const freqLabel = getFreqLabel(first.frequency);
      const dayLabel = getDayName(first.preferredDay);
      const timeLabel = formatTime(first.preferredTime);
      return `${areaList}\n${sched("cadenceDayAt", "{{cadence}} {{day}} at {{time}}", {
        cadence: freqLabel,
        day: dayLabel,
        time: timeLabel,
      })}`;
    } else {
      // Different schedules - show each area's schedule
      const summaries = activeSchedules.map((s) => {
        const areaLabel = getAreaLabel(s.bodyArea);
        const freqLabel = getFreqLabel(s.frequency);
        const dayLabel = getDayName(s.preferredDay);
        const timeLabel = formatTime(s.preferredTime);
        return sched("areaCadenceDay", "{{item}} {{cadence}} {{day}} {{time}}", {
          item: areaLabel,
          cadence: freqLabel,
          day: dayLabel,
          time: timeLabel,
        });
      });
      return summaries.join("\n");
    }
  }

  // Handle Wellness Check routine with multi-item support
  if (routine.type === ROUTINE_TYPES.WELLNESS_CHECK) {
    // Support both new multi-item format and legacy format
    const wellnessCheckItems =
      routine.wellnessCheckItems && Array.isArray(routine.wellnessCheckItems)
        ? routine.wellnessCheckItems
        : [];

    const activeItems = wellnessCheckItems.filter(
      (item) => item.reminderEnabled !== false,
    );

    if (activeItems.length === 0)
      return sched("noWellnessReminders", "No active wellness check reminders");

    // Helper to format item label
    const getItemLabel = (checkType, customName) => {
      if (checkType === WELLNESS_CHECK_ITEMS.CUSTOM && customName) {
        return customName;
      }
      return wellnessItemText(checkType);
    };

    // Helper to format frequency (shared full-cadence label map)
    const getFreqLabel = getCadenceLabel;

    // Helper to format time
    const formatTime = (time) => {
      return formatDisplayTime(time);
    };

    // Helper to get day name
    const getDayName = dayLongName;

    // Check if all items have the same schedule
    const first = activeItems[0];
    const allSameSchedule = activeItems.every(
      (item) =>
        item.frequency === first.frequency &&
        item.preferredDay === first.preferredDay &&
        item.preferredTime === first.preferredTime,
    );

    if (allSameSchedule) {
      // All items have the same schedule - show combined
      const itemList = activeItems
        .map((item) => getItemLabel(item.checkType, item.customName))
        .join(" · ");
      const freqLabel = getFreqLabel(first.frequency);
      const dayLabel =
        first.frequency === ROUTINE_FREQUENCY.WEEKLY ||
        first.frequency === ROUTINE_FREQUENCY.BIWEEKLY
          ? getDayName(first.preferredDay)
          : "";
      const timeLabel = formatTime(first.preferredTime);
      return dayLabel
        ? `${itemList}\n${sched("cadenceDayAt", "{{cadence}} {{day}} at {{time}}", {
            cadence: freqLabel,
            day: dayLabel,
            time: timeLabel,
          })}`
        : `${itemList}\n${sched("cadenceAt", "{{cadence}} at {{time}}", {
            cadence: freqLabel,
            time: timeLabel,
          })}`;
    } else {
      // Different schedules - show each item's schedule
      const summaries = activeItems.map((item) => {
        const itemLabel = getItemLabel(item.checkType, item.customName);
        const freqLabel = getFreqLabel(item.frequency);
        const dayLabel =
          item.frequency === ROUTINE_FREQUENCY.WEEKLY ||
          item.frequency === ROUTINE_FREQUENCY.BIWEEKLY
            ? getDayName(item.preferredDay)
            : "";
        const timeLabel = formatTime(item.preferredTime);
        return dayLabel
          ? sched("areaCadenceDay", "{{item}} {{cadence}} {{day}} {{time}}", {
              item: itemLabel,
              cadence: freqLabel,
              day: dayLabel,
              time: timeLabel,
            })
          : sched("itemCadence", "{{item}} {{cadence}} {{time}}", {
              item: itemLabel,
              cadence: freqLabel,
              time: timeLabel,
            });
      });
      return summaries.join("\n");
    }
  }

  // Handle Vet Appointment routine with multi-appointment support
  if (routine.type === ROUTINE_TYPES.VET_APPOINTMENT) {
    // Support both new multi-appointment format and legacy format
    const vetAppointments =
      routine.vetAppointmentSchedule &&
      Array.isArray(routine.vetAppointmentSchedule)
        ? routine.vetAppointmentSchedule
        : routine.appointmentTitle
          ? [
              {
                title: routine.appointmentTitle,
                date: routine.date,
                time: routine.times?.[0] || "10:00",
                clinic: routine.clinic,
                reminderEnabled: routine.notificationEnabled,
              },
            ]
          : [];

    const activeAppointments = vetAppointments.filter(
      (appt) => appt.reminderEnabled !== false && appt.active !== false,
    );

    if (activeAppointments.length === 0)
      return sched("noVetReminders", "No active vet appointment reminders");

    // Helper to format time
    const formatTime = (time) => {
      if (!time) return "";
      return formatDisplayTime(time);
    };

    // Build summary for each appointment
    const summaries = activeAppointments.map((appt) => {
      const title = appt.title || sched("vetAppointment", "Vet Appointment");
      const dateStr =
        formatDisplayDate(appt.date) || sched("dateTbd", "Date TBD");
      const timeStr = formatTime(appt.time);
      return sched("vetLine", "{{title}} • {{date}} at {{time}}", {
        title,
        date: dateStr,
        time: timeStr,
      });
    });

    return summaries.join("\n");
  }

  const times = routine.times || [];
  const frequency = routine.frequency;
  const days = routine.days || [];

  let scheduleText = "";

  // Frequency
  switch (frequency) {
    case ROUTINE_FREQUENCY.DAILY:
      scheduleText = sched("everyDay", "Every day");
      break;
    case ROUTINE_FREQUENCY.WEEKDAYS:
      scheduleText = sched("weekdays", "Weekdays");
      break;
    case ROUTINE_FREQUENCY.WEEKENDS:
      scheduleText = sched("weekends", "Weekends");
      break;
    case ROUTINE_FREQUENCY.WEEKLY:
      if (days.length === 1) {
        scheduleText = sched("everyDayName", "Every {{day}}", {
          day: dayEveryName(days[0]),
        });
      } else {
        scheduleText = sched("weekly", "Weekly");
      }
      break;
    case ROUTINE_FREQUENCY.BIWEEKLY:
      scheduleText = sched("biweekly", "Every 2 weeks");
      break;
    case ROUTINE_FREQUENCY.MONTHLY:
      scheduleText = sched("monthly", "Monthly");
      break;
    case ROUTINE_FREQUENCY.CUSTOM:
      scheduleText = sched("customSchedule", "Custom schedule");
      break;
    default:
      scheduleText = sched("custom", "Custom");
  }

  // Times
  if (times.length > 0) {
    const timeStrings = times.map((time) => {
      return formatDisplayTime(time);
    });
    scheduleText += sched("atTimes", " at {{times}}", {
      times: joinAnd(timeStrings),
    });
  }

  // End date
  if (routine.endDate) {
    scheduleText += sched("untilDate", " until {{date}}", {
      date: formatDisplayDate(routine.endDate),
    });
  }

  return scheduleText;
}

const NOT_SCHEDULED = () => nextText("notScheduled", "Not scheduled");
const NEXT_WELLNESS_EN = {
  general: "General check",
  weight: "Weight check",
  body_condition: "Body condition check",
  mobility: "Mobility check",
  mood_energy: "Mood / Energy check",
  skin_coat: "Skin / Coat check",
  appetite_hydration: "Appetite / Hydration check",
  custom: "Wellness check",
};
const nextWellnessLabel = (checkType) =>
  NEXT_WELLNESS_EN[checkType]
    ? nextText(`wellness.${checkType}`, NEXT_WELLNESS_EN[checkType])
    : undefined;
const NEXT_PHOTO_EN = {
  paws: "Paws photo",
  ears: "Ears photo",
  eyes: "Eyes photo",
  teeth: "Teeth photo",
  skin_fur: "Skin/Fur photo",
  face: "Face photo",
  full_body: "Full body photo",
  other: "Photo check",
};
const nextPhotoLabel = (bodyArea) =>
  NEXT_PHOTO_EN[bodyArea]
    ? nextText(`photo.${bodyArea}`, NEXT_PHOTO_EN[bodyArea])
    : undefined;

/**
 * Get next reminder preview
 */
export function getNextReminderPreview(routine) {
  if (!routine.isActive) return null;

  // Handle Feeding routine with meal-specific schedules
  if (routine.type === ROUTINE_TYPES.FEEDING && routine.meals) {
    const now = new Date();
    let nextMeal = null;
    let nextOccurrence = null;

    for (const meal of routine.meals) {
      if (meal.reminderEnabled === false) continue;

      const mealOccurrence = calculateNextOccurrence(
        meal.time,
        meal.frequency,
        meal.days || [],
        now,
      );

      if (
        mealOccurrence &&
        (!nextOccurrence || mealOccurrence < nextOccurrence)
      ) {
        nextOccurrence = mealOccurrence;
        nextMeal = meal;
      }
    }

    if (!nextMeal || !nextOccurrence) return NOT_SCHEDULED();

    return formatReminderPreview(nextMeal.name, nextOccurrence, now);
  }

  // Handle Walk routine with walk-specific schedules
  if (routine.type === ROUTINE_TYPES.WALK && routine.walks) {
    const now = new Date();
    let nextWalk = null;
    let nextOccurrence = null;

    for (const walk of routine.walks) {
      if (walk.reminderEnabled === false) continue;

      const walkOccurrence = calculateNextOccurrence(
        walk.time,
        walk.frequency,
        walk.days || [],
        now,
      );

      if (
        walkOccurrence &&
        (!nextOccurrence || walkOccurrence < nextOccurrence)
      ) {
        nextOccurrence = walkOccurrence;
        nextWalk = walk;
      }
    }

    if (!nextWalk || !nextOccurrence) return NOT_SCHEDULED();

    return formatReminderPreview(nextWalk.name, nextOccurrence, now);
  }

  // Handle Wellness Check routine with multi-item support
  if (
    routine.type === ROUTINE_TYPES.WELLNESS_CHECK &&
    Array.isArray(routine.wellnessCheckItems)
  ) {
    const now = new Date();
    let nextItem = null;
    let nextOccurrence = null;

    for (const item of routine.wellnessCheckItems) {
      if (item.reminderEnabled === false) continue;

      const itemOccurrence = calculateNextOccurrence(
        item.preferredTime || "09:00",
        item.frequency || ROUTINE_FREQUENCY.WEEKLY,
        item.preferredDay !== undefined ? [item.preferredDay] : [],
        now,
      );

      if (
        itemOccurrence &&
        (!nextOccurrence || itemOccurrence < nextOccurrence)
      ) {
        nextOccurrence = itemOccurrence;
        nextItem = item;
      }
    }

    if (!nextItem || !nextOccurrence) return NOT_SCHEDULED();

    const label =
      nextItem.customName ||
      nextWellnessLabel(nextItem.checkType) ||
      nextText("wellness.custom", "Wellness check");
    return formatReminderPreview(label, nextOccurrence, now);
  }

  // Handle Photo Check routine with multi-area support
  if (routine.type === ROUTINE_TYPES.PHOTO_CHECK) {
    const now = new Date();
    let nextSchedule = null;
    let nextOccurrence = null;

    const photoCheckSchedules =
      routine.photoCheckSchedule && Array.isArray(routine.photoCheckSchedule)
        ? routine.photoCheckSchedule
        : routine.bodyArea
          ? [
              {
                bodyArea: routine.bodyArea,
                frequency: routine.frequency || ROUTINE_FREQUENCY.WEEKLY,
                preferredDay: routine.preferredDay ?? 6,
                preferredTime: routine.times?.[0] || "10:00",
                reminderEnabled: routine.notificationEnabled ?? true,
              },
            ]
          : [];

    for (const schedule of photoCheckSchedules) {
      if (schedule.reminderEnabled === false) continue;

      const scheduleOccurrence = calculateNextOccurrence(
        schedule.preferredTime || "10:00",
        schedule.frequency || ROUTINE_FREQUENCY.WEEKLY,
        schedule.preferredDay !== undefined ? [schedule.preferredDay] : [],
        now,
      );

      if (
        scheduleOccurrence &&
        (!nextOccurrence || scheduleOccurrence < nextOccurrence)
      ) {
        nextOccurrence = scheduleOccurrence;
        nextSchedule = schedule;
      }
    }

    if (!nextSchedule || !nextOccurrence) return NOT_SCHEDULED();

    const label =
      nextPhotoLabel(nextSchedule.bodyArea) ||
      nextText("photo.other", "Photo check");
    return formatReminderPreview(label, nextOccurrence, now);
  }

  const now = new Date();
  const times = routine.times || [];
  const frequency = routine.frequency;

  if (times.length === 0) return NOT_SCHEDULED();

  // Calculate next occurrence
  let nextOccurrence = null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const time of times) {
    const candidate = calculateNextOccurrence(
      time,
      frequency,
      routine.days || [],
      now,
    );
    if (candidate && (!nextOccurrence || candidate < nextOccurrence)) {
      nextOccurrence = candidate;
    }
  }

  if (!nextOccurrence) return NOT_SCHEDULED();

  const config = ROUTINE_TYPE_CONFIG[routine.type];
  let label = config?.label || nextText("reminder", "Reminder");

  // Add body area for photo checks
  if (routine.bodyArea && routine.bodyArea !== BODY_AREAS.OTHER) {
    label = nextPhotoLabel(routine.bodyArea) || label;
  }

  return formatReminderPreview(label, nextOccurrence, now);
}

/**
 * Calculate next occurrence for a given time, frequency, and days
 */
function calculateNextOccurrence(time, frequency, days, fromDate) {
  const [hours, minutes] = time.split(":");
  const candidate = new Date(fromDate);
  candidate.setHours(parseInt(hours), parseInt(minutes), 0, 0);

  // If time already passed today, start from tomorrow
  if (candidate < fromDate) {
    candidate.setDate(candidate.getDate() + 1);
  }

  // Apply frequency rules
  switch (frequency) {
    case ROUTINE_FREQUENCY.DAILY:
      return candidate; // Next occurrence is today or tomorrow

    case ROUTINE_FREQUENCY.WEEKDAYS:
      // Find next weekday
      while (candidate.getDay() === 0 || candidate.getDay() === 6) {
        candidate.setDate(candidate.getDate() + 1);
      }
      return candidate;

    case ROUTINE_FREQUENCY.WEEKENDS:
      // Find next weekend day
      while (candidate.getDay() !== 0 && candidate.getDay() !== 6) {
        candidate.setDate(candidate.getDate() + 1);
      }
      return candidate;

    case ROUTINE_FREQUENCY.CUSTOM:
      if (!days || days.length === 0) return null;
      // Find next day that matches one of the custom days
      // days array uses Monday=0, Sunday=6
      // JavaScript Date.getDay() uses Sunday=0, Saturday=6
      // Convert: our Monday=0 -> JS Monday=1
      const jsCurrentDay = candidate.getDay();
      const ourCurrentDay = jsCurrentDay === 0 ? 6 : jsCurrentDay - 1;

      // Find next matching day
      for (let i = 0; i < 7; i++) {
        const testDate = new Date(candidate);
        testDate.setDate(testDate.getDate() + i);
        const jsTestDay = testDate.getDay();
        const ourTestDay = jsTestDay === 0 ? 6 : jsTestDay - 1;

        if (days.includes(ourTestDay)) {
          return testDate;
        }
      }
      return null;

    case ROUTINE_FREQUENCY.WEEKLY:
      return candidate; // Just return next occurrence

    default:
      return candidate;
  }
}

/**
 * Format reminder preview text
 */
function formatReminderPreview(label, nextOccurrence, now) {
  const isToday = nextOccurrence.toDateString() === now.toDateString();
  const isTomorrow =
    nextOccurrence.toDateString() ===
    new Date(now.getTime() + 86400000).toDateString();

  const timeStr = formatLocalTime(nextOccurrence, {
    hour: "numeric",
    minute: "2-digit",
  });

  if (isToday) {
    const timeOfDay = getTimeOfDay(nextOccurrence);
    return nextText("todayAt", "{{label}} {{timeOfDay}} at {{time}}", {
      label,
      timeOfDay,
      time: timeStr,
    });
  } else if (isTomorrow) {
    return nextText("tomorrowAt", "{{label}} tomorrow at {{time}}", {
      label,
      time: timeStr,
    });
  } else {
    const dayStr = formatLocalDate(nextOccurrence, {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
    return nextText("dayAt", "{{label}} {{day}} at {{time}}", {
      label,
      day: dayStr,
      time: timeStr,
    });
  }
}

function getTimeOfDay(date) {
  const hour = date.getHours();
  if (hour < 5) return nextText("tonight", "tonight");
  if (hour < 12) return nextText("thisMorning", "this morning");
  if (hour < 17) return nextText("thisAfternoon", "this afternoon");
  if (hour < 21) return nextText("thisEvening", "this evening");
  return nextText("tonight", "tonight");
}

/**
 * Mock routines data
 */
export const mockRoutines = [
  {
    id: "routine_feeding_1",
    petId: "sample-pet",
    type: ROUTINE_TYPES.FEEDING,
    isActive: true,
    meals: [
      {
        name: "Breakfast",
        time: "08:00",
        frequency: ROUTINE_FREQUENCY.DAILY,
        days: [],
        reminderEnabled: true,
        timeSensitive: true,
        notes: "Morning kibble with supplement",
      },
      {
        name: "Dinner",
        time: "20:00",
        frequency: ROUTINE_FREQUENCY.CUSTOM,
        days: [2, 4], // Wednesday and Friday
        reminderEnabled: true,
        timeSensitive: true,
        notes: "Wet food with joint supplement",
      },
    ],
    times: ["08:00", "20:00"],
    // Legacy fields for backward compatibility
    frequency: ROUTINE_FREQUENCY.CUSTOM,
    days: [],
    title: "Feeding",
    description: "2 meals with custom schedules",
    notificationEnabled: true,
    timeSensitive: true,
    notes: "Morning kibble with supplement; Wet food with joint supplement",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
  },
  {
    id: "routine_walk_1",
    petId: "sample-pet",
    type: ROUTINE_TYPES.WALK,
    isActive: true,
    walks: [
      {
        name: "Morning walk",
        time: "07:30",
        frequency: ROUTINE_FREQUENCY.DAILY,
        days: [],
        durationMinutes: 30,
        pace: "normal",
        reminderEnabled: true,
        timeSensitive: true,
        socialWalkEnabled: false,
        visibility: "friends",
        notes: "Quick neighborhood walk",
      },
      {
        name: "Park walk",
        time: "18:30",
        frequency: ROUTINE_FREQUENCY.CUSTOM,
        days: [2, 4], // Wednesday and Friday
        durationMinutes: 45,
        pace: "relaxed",
        reminderEnabled: true,
        timeSensitive: true,
        socialWalkEnabled: true,
        visibility: "friends",
        notes: "Park route with friends",
      },
    ],
    times: ["07:30", "18:30"],
    // Legacy fields for backward compatibility
    frequency: ROUTINE_FREQUENCY.CUSTOM,
    days: [],
    title: "Walks",
    description: "2 walks with custom schedules",
    notificationEnabled: true,
    timeSensitive: true,
    notes: "",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
  },
  {
    id: "routine_photocheck_1",
    petId: "sample-pet",
    type: ROUTINE_TYPES.PHOTO_CHECK,
    isActive: true,
    bodyArea: BODY_AREAS.PAWS,
    frequency: ROUTINE_FREQUENCY.WEEKLY,
    preferredDay: 6, // Sunday
    times: ["10:00"],
    days: [6],
    title: "Photo Check",
    description: "Paws photo check",
    notificationEnabled: true,
    timeSensitive: false,
    notes: "",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
  },
  {
    id: "routine_medication_1",
    petId: "sample-pet",
    type: ROUTINE_TYPES.MEDICATION,
    isActive: true,
    medicationName: "Apoquel",
    dose: "1 tablet",
    frequency: ROUTINE_FREQUENCY.DAILY,
    times: ["21:00"],
    startDate: "2025-01-01",
    endDate: "",
    prescribedBy: "Dr. Smith",
    instructions: "Give with evening meal",
    title: "Apoquel",
    description: "1 tablet - Give with evening meal",
    notificationEnabled: true,
    timeSensitive: true,
    notes: "",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
  },
  {
    id: "routine_generalcheck_1",
    petId: "sample-pet",
    type: ROUTINE_TYPES.GENERAL_CHECK,
    isActive: true,
    frequency: ROUTINE_FREQUENCY.WEEKLY,
    preferredDay: 6, // Sunday
    times: ["18:00"],
    days: [6],
    title: "General Check",
    description: "Daily health check",
    notificationEnabled: true,
    timeSensitive: true,
    notes: "",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
  },
  {
    id: "routine_weight_1",
    petId: "sample-pet",
    type: ROUTINE_TYPES.WEIGHT_CHECK,
    isActive: true,
    frequency: ROUTINE_FREQUENCY.WEEKLY,
    preferredDay: 5, // Saturday
    times: ["09:00"],
    days: [5],
    title: "Weight Check",
    description: "Weight monitoring",
    notificationEnabled: true,
    timeSensitive: false,
    notes: "",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
  },
];

export default {
  ROUTINE_TYPES,
  ROUTINE_FREQUENCY,
  ROUTINE_TYPE_CONFIG,
  BODY_AREAS,
  BODY_AREA_CONFIG,
  getScheduleSummary,
  getNextReminderPreview,
  mockRoutines,
};
