import { toCanonicalDate } from "./canonicalDateTime";
import { syncTelehealthReminderNotifications } from "./telehealthReminders";

// Fetches the owner's upcoming bookings the same way useMyBookings does (GET
// /api/me/bookings — ticket 2.14), passing the device's own local calendar date so the
// upcoming/past boundary is never miscomputed against the DB session's UTC now().
// A 401 (logged out) is expected/benign — treated as "nothing to sync", not an error.
async function fetchUpcomingBookings() {
  const today = toCanonicalDate(new Date());
  const response = await fetch(`/api/me/bookings?today=${encodeURIComponent(today)}`);
  if (response.status === 401) return [];
  if (!response.ok) {
    throw new Error("Failed to fetch bookings");
  }
  const data = await response.json();
  return data.upcoming ?? [];
}

export async function syncTelehealthBookingReminders() {
  try {
    const bookings = await fetchUpcomingBookings();
    await syncTelehealthReminderNotifications(bookings);
  } catch (error) {
    console.error("Error syncing telehealth reminders:", error);
  }
}

/**
 * Reconciles the owner's upcoming telehealth bookings into local "starts in 5 minutes"
 * notifications (schedules new ones, cancels stale/cancelled/rescheduled ones) — mirrors
 * startReminderNotificationSync's mounted-at-root polling shape. No push infra required:
 * everything here is a locally-scheduled expo-notifications alert.
 */
export function startTelehealthReminderSync() {
  // Initial sync after a short delay to let auth/queryClient settle.
  const initialTimeout = setTimeout(() => {
    syncTelehealthBookingReminders();
  }, 1500);

  // Re-check periodically so a new booking, cancellation, or reschedule gets picked up —
  // mirrors useVetAppointmentReminders' 5-minute refetchInterval.
  const interval = setInterval(
    () => {
      syncTelehealthBookingReminders();
    },
    5 * 60 * 1000,
  );

  return () => {
    clearTimeout(initialTimeout);
    clearInterval(interval);
  };
}
