import { useReminderReconcile } from "@/hooks/useReminderReconcile";

// Renders nothing: it only keeps the local reminder alarms current (see hooks/useReminderReconcile).
export function ReminderReconciler() {
  useReminderReconcile();
  return null;
}

export default ReminderReconciler;
