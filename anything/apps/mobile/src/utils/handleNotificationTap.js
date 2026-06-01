import { router } from "expo-router";
import { ROUTINE_TYPES } from "@/data/routinesData";

/**
 * Handle notification tap - opens the correct tracker
 */
export function handleNotificationTap(notification) {
  if (!notification) return;

  const { type, relatedTracker, relatedBodyArea, routineId, reminderId } =
    notification;

  // Navigate to health tab first
  router.push("/(tabs)/health");

  // Then open the specific tracker based on type
  switch (type) {
    case "feeding":
    case ROUTINE_TYPES.FEEDING:
      // Food & Water tracker is part of Health Track tab
      // The tracker modal can be opened via the health screen
      break;

    case "walk":
    case ROUTINE_TYPES.WALK:
      // Walk tracker is part of Health Track tab
      break;

    case "medication":
    case ROUTINE_TYPES.MEDICATION:
      // Medication tracker is part of Health Track tab
      break;

    case "photo_check":
    case ROUTINE_TYPES.PHOTO_CHECK:
      // Photo check tracker with specific body area
      // Opens photo check modal with the body area preset
      break;

    case "general_check":
    case ROUTINE_TYPES.GENERAL_CHECK:
      // General check tracker
      break;

    case "weight_check":
    case ROUTINE_TYPES.WEIGHT_CHECK:
      // Weight tracker
      break;

    case "preventive":
    case ROUTINE_TYPES.PREVENTIVE:
      // Preventive care tracker
      break;

    case "vaccine":
    case ROUTINE_TYPES.VACCINE:
      // Opens vet record / vaccine section
      break;

    case "vet_appointment":
    case ROUTINE_TYPES.VET_APPOINTMENT:
      // Opens vet record / appointment detail
      break;

    default:
      // Default: just go to health tab
      router.push("/(tabs)/health");
  }
}

/**
 * Get display info for notification
 */
export function getNotificationDisplayInfo(notification) {
  const configs = {
    feeding: {
      icon: "🍽️",
      color: "#FFB74D",
      trackerLabel: "Food Tracker",
    },
    walk: {
      icon: "🚶",
      color: "#81C784",
      trackerLabel: "Walk Tracker",
    },
    medication: {
      icon: "💊",
      color: "#9575CD",
      trackerLabel: "Medication Tracker",
    },
    photo_check: {
      icon: "📸",
      color: "#64B5F6",
      trackerLabel: "Photo Check",
    },
    general_check: {
      icon: "✅",
      color: "#A7BFA3",
      trackerLabel: "General Check",
    },
    weight_check: {
      icon: "⚖️",
      color: "#FFD54F",
      trackerLabel: "Weight Tracker",
    },
    preventive: {
      icon: "🛡️",
      color: "#4DB6AC",
      trackerLabel: "Preventive Care",
    },
    vaccine: {
      icon: "💉",
      color: "#4DD0E1",
      trackerLabel: "Vaccine Record",
    },
    vet_appointment: {
      icon: "🩺",
      color: "#FF6F61",
      trackerLabel: "Vet Appointment",
    },
  };

  return (
    configs[notification.type] || {
      icon: "📌",
      color: "#A7BFA3",
      trackerLabel: "Health",
    }
  );
}
