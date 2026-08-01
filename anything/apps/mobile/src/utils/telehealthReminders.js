import {
  scheduleReminderNotification,
  cancelNotification,
  getScheduledNotifications,
} from "./notifications";
import { resolveTelehealthAppointmentMoment } from "./telehealthJoinGate";

/**
 * Local (on-device) reminder for an upcoming telehealth consult — fires 5 minutes before the
 * appointment, the same threshold as the owner early-join gate (telehealthJoinGate.js /
 * .../telehealth/sessions/[sessionId]/join/route.js), so the notification lands right when
 * Join becomes available.
 *
 * Reuses the existing LOCAL notification scheduler (notifications.js — the same one behind
 * routine/vet-appointment reminders) rather than the DB-backed `notifications` bell table
 * (its `type` CHECK only allows paw/bark/follow, and there's no server-side scheduler live
 * yet — CRON_SECRET + the external cron still aren't wired up).
 *
 * There is no persisted store for this: each sync run reads what's ALREADY scheduled via
 * getScheduledNotifications() and reconciles against the current booking list — idempotent,
 * crash-safe, and naturally handles cancellation/reschedule without needing its own
 * AsyncStorage-backed bookkeeping. The booking id + intended trigger time are both encoded
 * in the notification id itself (see buildTelehealthReminderId) so reconciliation needs no
 * extra state.
 */
export const TELEHEALTH_REMINDER_LEAD_MINUTES = 5;

const REMINDER_ID_PREFIX = "telehealth_";
const REMINDER_ID_RE = /^telehealth_(\d+)_(\d+)$/;

/** Encode {bookingId, triggerAtMs} into the reminder id scheduleReminderNotification uses
 * as content.data.reminderId — this doubles as our reconciliation key. */
export function buildTelehealthReminderId(bookingId, triggerAt) {
  return `${REMINDER_ID_PREFIX}${bookingId}_${triggerAt.getTime()}`;
}

/** Decode a reminder id back into {bookingId, triggerAtMs}, or null if it's not ours. */
export function parseTelehealthReminderId(reminderId) {
  const m = typeof reminderId === "string" && reminderId.match(REMINDER_ID_RE);
  if (!m) return null;
  return { bookingId: m[1], triggerAtMs: Number(m[2]) };
}

/** The moment the OS notification should fire: appointment time minus the lead. Null when
 * the booking's date/time can't be parsed. */
export function computeTelehealthReminderTriggerAt(booking) {
  const moment = resolveTelehealthAppointmentMoment(booking);
  if (!moment) return null;
  const trigger = new Date(moment);
  trigger.setMinutes(trigger.getMinutes() - TELEHEALTH_REMINDER_LEAD_MINUTES);
  return trigger;
}

/** Still an active, reminder-worthy telehealth booking? Mirrors the booking_status/status
 * CHECK values (migrations 0005/0017) — excludes cancelled/declined and completed/missed. */
export function isTelehealthBookingReminderEligible(booking) {
  if (!booking || booking.capability !== "telehealth") return false;
  if (booking.status && booking.status !== "scheduled") return false;
  if (
    booking.booking_status &&
    !["requested", "confirmed"].includes(booking.booking_status)
  ) {
    return false;
  }
  return true;
}

/** Build the {id, type, title, description, nextTriggerAt, timeSensitive} shape
 * scheduleReminderNotification expects. */
export function buildTelehealthReminder(booking, triggerAt) {
  return {
    id: buildTelehealthReminderId(booking.id, triggerAt),
    type: "telehealth",
    title: "Video consult starting soon",
    description: booking.provider_name
      ? `Your video consult with ${booking.provider_name} starts in ${TELEHEALTH_REMINDER_LEAD_MINUTES} minutes`
      : `Your video consult starts in ${TELEHEALTH_REMINDER_LEAD_MINUTES} minutes`,
    nextTriggerAt: triggerAt.toISOString(),
    timeSensitive: true,
  };
}

/**
 * Reconcile scheduled OS notifications against the current list of upcoming bookings:
 * schedules a reminder for every eligible telehealth booking that doesn't already have one
 * at the right trigger time, and cancels any of our reminders whose booking is gone,
 * cancelled, or whose time changed (a stale schedule left with the old trigger).
 */
export async function syncTelehealthReminderNotifications(bookings) {
  const scheduled = await getScheduledNotifications();
  const ours = scheduled.filter((n) =>
    parseTelehealthReminderId(n?.content?.data?.reminderId),
  );

  const eligible = (bookings || []).filter(isTelehealthBookingReminderEligible);
  const currentTriggerByBookingId = new Map();
  for (const booking of eligible) {
    const triggerAt = computeTelehealthReminderTriggerAt(booking);
    if (triggerAt) currentTriggerByBookingId.set(String(booking.id), triggerAt);
  }

  const validBookingIds = new Set();
  for (const n of ours) {
    const parsed = parseTelehealthReminderId(n.content.data.reminderId);
    const currentTrigger = currentTriggerByBookingId.get(parsed.bookingId);
    const isValid = currentTrigger && currentTrigger.getTime() === parsed.triggerAtMs;
    if (isValid) {
      validBookingIds.add(parsed.bookingId);
    } else {
      await cancelNotification(n.identifier);
    }
  }

  for (const [bookingId, triggerAt] of currentTriggerByBookingId) {
    if (validBookingIds.has(bookingId)) continue;
    const booking = eligible.find((b) => String(b.id) === bookingId);
    await scheduleReminderNotification(buildTelehealthReminder(booking, triggerAt));
  }
}
