import { parseDateValue, parseTimeValue, formatDisplayTime } from "./canonicalDateTime";

/**
 * Owner-side "can I join yet?" gate for a telehealth booking. Mirrors the server-side gate
 * in .../telehealth/sessions/[sessionId]/join/route.js: the owner may join once the vet has
 * started the call (telehealth_sessions.status === 'in_progress') OR within this many
 * minutes of the scheduled appointment_date/appointment_time, whichever comes first.
 *
 * This is ONLY a client-side pre-check so the button/badge doesn't look broken — the server
 * is the source of truth (it also handles clock skew, since it compares its own local-wall-
 * clock reading of the moment the request lands against the same rule).
 *
 * The vet/staff side is never gated (see BookingsInbox.jsx's onJoinConsult) — this module is
 * owner-only and must not be applied to the provider dashboard.
 */
export const OWNER_EARLY_JOIN_WINDOW_MINUTES = 5;

/**
 * The booking's scheduled moment as a local Date, or null when unparseable.
 * appointment_date/appointment_time are naive local wall-clock values (no timezone stored
 * anywhere in the schema) — parse each half separately via canonicalDateTime and compose
 * with setHours, never `new Date(`${date}T${time}`)` for a date-only string.
 */
export function resolveTelehealthAppointmentMoment(booking) {
  const date = parseDateValue(booking?.appointment_date);
  const time = parseTimeValue(booking?.appointment_time);
  if (!date || !time) return null;
  const moment = new Date(date);
  moment.setHours(time.hours, time.minutes, 0, 0);
  return moment;
}

/** Minutes from `now` until the booking's scheduled moment (negative once past). Null when
 * the booking's date/time can't be parsed. */
export function minutesUntilTelehealthAppointment(booking, now = new Date()) {
  const moment = resolveTelehealthAppointmentMoment(booking);
  if (!moment) return null;
  return (moment.getTime() - now.getTime()) / 60000;
}

/**
 * Can the OWNER join this consult right now? `sessionStatus` is telehealth_sessions.status
 * when known (from useTelehealthSessions or GET /api/me/bookings' telehealth_session_status);
 * absent/unknown is treated as not-yet-started, so the time window is the only path to true.
 */
export function canOwnerJoinTelehealthNow(booking, { sessionStatus, now = new Date() } = {}) {
  if (sessionStatus === "in_progress") return true;
  const minutesUntil = minutesUntilTelehealthAppointment(booking, now);
  if (minutesUntil == null) return false;
  return minutesUntil <= OWNER_EARLY_JOIN_WINDOW_MINUTES;
}

/**
 * Should the client pre-emptively block the Join button (never call the API)? Unlike
 * canOwnerJoinTelehealthNow, this fails OPEN on uncertainty — when the booking's date/time
 * can't be parsed we let the tap through and let the server's 425 response (the real source
 * of truth) decide, rather than hiding a button that might actually work.
 */
export function isTelehealthJoinTooEarly(booking, { sessionStatus, now = new Date() } = {}) {
  if (sessionStatus === "in_progress") return false;
  const minutesUntil = minutesUntilTelehealthAppointment(booking, now);
  if (minutesUntil == null) return false;
  return minutesUntil > OWNER_EARLY_JOIN_WINDOW_MINUTES;
}

/**
 * Friendly copy for the "not time yet" state, e.g. "Your consult starts at 10:15 AM — you
 * can join in 12 minutes, or once your vet starts the call."
 */
export function describeTelehealthJoinWait(booking, now = new Date()) {
  const minutesUntil = minutesUntilTelehealthAppointment(booking, now);
  const displayTime = formatDisplayTime(booking?.appointment_time);
  const timePart = displayTime ? `Your consult starts at ${displayTime}` : "Your consult";

  if (minutesUntil == null) {
    return `${timePart}. You'll be able to join once your vet starts the call.`;
  }

  const minutesRemaining = Math.max(
    1,
    Math.ceil(minutesUntil - OWNER_EARLY_JOIN_WINDOW_MINUTES),
  );
  const unit = minutesRemaining === 1 ? "minute" : "minutes";
  return `${timePart} — you can join in ${minutesRemaining} ${unit}, or once your vet starts the call.`;
}
