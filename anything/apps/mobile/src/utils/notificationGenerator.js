import { ROUTINE_TYPES } from "@/data/routinesData";
import { REMINDER_STATUS, getReminderStatus } from "@/data/remindersData";

/**
 * Generate notification from reminder
 * Creates notification when reminder is due soon, due now, or overdue
 */
export function generateNotificationFromReminder(reminder) {
  const status = getReminderStatus(reminder);

  // Only create notifications for active reminders that are due/approaching
  if (
    reminder.status === REMINDER_STATUS.COMPLETED ||
    reminder.status === REMINDER_STATUS.DISABLED ||
    status === REMINDER_STATUS.UPCOMING ||
    status === REMINDER_STATUS.SNOOZED
  ) {
    return null;
  }

  const config = getNotificationConfig(reminder);

  return {
    id: `notif_${reminder.id}`,
    reminderId: reminder.id,
    routineId: reminder.routineId,
    petId: reminder.petId,
    type: reminder.type,
    title: config.title,
    message: config.message,
    timestamp: new Date().toISOString(),
    read: false,
    priority: reminder.priority,
    timeSensitive: reminder.timeSensitive,
    actionLabel: config.actionLabel,
    relatedTracker: reminder.relatedTracker,
    relatedBodyArea: reminder.relatedBodyArea,
    relatedEntityId: reminder.routineId,
  };
}

/**
 * Get notification configuration based on reminder type
 */
function getNotificationConfig(reminder) {
  const configs = {
    [ROUTINE_TYPES.FEEDING]: getFeedingNotification,
    [ROUTINE_TYPES.WALK]: getWalkNotification,
    [ROUTINE_TYPES.MEDICATION]: getMedicationNotification,
    [ROUTINE_TYPES.PHOTO_CHECK]: getPhotoCheckNotification,
    [ROUTINE_TYPES.GENERAL_CHECK]: getGeneralCheckNotification,
    [ROUTINE_TYPES.WEIGHT_CHECK]: getWeightCheckNotification,
    [ROUTINE_TYPES.PREVENTIVE]: getPreventiveNotification,
    [ROUTINE_TYPES.VACCINE]: getVaccineNotification,
    [ROUTINE_TYPES.VET_APPOINTMENT]: getVetAppointmentNotification,
  };

  const configFn = configs[reminder.type];
  return configFn ? configFn(reminder) : getDefaultNotification(reminder);
}

function getFeedingNotification(reminder) {
  const status = getReminderStatus(reminder);
  const mealName = reminder.title || "Meal";

  let title = "Feeding o'clock 🍽️";
  let message = `Time to feed your pet ${mealName.toLowerCase()}.`;

  if (status === REMINDER_STATUS.DUE_SOON) {
    const timeToGo = getTimeToGo(reminder);
    message = `Your pet's ${mealName.toLowerCase()} starts in ${timeToGo}.`;
  } else if (status === REMINDER_STATUS.OVERDUE) {
    message = `Your pet's ${mealName.toLowerCase()} is overdue.`;
  }

  return {
    title,
    message,
    actionLabel: "Log food",
  };
}

function getWalkNotification(reminder) {
  const status = getReminderStatus(reminder);
  const walkName = reminder.title || "Walk";

  let title = "Walk time 🚶";
  let message = `Time for your pet's ${walkName.toLowerCase()}.`;

  if (status === REMINDER_STATUS.DUE_SOON) {
    const timeToGo = getTimeToGo(reminder);
    message = `Your pet's ${walkName.toLowerCase()} starts in ${timeToGo}.`;
  } else if (status === REMINDER_STATUS.OVERDUE) {
    message = `Your pet's ${walkName.toLowerCase()} is overdue.`;
  }

  return {
    title,
    message,
    actionLabel: "Start walk",
  };
}

function getMedicationNotification(reminder) {
  const status = getReminderStatus(reminder);
  const medName = reminder.title || "medication";

  let title = "Medication due 💊";
  let message = `Your pet's ${medName} is due now.`;

  if (status === REMINDER_STATUS.DUE_SOON) {
    const timeToGo = getTimeToGo(reminder);
    message = `Your pet's ${medName} is due in ${timeToGo}.`;
  } else if (status === REMINDER_STATUS.OVERDUE) {
    message = `Your pet's ${medName} is overdue.`;
  }

  return {
    title,
    message,
    actionLabel: "Mark as given",
  };
}

function getPhotoCheckNotification(reminder) {
  const bodyArea = reminder.relatedBodyArea || "body";
  const bodyAreaLabel =
    bodyArea.charAt(0).toUpperCase() + bodyArea.slice(1).replace("_", "/");

  return {
    title: `${bodyAreaLabel} photo due 📸`,
    message: `Upload your pet's weekly ${bodyArea.replace("_", "/")} photo to compare visible changes over time.`,
    actionLabel: "Take photo",
  };
}

function getGeneralCheckNotification(reminder) {
  return {
    title: "General check due ✅",
    message: "Time for your pet's weekly general health check.",
    actionLabel: "Start check",
  };
}

function getWeightCheckNotification(reminder) {
  return {
    title: "Weight check due ⚖️",
    message: "Time to log your pet's weight for this week.",
    actionLabel: "Log weight",
  };
}

function getPreventiveNotification(reminder) {
  const treatment = reminder.title || "preventive care";

  return {
    title: "Preventive care due 🛡️",
    message: `Time for your pet's ${treatment}.`,
    actionLabel: "Mark as given",
  };
}

function getVaccineNotification(reminder) {
  const vaccine = reminder.title || "vaccine";

  return {
    title: "Vaccine due 💉",
    message: `Your pet's ${vaccine} is due.`,
    actionLabel: "View vaccine record",
  };
}

function getVetAppointmentNotification(reminder) {
  const appointment = reminder.title || "vet appointment";
  const status = getReminderStatus(reminder);

  let message = `Your pet has a ${appointment} today.`;

  if (status === REMINDER_STATUS.DUE_SOON) {
    const timeToGo = getTimeToGo(reminder);
    message = `Your pet's ${appointment} is in ${timeToGo}.`;
  }

  return {
    title: "Vet appointment 🩺",
    message,
    actionLabel: "Prepare vet summary",
  };
}

function getDefaultNotification(reminder) {
  return {
    title: reminder.title || "Reminder",
    message: reminder.description || "You have a reminder.",
    actionLabel: "Done",
  };
}

/**
 * Get human-readable time to go
 */
function getTimeToGo(reminder) {
  const now = new Date();
  const triggerTime = new Date(reminder.scheduledAt || reminder.nextTriggerAt);
  const diffMinutes = Math.round((triggerTime - now) / (1000 * 60));

  if (diffMinutes < 1) return "less than a minute";
  if (diffMinutes === 1) return "1 minute";
  if (diffMinutes < 60) return `${diffMinutes} minutes`;

  const hours = Math.floor(diffMinutes / 60);
  const mins = diffMinutes % 60;

  if (hours === 1 && mins === 0) return "1 hour";
  if (hours === 1) return `1 hour ${mins} min`;
  if (mins === 0) return `${hours} hours`;
  return `${hours} hours ${mins} min`;
}

/**
 * Check if notification should be created for reminder
 */
export function shouldCreateNotification(reminder, existingNotifications) {
  const status = getReminderStatus(reminder);

  // Don't create for completed, disabled, or upcoming reminders
  if (
    reminder.status === REMINDER_STATUS.COMPLETED ||
    reminder.status === REMINDER_STATUS.DISABLED ||
    status === REMINDER_STATUS.UPCOMING ||
    status === REMINDER_STATUS.SNOOZED
  ) {
    return false;
  }

  // Don't create duplicate
  const existingNotif = existingNotifications.find(
    (n) => n.reminderId === reminder.id,
  );
  if (existingNotif && !existingNotif.read) {
    return false;
  }

  return true;
}

/**
 * Get tracker route for notification type
 */
export function getTrackerRouteForNotification(notification) {
  const routes = {
    feeding: "/(tabs)/health",
    walk: "/(tabs)/health",
    medication: "/(tabs)/health",
    photo_check: "/(tabs)/health",
    general_check: "/(tabs)/health",
    weight_check: "/(tabs)/health",
    preventive: "/(tabs)/health",
    vaccine: "/(tabs)/health",
    vet_appointment: "/(tabs)/health",
  };

  return routes[notification.type] || "/(tabs)/health";
}
