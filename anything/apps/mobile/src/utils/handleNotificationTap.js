import { router } from "expo-router";
import { COLORS } from "@/constants/theme";
import { reminderTapRoute } from "./notificationDeepLink";

/**
 * Handle an in-app reminder notification tap — opens the Health section where that
 * reminder lives (Today, or Vet Record for vaccines / vet appointments). One push,
 * never two (AUDIT_2026-09 A-08).
 */
export function handleNotificationTap(notification) {
  if (!notification) return;
  router.push(reminderTapRoute(notification));
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
      color: COLORS.sage,
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
      color: COLORS.coral,
      trackerLabel: "Vet Appointment",
    },
  };

  return (
    configs[notification.type] || {
      icon: "📌",
      color: COLORS.sage,
      trackerLabel: "Health",
    }
  );
}
