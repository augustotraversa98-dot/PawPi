// ─────────────────────────────────────────────
// REMINDERS DATA MODEL & MOCK DATA
// ─────────────────────────────────────────────

// Reminder Status
export const REMINDER_STATUS = {
  UPCOMING: "upcoming",
  DUE_SOON: "due_soon",
  DUE_NOW: "due_now",
  OVERDUE: "overdue",
  COMPLETED: "completed",
  SNOOZED: "snoozed",
  DISABLED: "disabled",
};

// Reminder Types
export const REMINDER_TYPES = {
  FEEDING: "feeding",
  WATER: "water",
  WALK: "walk",
  MEDICATION: "medication",
  PREVENTIVE: "preventive",
  VACCINE: "vaccine",
  VET_APPOINTMENT: "vet_appointment",
  GENERAL_CHECK: "general_check",
  WEIGHT_CHECK: "weight_check",
  PHOTO_CHECK: "photo_check",
  WELLNESS_CHECK: "wellness_check",
  MEDICAL_CARE: "medical_care",
};

// Repeat Rules
export const REPEAT_RULES = {
  ONCE: "once",
  DAILY: "daily",
  WEEKLY: "weekly",
  BIWEEKLY: "biweekly",
  MONTHLY: "monthly",
  CUSTOM: "custom",
};

// Priority Levels
export const PRIORITY_LEVELS = {
  NORMAL: "normal",
  IMPORTANT: "important",
  TIME_SENSITIVE: "time_sensitive",
};

// Photo Check Body Areas
export const PHOTO_CHECK_AREAS = {
  PAWS: "paws",
  EARS: "ears",
  EYES: "eyes",
  TEETH: "teeth",
  SKIN_FUR: "skin_fur",
  FACE: "face",
  FULL_BODY: "full_body",
};

// Default frequencies for photo checks
export const DEFAULT_PHOTO_FREQUENCIES = {
  [PHOTO_CHECK_AREAS.PAWS]: REPEAT_RULES.WEEKLY,
  [PHOTO_CHECK_AREAS.EYES]: REPEAT_RULES.WEEKLY,
  [PHOTO_CHECK_AREAS.EARS]: REPEAT_RULES.BIWEEKLY,
  [PHOTO_CHECK_AREAS.TEETH]: REPEAT_RULES.MONTHLY,
  [PHOTO_CHECK_AREAS.SKIN_FUR]: REPEAT_RULES.MONTHLY,
  [PHOTO_CHECK_AREAS.FACE]: REPEAT_RULES.MONTHLY,
  [PHOTO_CHECK_AREAS.FULL_BODY]: REPEAT_RULES.MONTHLY,
};

// Helper to calculate reminder status
export function getReminderStatus(reminder) {
  if (reminder.status === REMINDER_STATUS.DISABLED)
    return REMINDER_STATUS.DISABLED;
  if (reminder.status === REMINDER_STATUS.COMPLETED)
    return REMINDER_STATUS.COMPLETED;
  if (reminder.snoozedUntil && new Date(reminder.snoozedUntil) > new Date()) {
    return REMINDER_STATUS.SNOOZED;
  }

  const now = new Date();
  const triggerTime = new Date(reminder.nextTriggerAt);
  const diffMinutes = (triggerTime - now) / (1000 * 60);

  if (diffMinutes < -15) return REMINDER_STATUS.OVERDUE;
  if (diffMinutes <= 0) return REMINDER_STATUS.DUE_NOW;
  if (diffMinutes <= 60) return REMINDER_STATUS.DUE_SOON;
  return REMINDER_STATUS.UPCOMING;
}

// Helper to get time display
export function getTimeDisplay(reminder) {
  const now = new Date();
  const triggerTime = new Date(reminder.nextTriggerAt);
  const diffMinutes = Math.round((triggerTime - now) / (1000 * 60));

  if (diffMinutes < -15) {
    return `${Math.abs(diffMinutes)} min overdue`;
  }
  if (diffMinutes <= 0) {
    return "now";
  }
  if (diffMinutes < 60) {
    return `in ${diffMinutes} min`;
  }
  if (diffMinutes < 1440) {
    const hours = Math.floor(diffMinutes / 60);
    return `in ${hours} ${hours === 1 ? "hour" : "hours"}`;
  }
  return triggerTime.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

// Helper to group reminders by time
export function groupRemindersByTime(reminders) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const groups = {
    now: [],
    today: [],
    tomorrow: [],
    thisWeek: [],
    later: [],
  };

  reminders.forEach((reminder) => {
    const status = getReminderStatus(reminder);
    const triggerTime = new Date(reminder.nextTriggerAt);

    // Skip completed and disabled
    if (
      status === REMINDER_STATUS.COMPLETED ||
      status === REMINDER_STATUS.DISABLED
    ) {
      return;
    }

    if (
      status === REMINDER_STATUS.OVERDUE ||
      status === REMINDER_STATUS.DUE_NOW
    ) {
      groups.now.push(reminder);
    } else if (triggerTime < tomorrow) {
      groups.today.push(reminder);
    } else if (
      triggerTime < new Date(tomorrow.getTime() + 24 * 60 * 60 * 1000)
    ) {
      groups.tomorrow.push(reminder);
    } else if (triggerTime < weekEnd) {
      groups.thisWeek.push(reminder);
    } else {
      groups.later.push(reminder);
    }
  });

  return groups;
}

// Mock Reminders Data
const now = new Date();

export const mockReminders = [
  // Today - Dinner (time-sensitive, due soon)
  {
    id: "rem1",
    petId: "phoebe",
    type: REMINDER_TYPES.FEEDING,
    title: "Dinner time",
    description: "Phoebe's dinner is due at 7:00 PM",
    date: now.toISOString().split("T")[0],
    time: "19:00",
    nextTriggerAt: new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      19,
      0,
    ).toISOString(),
    repeatRule: REPEAT_RULES.DAILY,
    status: REMINDER_STATUS.UPCOMING,
    priority: PRIORITY_LEVELS.TIME_SENSITIVE,
    timeSensitive: true,
    notificationEnabled: true,
    scheduledNotificationId: "notif_rem1",
    relatedTracker: "food_water",
    relatedBodyArea: null,
    notes: "Regular feeding schedule",
    createdAt: new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: now.toISOString(),
    completedAt: null,
    snoozedUntil: null,
  },

  // Today - Evening walk (time-sensitive, due soon)
  {
    id: "rem2",
    petId: "phoebe",
    type: REMINDER_TYPES.WALK,
    title: "Evening walk",
    description: "Walk reminder at 6:30 PM",
    date: now.toISOString().split("T")[0],
    time: "18:30",
    nextTriggerAt: new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      18,
      30,
    ).toISOString(),
    repeatRule: REPEAT_RULES.DAILY,
    status: REMINDER_STATUS.UPCOMING,
    priority: PRIORITY_LEVELS.TIME_SENSITIVE,
    timeSensitive: true,
    notificationEnabled: true,
    scheduledNotificationId: "notif_rem2",
    relatedTracker: "walk_activity",
    relatedBodyArea: null,
    notes: "Daily evening exercise",
    createdAt: new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: now.toISOString(),
    completedAt: null,
    snoozedUntil: null,
  },

  // Today - Medication (time-sensitive, due soon)
  {
    id: "rem3",
    petId: "phoebe",
    type: REMINDER_TYPES.MEDICATION,
    title: "Medication",
    description: "Give Phoebe her medication",
    date: now.toISOString().split("T")[0],
    time: "20:00",
    nextTriggerAt: new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      20,
      0,
    ).toISOString(),
    repeatRule: REPEAT_RULES.DAILY,
    status: REMINDER_STATUS.UPCOMING,
    priority: PRIORITY_LEVELS.TIME_SENSITIVE,
    timeSensitive: true,
    notificationEnabled: true,
    scheduledNotificationId: "notif_rem3",
    relatedTracker: "medication",
    relatedBodyArea: null,
    notes: "Arthritis medication with food",
    createdAt: new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: now.toISOString(),
    completedAt: null,
    snoozedUntil: null,
  },

  // Today - Paws photo check (important)
  {
    id: "rem4",
    petId: "phoebe",
    type: REMINDER_TYPES.PHOTO_CHECK,
    title: "Weekly paws photo",
    description:
      "Upload Phoebe's paws photo to compare visible changes over time",
    date: now.toISOString().split("T")[0],
    time: null,
    nextTriggerAt: new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
    ).toISOString(),
    repeatRule: REPEAT_RULES.WEEKLY,
    status: REMINDER_STATUS.UPCOMING,
    priority: PRIORITY_LEVELS.IMPORTANT,
    timeSensitive: false,
    notificationEnabled: true,
    scheduledNotificationId: "notif_rem4",
    relatedTracker: "photo_check",
    relatedBodyArea: PHOTO_CHECK_AREAS.PAWS,
    notes: "Track paw pad health",
    createdAt: new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: now.toISOString(),
    completedAt: null,
    snoozedUntil: null,
  },

  // Tomorrow - Flea prevention
  {
    id: "rem5",
    petId: "phoebe",
    type: REMINDER_TYPES.PREVENTIVE,
    title: "Flea prevention",
    description: "Apply monthly flea and tick treatment",
    date: new Date(now.getTime() + 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0],
    time: "10:00",
    nextTriggerAt: new Date(
      now.getTime() + 24 * 60 * 60 * 1000 + 10 * 60 * 60 * 1000,
    ).toISOString(),
    repeatRule: REPEAT_RULES.MONTHLY,
    status: REMINDER_STATUS.UPCOMING,
    priority: PRIORITY_LEVELS.IMPORTANT,
    timeSensitive: false,
    notificationEnabled: true,
    scheduledNotificationId: "notif_rem5",
    relatedTracker: "medication",
    relatedBodyArea: null,
    notes: "Monthly preventive care",
    createdAt: new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: now.toISOString(),
    completedAt: null,
    snoozedUntil: null,
  },

  // This week - General check (Sunday)
  {
    id: "rem6",
    petId: "phoebe",
    type: REMINDER_TYPES.GENERAL_CHECK,
    title: "General check",
    description: "Weekly health check for Phoebe",
    date: new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0],
    time: null,
    nextTriggerAt: new Date(
      now.getTime() + 4 * 24 * 60 * 60 * 1000 + 20 * 60 * 60 * 1000,
    ).toISOString(),
    repeatRule: REPEAT_RULES.WEEKLY,
    status: REMINDER_STATUS.UPCOMING,
    priority: PRIORITY_LEVELS.NORMAL,
    timeSensitive: false,
    notificationEnabled: true,
    scheduledNotificationId: "notif_rem6",
    relatedTracker: "general_check",
    relatedBodyArea: null,
    notes: "Check ears, eyes, coat, energy",
    createdAt: new Date(now - 60 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: now.toISOString(),
    completedAt: null,
    snoozedUntil: null,
  },

  // This week - Weight check (Saturday)
  {
    id: "rem7",
    petId: "phoebe",
    type: REMINDER_TYPES.WEIGHT_CHECK,
    title: "Weight check",
    description: "Weekly weight tracking",
    date: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0],
    time: "09:00",
    nextTriggerAt: new Date(
      now.getTime() + 3 * 24 * 60 * 60 * 1000 + 9 * 60 * 60 * 1000,
    ).toISOString(),
    repeatRule: REPEAT_RULES.WEEKLY,
    status: REMINDER_STATUS.UPCOMING,
    priority: PRIORITY_LEVELS.NORMAL,
    timeSensitive: false,
    notificationEnabled: true,
    scheduledNotificationId: "notif_rem7",
    relatedTracker: "weight",
    relatedBodyArea: null,
    notes: "Monitor weight trends",
    createdAt: new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: now.toISOString(),
    completedAt: null,
    snoozedUntil: null,
  },

  // Later - Vet appointment
  {
    id: "rem8",
    petId: "phoebe",
    type: REMINDER_TYPES.VET_APPOINTMENT,
    title: "Annual vet checkup",
    description: "Dr. Smith at Happy Paws Veterinary",
    date: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0],
    time: "14:30",
    nextTriggerAt: new Date(
      now.getTime() + 14 * 24 * 60 * 60 * 1000 + 14.5 * 60 * 60 * 1000,
    ).toISOString(),
    repeatRule: REPEAT_RULES.ONCE,
    status: REMINDER_STATUS.UPCOMING,
    priority: PRIORITY_LEVELS.IMPORTANT,
    timeSensitive: false,
    notificationEnabled: true,
    scheduledNotificationId: "notif_rem8",
    relatedTracker: "vet_record",
    relatedBodyArea: null,
    notes: "Bring vaccine records",
    createdAt: new Date(now - 20 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: now.toISOString(),
    completedAt: null,
    snoozedUntil: null,
  },

  // Later - Eyes photo check
  {
    id: "rem9",
    petId: "phoebe",
    type: REMINDER_TYPES.PHOTO_CHECK,
    title: "Eyes photo check",
    description: "Upload Phoebe's eyes photo",
    date: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0],
    time: null,
    nextTriggerAt: new Date(
      now.getTime() + 5 * 24 * 60 * 60 * 1000 + 20 * 60 * 60 * 1000,
    ).toISOString(),
    repeatRule: REPEAT_RULES.WEEKLY,
    status: REMINDER_STATUS.UPCOMING,
    priority: PRIORITY_LEVELS.NORMAL,
    timeSensitive: false,
    notificationEnabled: true,
    scheduledNotificationId: "notif_rem9",
    relatedTracker: "photo_check",
    relatedBodyArea: PHOTO_CHECK_AREAS.EYES,
    notes: "Watch for discharge or redness",
    createdAt: new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: now.toISOString(),
    completedAt: null,
    snoozedUntil: null,
  },
];

// Snooze options
export const SNOOZE_OPTIONS = [
  { label: "10 minutes", value: 10, unit: "minutes" },
  { label: "30 minutes", value: 30, unit: "minutes" },
  { label: "1 hour", value: 60, unit: "minutes" },
  { label: "Tonight", value: "tonight", unit: "special" },
  { label: "Tomorrow", value: "tomorrow", unit: "special" },
];

// Reminder type labels and icons
export const REMINDER_TYPE_CONFIG = {
  [REMINDER_TYPES.FEEDING]: {
    label: "Feeding",
    icon: "🍽️",
    color: "#FFB74D",
    actionLabel: "Log food",
  },
  [REMINDER_TYPES.WATER]: {
    label: "Water",
    icon: "💧",
    color: "#64B5F6",
    actionLabel: "Log water",
  },
  [REMINDER_TYPES.WALK]: {
    label: "Walk",
    icon: "🚶",
    color: "#81C784",
    actionLabel: "Start walk",
  },
  [REMINDER_TYPES.MEDICATION]: {
    label: "Medication",
    icon: "💊",
    color: "#9575CD",
    actionLabel: "Mark as given",
  },
  [REMINDER_TYPES.PREVENTIVE]: {
    label: "Preventive Care",
    icon: "🛡️",
    color: "#4DB6AC",
    actionLabel: "Mark as done",
  },
  [REMINDER_TYPES.VACCINE]: {
    label: "Vaccine",
    icon: "💉",
    color: "#4DD0E1",
    actionLabel: "Mark as done",
  },
  [REMINDER_TYPES.VET_APPOINTMENT]: {
    label: "Vet Appointment",
    icon: "🩺",
    color: "#FF6F61",
    actionLabel: "View details",
  },
  [REMINDER_TYPES.GENERAL_CHECK]: {
    label: "General Check",
    icon: "✅",
    color: "#A7BFA3",
    actionLabel: "Start check",
  },
  [REMINDER_TYPES.WEIGHT_CHECK]: {
    label: "Weight Check",
    icon: "⚖️",
    color: "#FFD54F",
    actionLabel: "Log weight",
  },
  [REMINDER_TYPES.PHOTO_CHECK]: {
    label: "Photo Check",
    icon: "📸",
    color: "#64B5F6",
    actionLabel: "Take photo",
  },
};
