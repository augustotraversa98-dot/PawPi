/**
 * Hook to auto-complete reminders when tracker actions happen
 * Use this in tracker components to automatically mark reminders as done
 */

import { useEffect } from "react";
import useRemindersStore from "@/store/remindersStore";

/**
 * Auto-complete reminder when a tracker action happens
 * @param {string} trackerType - The tracker type (e.g., 'food_water', 'medication', 'walk_activity')
 * @param {string|null} bodyArea - Optional body area for photo checks (e.g., 'paws', 'eyes')
 * @param {any} triggerValue - A value that changes when the action happens (e.g., entry count, submission timestamp)
 */
export function useReminderAutoComplete(
  trackerType,
  bodyArea = null,
  triggerValue = null,
) {
  const completeReminderByTracker = useRemindersStore(
    (state) => state.completeReminderByTracker,
  );

  useEffect(() => {
    if (triggerValue) {
      completeReminderByTracker(trackerType, bodyArea);
    }
  }, [triggerValue, trackerType, bodyArea, completeReminderByTracker]);
}

export default useReminderAutoComplete;
