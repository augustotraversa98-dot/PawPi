// calendarFormat — PURE, expo-free calendar mapping/formatting helpers (ticket 2.79).
//
// Extracted from calendarIntegration.js so the recurrence/time/notes logic is unit-
// testable in CI: jest can cover this module without expo-calendar, whose native
// EventKit/Calendar calls can't run headless. calendarIntegration.js imports these and
// stays the only file that touches `expo-calendar`.
//
// IMPORTANT: this module must NOT import `expo-calendar`. expo-calendar's
// `Calendar.Frequency` enum values are plain lowercase strings
// ('daily'|'weekly'|'monthly'|'yearly'), so we mirror them here as RECURRENCE_FREQUENCY
// and the result of getRecurrenceRule is passed straight into createEventAsync's
// `recurrenceRule` field unchanged — byte-identical to the previous inline mapping.

import { ROUTINE_FREQUENCY } from "@/data/routinesData";

// Mirror of expo-calendar's Calendar.Frequency string values (kept decoupled so this
// module is import-free of the native package).
export const RECURRENCE_FREQUENCY = {
  DAILY: "daily",
  WEEKLY: "weekly",
  MONTHLY: "monthly",
};

// Convert a walk/routine schedule to a recurrence-rule object, or null for a one-time
// event. Mirrors the original behavior exactly: DAILY → daily; WEEKLY (with selected
// days, 0 = Sunday) → weekly + daysOfTheWeek; MONTHLY (with a preferred day) → monthly
// + daysOfTheMonth; anything else → null (one-time).
export function getRecurrenceRule(schedule) {
  if (!schedule) return null;

  if (schedule.frequency === ROUTINE_FREQUENCY.DAILY) {
    return { frequency: RECURRENCE_FREQUENCY.DAILY, interval: 1 };
  }

  if (schedule.frequency === ROUTINE_FREQUENCY.WEEKLY && schedule.days?.length > 0) {
    // walk.days uses 0 = Sunday, the same convention expo-calendar expects.
    return {
      frequency: RECURRENCE_FREQUENCY.WEEKLY,
      interval: 1,
      daysOfTheWeek: schedule.days.map((day) => ({ dayOfTheWeek: day })),
    };
  }

  if (schedule.frequency === ROUTINE_FREQUENCY.MONTHLY && schedule.preferredDay) {
    return {
      frequency: RECURRENCE_FREQUENCY.MONTHLY,
      interval: 1,
      daysOfTheMonth: [schedule.preferredDay],
    };
  }

  // Default: no recurrence (one-time event).
  return null;
}

// Parse an "HH:mm" time string into a Date set to that time on today's date.
export function parseWalkTime(timeString) {
  const [hours, minutes] = timeString.split(":").map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
}

// Human-readable frequency label for a walk/routine (display only).
export function formatFrequency(walk) {
  if (walk.frequency === ROUTINE_FREQUENCY.DAILY) {
    return "daily";
  }

  if (walk.frequency === ROUTINE_FREQUENCY.WEEKLY && walk.days?.length > 0) {
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const selectedDays = walk.days.map((d) => dayNames[d]).join(", ");
    return `every ${selectedDays}`;
  }

  if (walk.frequency === ROUTINE_FREQUENCY.MONTHLY && walk.preferredDay) {
    return `monthly on day ${walk.preferredDay}`;
  }

  return "one time";
}

// Build the event "notes" body for a calendar event. `kind` selects the template:
//   "walk" → the fixed walk-block note (privacy-preserving, no pet data).
//   "vet"  → the multi-line vet-appointment summary (pet name + appointment fields).
// Matches the previous inline strings exactly so existing calendar events are unchanged.
export function buildEventNotes(kind, data = {}) {
  if (kind === "walk") {
    return "Dog walk scheduled in Social Pet";
  }

  if (kind === "vet") {
    const petName = data.petName || "Your pet";
    let notes = `Vet appointment for ${petName}\n\n`;
    if (data.title) notes += `Appointment: ${data.title}\n`;
    if (data.reasonForVisit) notes += `Reason: ${data.reasonForVisit}\n`;
    if (data.veterinarian) notes += `Veterinarian: ${data.veterinarian}\n`;
    if (data.notes) notes += `\nNotes: ${data.notes}\n`;
    notes += `\nManaged by Social Pet`;
    return notes;
  }

  return "";
}
