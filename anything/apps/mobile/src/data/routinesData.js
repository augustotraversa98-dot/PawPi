/**
 * Routines Data Model
 * Routines are the source of truth for generating reminders
 */

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
    label: "Feeding",
    color: "#FF6F61",
    description: "Meal times, snacks, and food reminders",
  },
  [ROUTINE_TYPES.WALK]: {
    icon: "🚶",
    label: "Walks",
    color: "#A7BFA3",
    description: "Walk schedule, social walks, and activity tracking",
  },
  [ROUTINE_TYPES.PHOTO_CHECK]: {
    icon: "📸",
    label: "Photo Check",
    color: "#4DB8E8",
    description: "Recurring photos of paws, ears, teeth, eyes, and more",
  },
  [ROUTINE_TYPES.MEDICAL_CARE]: {
    icon: "💊",
    label: "Medical Care",
    color: "#B75D32",
    description: "Medication, vaccines, flea/tick prevention, and supplements",
  },
  [ROUTINE_TYPES.WELLNESS_CHECK]: {
    icon: "⚖️",
    label: "Wellness Check",
    color: "#F4A460",
    description: "Weight, body condition, mood, and quick health checks",
  },
  [ROUTINE_TYPES.VET_APPOINTMENT]: {
    icon: "🩺",
    label: "Vet Appointment",
    color: "#4DB8E8",
    description: "Scheduled vet visits and follow-ups",
  },
  // Legacy types (kept for backward compatibility)
  [ROUTINE_TYPES.MEDICATION]: {
    icon: "💊",
    label: "Medication",
    color: "#B75D32",
    description: "Medication schedule",
    legacy: true,
    newType: ROUTINE_TYPES.MEDICAL_CARE,
  },
  [ROUTINE_TYPES.GENERAL_CHECK]: {
    icon: "✅",
    label: "General Check",
    color: "#F4A460",
    description: "Daily health check",
    legacy: true,
    newType: ROUTINE_TYPES.WELLNESS_CHECK,
  },
  [ROUTINE_TYPES.WEIGHT_CHECK]: {
    icon: "⚖️",
    label: "Weight Check",
    color: "#B75D32",
    description: "Weight monitoring",
    legacy: true,
    newType: ROUTINE_TYPES.WELLNESS_CHECK,
  },
  [ROUTINE_TYPES.PREVENTIVE]: {
    icon: "🛡️",
    label: "Preventive Care",
    color: "#A7BFA3",
    description: "Flea, tick, heartworm prevention",
    legacy: true,
    newType: ROUTINE_TYPES.MEDICAL_CARE,
  },
  [ROUTINE_TYPES.VACCINE]: {
    icon: "💉",
    label: "Vaccine",
    color: "#FF6F61",
    description: "Vaccination schedule",
    legacy: true,
    newType: ROUTINE_TYPES.MEDICAL_CARE,
  },
};

/**
 * Get human-readable schedule summary
 */
export function getScheduleSummary(routine) {
  if (!routine.isActive) return "Inactive";

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
      const label = it.name || itemTypeLabels[it.type] || "Item";
      let detail = "";
      if (
        it.type === MEDICAL_CARE_SUBTYPES.MEDICATION ||
        it.type === MEDICAL_CARE_SUBTYPES.SUPPLEMENT
      ) {
        const times = (it.times || []).join(" · ");
        detail = times ? `daily at ${times}` : "daily";
      } else if (it.type === MEDICAL_CARE_SUBTYPES.VACCINE) {
        detail = it.nextDue ? `next due ${it.nextDue}` : "";
      } else if (it.repeatInterval) {
        const map = {
          monthly: "monthly",
          every_3_months: "every 3 months",
          every_6_months: "every 6 months",
          yearly: "yearly",
        };
        detail = map[it.repeatInterval] || it.repeatInterval;
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
    if (activeMeals.length === 0) return "No active meal reminders";

    // If all meals have the same frequency, show consolidated
    const frequencies = [...new Set(activeMeals.map((m) => m.frequency))];
    if (
      frequencies.length === 1 &&
      frequencies[0] === ROUTINE_FREQUENCY.DAILY
    ) {
      const times = activeMeals.map((m) => m.time);
      const timeStrings = times.map((time) => {
        const [hours, minutes] = time.split(":");
        const hour = parseInt(hours);
        const ampm = hour >= 12 ? "PM" : "AM";
        const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
        return `${displayHour}:${minutes} ${ampm}`;
      });
      return `Every day at ${timeStrings.join(" and ")}`;
    }

    // Otherwise show meal count with varied schedules
    return `${activeMeals.length} meal${
      activeMeals.length > 1 ? "s" : ""
    } with custom schedules`;
  }

  // Handle Walk routine with walk-specific schedules
  if (routine.type === ROUTINE_TYPES.WALK && routine.walks) {
    const activeWalks = routine.walks.filter(
      (w) => w.reminderEnabled !== false,
    );
    if (activeWalks.length === 0) return "No active walk reminders";

    // Check if all walks have same frequency
    const frequencies = [...new Set(activeWalks.map((w) => w.frequency))];
    const allDaily =
      frequencies.length === 1 && frequencies[0] === ROUTINE_FREQUENCY.DAILY;

    if (allDaily) {
      // All walks are daily - show times
      const timeStrings = activeWalks.map((w) => {
        const [hours, minutes] = w.time.split(":");
        const hour = parseInt(hours);
        const ampm = hour >= 12 ? "PM" : "AM";
        const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
        return `${displayHour}:${minutes} ${ampm}`;
      });
      return `Daily at ${timeStrings.join(" · ")}`;
    }

    // Different schedules - show individual walk summaries
    const summaries = activeWalks.map((w) => {
      const [hours, minutes] = w.time.split(":");
      const hour = parseInt(hours);
      const ampm = hour >= 12 ? "PM" : "AM";
      const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
      const timeStr = `${displayHour}:${minutes} ${ampm}`;

      let freqStr = "";
      switch (w.frequency) {
        case ROUTINE_FREQUENCY.DAILY:
          freqStr = "daily";
          break;
        case ROUTINE_FREQUENCY.WEEKDAYS:
          freqStr = "weekdays";
          break;
        case ROUTINE_FREQUENCY.WEEKENDS:
          freqStr = "weekends";
          break;
        case ROUTINE_FREQUENCY.CUSTOM:
          if (w.days && w.days.length > 0) {
            const dayAbbr = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
            const dayStrs = w.days.map((d) => dayAbbr[d]);
            freqStr = dayStrs.join("/");
          } else {
            freqStr = "custom";
          }
          break;
        default:
          freqStr = "custom";
      }

      return `${w.name} ${freqStr} at ${timeStr}`;
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

    if (activeSchedules.length === 0) return "No active photo check reminders";

    // Helper to format area label
    const getAreaLabel = (bodyArea) => {
      const areaLabels = {
        paws: "Paws",
        ears: "Ears",
        eyes: "Eyes",
        teeth: "Teeth",
        skin_fur: "Skin/Fur",
        face: "Face",
        full_body: "Full Body",
        other: "Other",
      };
      return areaLabels[bodyArea] || bodyArea;
    };

    // Helper to format frequency
    const getFreqLabel = (freq) => {
      switch (freq) {
        case ROUTINE_FREQUENCY.WEEKLY:
          return "weekly";
        case ROUTINE_FREQUENCY.BIWEEKLY:
          return "every 2 weeks";
        case ROUTINE_FREQUENCY.MONTHLY:
          return "monthly";
        default:
          return freq;
      }
    };

    // Helper to format time
    const formatTime = (time) => {
      const [hours, minutes] = time.split(":");
      const hour = parseInt(hours);
      const ampm = hour >= 12 ? "PM" : "AM";
      const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
      return `${displayHour}:${minutes} ${ampm}`;
    };

    // Helper to get day name
    const getDayName = (dayIndex) => {
      const dayNames = [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
        "Sunday",
      ];
      return dayNames[dayIndex] || "";
    };

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
      return `${areaList}\n${freqLabel} ${dayLabel} at ${timeLabel}`;
    } else {
      // Different schedules - show each area's schedule
      const summaries = activeSchedules.map((s) => {
        const areaLabel = getAreaLabel(s.bodyArea);
        const freqLabel = getFreqLabel(s.frequency);
        const dayLabel = getDayName(s.preferredDay);
        const timeLabel = formatTime(s.preferredTime);
        return `${areaLabel} ${freqLabel} ${dayLabel} ${timeLabel}`;
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

    if (activeItems.length === 0) return "No active wellness check reminders";

    // Helper to format item label
    const getItemLabel = (checkType, customName) => {
      if (checkType === WELLNESS_CHECK_ITEMS.CUSTOM && customName) {
        return customName;
      }
      const itemLabels = {
        general: "General",
        weight: "Weight",
        body_condition: "Body condition",
        mobility: "Mobility",
        mood_energy: "Mood/Energy",
        skin_coat: "Skin/Coat",
        appetite_hydration: "Appetite/Hydration",
      };
      return itemLabels[checkType] || checkType;
    };

    // Helper to format frequency
    const getFreqLabel = (freq) => {
      switch (freq) {
        case ROUTINE_FREQUENCY.DAILY:
          return "daily";
        case ROUTINE_FREQUENCY.WEEKLY:
          return "weekly";
        case ROUTINE_FREQUENCY.BIWEEKLY:
          return "every 2 weeks";
        case ROUTINE_FREQUENCY.MONTHLY:
          return "monthly";
        default:
          return freq;
      }
    };

    // Helper to format time
    const formatTime = (time) => {
      const [hours, minutes] = time.split(":");
      const hour = parseInt(hours);
      const ampm = hour >= 12 ? "PM" : "AM";
      const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
      return `${displayHour}:${minutes} ${ampm}`;
    };

    // Helper to get day name
    const getDayName = (dayIndex) => {
      const dayNames = [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
        "Sunday",
      ];
      return dayNames[dayIndex] || "";
    };

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
        ? `${itemList}\n${freqLabel} ${dayLabel} at ${timeLabel}`
        : `${itemList}\n${freqLabel} at ${timeLabel}`;
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
          ? `${itemLabel} ${freqLabel} ${dayLabel} ${timeLabel}`
          : `${itemLabel} ${freqLabel} ${timeLabel}`;
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
      return "No active vet appointment reminders";

    // Helper to format date
    const formatDate = (dateStr) => {
      if (!dateStr) return "Date TBD";
      try {
        const date = new Date(dateStr);
        return date.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        });
      } catch {
        return dateStr;
      }
    };

    // Helper to format time
    const formatTime = (time) => {
      if (!time) return "";
      const [hours, minutes] = time.split(":");
      const hour = parseInt(hours);
      const ampm = hour >= 12 ? "PM" : "AM";
      const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
      return `${displayHour}:${minutes} ${ampm}`;
    };

    // Build summary for each appointment
    const summaries = activeAppointments.map((appt) => {
      const title = appt.title || "Vet Appointment";
      const dateStr = formatDate(appt.date);
      const timeStr = formatTime(appt.time);
      return `${title} • ${dateStr} at ${timeStr}`;
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
      scheduleText = "Every day";
      break;
    case ROUTINE_FREQUENCY.WEEKDAYS:
      scheduleText = "Weekdays";
      break;
    case ROUTINE_FREQUENCY.WEEKENDS:
      scheduleText = "Weekends";
      break;
    case ROUTINE_FREQUENCY.WEEKLY:
      if (days.length === 1) {
        const dayNames = [
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday",
          "Sunday",
        ];
        scheduleText = `Every ${dayNames[days[0]]}`;
      } else {
        scheduleText = "Weekly";
      }
      break;
    case ROUTINE_FREQUENCY.BIWEEKLY:
      scheduleText = "Every 2 weeks";
      break;
    case ROUTINE_FREQUENCY.MONTHLY:
      scheduleText = "Monthly";
      break;
    case ROUTINE_FREQUENCY.CUSTOM:
      scheduleText = "Custom schedule";
      break;
    default:
      scheduleText = "Custom";
  }

  // Times
  if (times.length > 0) {
    const timeStrings = times.map((time) => {
      const [hours, minutes] = time.split(":");
      const hour = parseInt(hours);
      const ampm = hour >= 12 ? "PM" : "AM";
      const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
      return `${displayHour}:${minutes} ${ampm}`;
    });
    scheduleText += ` at ${timeStrings.join(" and ")}`;
  }

  // End date
  if (routine.endDate) {
    const endDate = new Date(routine.endDate);
    scheduleText += ` until ${endDate.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    })}`;
  }

  return scheduleText;
}

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

    if (!nextMeal || !nextOccurrence) return "Not scheduled";

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

    if (!nextWalk || !nextOccurrence) return "Not scheduled";

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

    const itemLabels = {
      general: "General check",
      weight: "Weight check",
      body_condition: "Body condition check",
      mobility: "Mobility check",
      mood_energy: "Mood / Energy check",
      skin_coat: "Skin / Coat check",
      appetite_hydration: "Appetite / Hydration check",
      custom: "Wellness check",
    };

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

    if (!nextItem || !nextOccurrence) return "Not scheduled";

    const label =
      nextItem.customName || itemLabels[nextItem.checkType] || "Wellness check";
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

    const areaLabels = {
      paws: "Paws photo",
      ears: "Ears photo",
      eyes: "Eyes photo",
      teeth: "Teeth photo",
      skin_fur: "Skin/Fur photo",
      face: "Face photo",
      full_body: "Full body photo",
      other: "Photo check",
    };

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

    if (!nextSchedule || !nextOccurrence) return "Not scheduled";

    const label = areaLabels[nextSchedule.bodyArea] || "Photo check";
    return formatReminderPreview(label, nextOccurrence, now);
  }

  const now = new Date();
  const times = routine.times || [];
  const frequency = routine.frequency;

  if (times.length === 0) return "Not scheduled";

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

  if (!nextOccurrence) return "Not scheduled";

  const config = ROUTINE_TYPE_CONFIG[routine.type];
  let label = config?.label || "Reminder";

  // Add body area for photo checks
  if (routine.bodyArea) {
    const areaLabels = {
      paws: "Paws photo",
      ears: "Ears photo",
      eyes: "Eyes photo",
      teeth: "Teeth photo",
      skin_fur: "Skin/Fur photo",
      face: "Face photo",
      full_body: "Full body photo",
    };
    label = areaLabels[routine.bodyArea];
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

  const timeStr = nextOccurrence.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  if (isToday) {
    const timeOfDay = getTimeOfDay(nextOccurrence);
    return `${label} ${timeOfDay} at ${timeStr}`;
  } else if (isTomorrow) {
    return `${label} tomorrow at ${timeStr}`;
  } else {
    const dayStr = nextOccurrence.toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
    return `${label} ${dayStr} at ${timeStr}`;
  }
}

function getTimeOfDay(date) {
  const hour = date.getHours();
  if (hour < 5) return "tonight";
  if (hour < 12) return "this morning";
  if (hour < 17) return "this afternoon";
  if (hour < 21) return "this evening";
  return "tonight";
}

/**
 * Mock routines data
 */
export const mockRoutines = [
  {
    id: "routine_feeding_1",
    petId: "phoebe",
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
    petId: "phoebe",
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
    petId: "phoebe",
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
    petId: "phoebe",
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
    petId: "phoebe",
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
    petId: "phoebe",
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
