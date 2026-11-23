import { ROUTINE_TYPES } from "@/data/routinesData";
import { REMINDER_STATUS, getReminderStatus } from "@/data/remindersData";
import { gt, actionLabel, photoAreaPhrase } from "@/utils/generatedCopy";

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

// E5 reframe: care reminders are WANTED, so they stay — but the copy is warm and
// forward-looking, never guilt/shame ("overdue", "you forgot"). "Due soon" keeps the helpful
// countdown; the past-due case becomes a gentle "whenever you're ready", celebrating the care.
//
// All wording goes through gt() at generation time, so it is in the language that is current when the
// notification row is created (stable ids/types/relatedTracker are never localized).
function getFeedingNotification(reminder) {
  const status = getReminderStatus(reminder);
  const mealName =
    reminder.title || gt("generatedUi.notif.feeding.defaultName", "Meal");

  let title = gt("generatedUi.notif.feeding.title", "Mealtime 🍽️");
  let message = gt("generatedUi.notif.feeding.message", "Time for {{name}}.", {
    name: mealName.toLowerCase(),
  });

  if (status === REMINDER_STATUS.DUE_SOON) {
    message = gt("generatedUi.notif.feeding.soon", "{{name}} starts in {{time}}.", {
      name: mealName,
      time: getTimeToGo(reminder),
    });
  } else if (status === REMINDER_STATUS.OVERDUE) {
    message = gt(
      "generatedUi.notif.feeding.late",
      "Whenever you're ready — {{name}} 🍽️",
      { name: mealName.toLowerCase() },
    );
  }

  return {
    title,
    message,
    actionLabel: actionLabel("logFood"),
  };
}

function getWalkNotification(reminder) {
  const status = getReminderStatus(reminder);
  const walkName =
    reminder.title || gt("generatedUi.notif.walk.defaultName", "Walk");

  let title = gt("generatedUi.notif.walk.title", "Walk time 🚶");
  let message = gt("generatedUi.notif.walk.message", "Time for a {{name}}.", {
    name: walkName.toLowerCase(),
  });

  if (status === REMINDER_STATUS.DUE_SOON) {
    message = gt("generatedUi.notif.walk.soon", "{{name}} starts in {{time}}.", {
      name: walkName,
      time: getTimeToGo(reminder),
    });
  } else if (status === REMINDER_STATUS.OVERDUE) {
    message = gt(
      "generatedUi.notif.walk.late",
      "Whenever you're ready — time for a {{name}} 🚶",
      { name: walkName.toLowerCase() },
    );
  }

  return {
    title,
    message,
    actionLabel: actionLabel("startWalk"),
  };
}

function getMedicationNotification(reminder) {
  const status = getReminderStatus(reminder);
  const medName =
    reminder.title || gt("generatedUi.notif.medication.defaultName", "medication");

  let title = gt("generatedUi.notif.medication.title", "Medication time 💊");
  let message = gt("generatedUi.notif.medication.message", "Time for {{name}}.", {
    name: medName,
  });

  if (status === REMINDER_STATUS.DUE_SOON) {
    message = gt(
      "generatedUi.notif.medication.soon",
      "{{name}} is coming up in {{time}}.",
      { name: medName, time: getTimeToGo(reminder) },
    );
  } else if (status === REMINDER_STATUS.OVERDUE) {
    message = gt(
      "generatedUi.notif.medication.late",
      "Whenever you're ready — {{name}} 💊",
      { name: medName },
    );
  }

  return {
    title,
    message,
    actionLabel: actionLabel("markGiven"),
  };
}

function getPhotoCheckNotification(reminder) {
  const bodyArea = reminder.relatedBodyArea || "body";
  const known = [
    "paws",
    "ears",
    "eyes",
    "teeth",
    "skin_fur",
    "face",
    "full_body",
    "other",
  ];
  const bodyAreaLabel =
    bodyArea.charAt(0).toUpperCase() + bodyArea.slice(1).replace("_", "/");

  return {
    title: known.includes(bodyArea)
      ? gt(`generatedUi.notif.photoCheck.title.${bodyArea}`, `${bodyAreaLabel} photo due 📸`)
      : gt("generatedUi.notif.photoCheck.title.generic", "{{area}} photo due 📸", {
          area: bodyAreaLabel,
        }),
    message: gt(
      "generatedUi.notif.photoCheck.message",
      "Upload your pet's weekly {{area}} photo to compare visible changes over time.",
      {
        area: known.includes(bodyArea)
          ? photoAreaPhrase(bodyArea)
          : bodyArea.replace("_", "/"),
      },
    ),
    actionLabel: actionLabel("takePhoto"),
  };
}

function getGeneralCheckNotification(reminder) {
  return {
    title: gt("generatedUi.notif.generalCheck.title", "General check due ✅"),
    message: gt(
      "generatedUi.notif.generalCheck.message",
      "Time for your pet's weekly general health check.",
    ),
    actionLabel: actionLabel("startCheck"),
  };
}

function getWeightCheckNotification(reminder) {
  return {
    title: gt("generatedUi.notif.weightCheck.title", "Weight check due ⚖️"),
    message: gt(
      "generatedUi.notif.weightCheck.message",
      "Time to log your pet's weight for this week.",
    ),
    actionLabel: actionLabel("logWeight"),
  };
}

function getPreventiveNotification(reminder) {
  const treatment =
    reminder.title ||
    gt("generatedUi.notif.preventive.defaultName", "preventive care");

  return {
    title: gt("generatedUi.notif.preventive.title", "Preventive care due 🛡️"),
    message: gt(
      "generatedUi.notif.preventive.message",
      "Time for your pet's {{name}}.",
      { name: treatment },
    ),
    actionLabel: actionLabel("markGiven"),
  };
}

function getVaccineNotification(reminder) {
  const vaccine =
    reminder.title || gt("generatedUi.notif.vaccine.defaultName", "vaccine");

  return {
    title: gt("generatedUi.notif.vaccine.title", "Vaccine due 💉"),
    message: gt(
      "generatedUi.notif.vaccine.message",
      "Your pet's {{name}} is due.",
      { name: vaccine },
    ),
    actionLabel: actionLabel("viewVaccineRecord"),
  };
}

function getVetAppointmentNotification(reminder) {
  const appointment =
    reminder.title ||
    gt("generatedUi.notif.vetAppointment.defaultName", "vet appointment");
  const status = getReminderStatus(reminder);

  let message = gt(
    "generatedUi.notif.vetAppointment.message",
    "Your pet has a {{name}} today.",
    { name: appointment },
  );

  if (status === REMINDER_STATUS.DUE_SOON) {
    message = gt(
      "generatedUi.notif.vetAppointment.soon",
      "Your pet's {{name}} is in {{time}}.",
      { name: appointment, time: getTimeToGo(reminder) },
    );
  }

  return {
    title: gt("generatedUi.notif.vetAppointment.title", "Vet appointment 🩺"),
    message,
    actionLabel: actionLabel("prepareVetSummary"),
  };
}

function getDefaultNotification(reminder) {
  return {
    title: reminder.title || gt("generatedUi.notif.default.title", "Reminder"),
    message:
      reminder.description ||
      gt("generatedUi.notif.default.message", "You have a reminder."),
    actionLabel: actionLabel("done"),
  };
}

/**
 * Get human-readable time to go
 */
function getTimeToGo(reminder) {
  const now = new Date();
  const triggerTime = new Date(reminder.scheduledAt || reminder.nextTriggerAt);
  const diffMinutes = Math.round((triggerTime - now) / (1000 * 60));

  if (diffMinutes < 1)
    return gt("generatedUi.timeToGo.lessThanMinute", "less than a minute");
  if (diffMinutes < 60) {
    return gt(
      "generatedUi.timeToGo.minutes",
      diffMinutes === 1 ? "1 minute" : `${diffMinutes} minutes`,
      { count: diffMinutes },
    );
  }

  const hours = Math.floor(diffMinutes / 60);
  const mins = diffMinutes % 60;

  if (mins === 0) {
    return gt(
      "generatedUi.timeToGo.hours",
      hours === 1 ? "1 hour" : `${hours} hours`,
      { count: hours },
    );
  }
  return gt(
    "generatedUi.timeToGo.hoursMinutes",
    hours === 1 ? `1 hour ${mins} min` : `${hours} hours ${mins} min`,
    { count: hours, mins },
  );
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

  // Don't create a duplicate — NOT even after the owner has READ the row (flow audit F1-09): the
  // 60 s sync used to see "no unread row" for a read one and insert a fresh unread row for the same
  // reminder every minute, so the badge came back and "Mark all read" never stuck.
  const existingNotif = existingNotifications.find(
    (n) => n.reminderId === reminder.id,
  );
  if (existingNotif) {
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
