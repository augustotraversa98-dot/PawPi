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
import { gt } from "@/utils/generatedCopy";

// "Your pet" placeholder when a caller has no pet name (display text only).
export const yourPetLabel = () => gt("generatedUi.calendar.yourPet", "Your pet");

// Footer line of every PawPi-created calendar event.
const managedByPawPi = () => gt("generatedUi.calendar.managedBy", "Managed by PawPi");

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
    return gt("generatedUi.calendar.freqDaily", "daily");
  }

  if (walk.frequency === ROUTINE_FREQUENCY.WEEKLY && walk.days?.length > 0) {
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const dayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    const selectedDays = walk.days
      .map((d) => gt(`walkItem.days.${dayKeys[d]}`, dayNames[d]))
      .join(", ");
    return gt("generatedUi.calendar.freqEvery", `every ${selectedDays}`, {
      days: selectedDays,
    });
  }

  if (walk.frequency === ROUTINE_FREQUENCY.MONTHLY && walk.preferredDay) {
    return gt(
      "generatedUi.calendar.freqMonthly",
      `monthly on day ${walk.preferredDay}`,
      { day: walk.preferredDay },
    );
  }

  return gt("generatedUi.calendar.freqOnce", "one time");
}

// Build the event "notes" body for a calendar event. `kind` selects the template:
//   "walk" → the fixed walk-block note (privacy-preserving, no pet data).
//   "vet"  → the multi-line vet-appointment summary (pet name + appointment fields).
// Matches the previous inline strings exactly so existing calendar events are unchanged.
export function buildEventNotes(kind, data = {}) {
  if (kind === "walk") {
    return gt("generatedUi.calendar.walkNotes", "Dog walk scheduled in PawPi");
  }

  if (kind === "vet") {
    const petName = data.petName || yourPetLabel();
    let notes = `${gt("generatedUi.calendar.vetTitle", "Vet appointment for {{name}}", { name: petName })}\n\n`;
    if (data.title)
      notes += `${gt("generatedUi.calendar.labelAppointment", "Appointment:")} ${data.title}\n`;
    if (data.reasonForVisit)
      notes += `${gt("generatedUi.calendar.labelReason", "Reason:")} ${data.reasonForVisit}\n`;
    if (data.veterinarian)
      notes += `${gt("generatedUi.calendar.labelVeterinarian", "Veterinarian:")} ${data.veterinarian}\n`;
    if (data.notes)
      notes += `\n${gt("generatedUi.calendar.labelNotes", "Notes:")} ${data.notes}\n`;
    notes += `\n${managedByPawPi()}`;
    return notes;
  }

  return "";
}

// ===== 2.80 surface detail builders (pure) =====
//
// Each turns a surface's data shape (booking / transport trip / telehealth consult /
// event) into the generic event detail { summary, startDate, endDate, location, notes }
// that calendarIntegration.addSurfaceEventToCalendar feeds to the native API. Pure +
// jest-covered; the native Calendar calls stay in calendarIntegration.js.

// Combine a date ("YYYY-MM-DD") + time ("HH:MM" or "HH:MM:SS") into a LOCAL Date.
export function combineDateAndTime(dateStr, timeStr) {
  const [y, m, d] = String(dateStr).slice(0, 10).split("-").map(Number);
  const [hh = 0, mm = 0, ss = 0] = String(timeStr || "00:00").split(":").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, hh, mm, ss, 0);
}

// Resolve { startDate, endDate } from an item that may carry an ISO slot
// (start_at/end_at or starts_at/ends_at) or a date+time pair, defaulting the duration
// when no end is given.
function resolveStartEnd(item, defaultMinutes) {
  const startIso = item.start_at || item.starts_at;
  const endIso = item.end_at || item.ends_at;
  const startDate = startIso
    ? new Date(startIso)
    : combineDateAndTime(item.appointment_date, item.appointment_time);
  const endDate = endIso
    ? new Date(endIso)
    : new Date(startDate.getTime() + defaultMinutes * 60 * 1000);
  return { startDate, endDate };
}

// Generalized service booking (grooming / walking / daycare / sitting). 30-min default.
export function buildBookingCalendarDetails(booking, petName = yourPetLabel()) {
  const { startDate, endDate } = resolveStartEnd(booking, 30);
  const summary =
    booking.title ||
    booking.service_name ||
    gt("generatedUi.calendar.bookingTitle", "Appointment for {{name}}", { name: petName });
  const location = booking.clinic || booking.provider_name || "";
  const parts = [];
  if (booking.reason_for_visit) parts.push(booking.reason_for_visit);
  if (booking.notes) parts.push(booking.notes);
  parts.push(managedByPawPi());
  return { summary, startDate, endDate, location, notes: parts.join("\n") };
}

// Telehealth video consult — no physical location. 30-min default.
export function buildTelehealthCalendarDetails(consult, petName = yourPetLabel()) {
  const { startDate, endDate } = resolveStartEnd(consult, 30);
  const summary =
    consult.title ||
    gt("generatedUi.calendar.telehealthTitle", "Telehealth consult for {{name}}", { name: petName });
  const parts = [
    gt("generatedUi.calendar.telehealthNotes", "Video consult — no physical location."),
  ];
  if (consult.provider_name)
    parts.push(
      `${gt("generatedUi.calendar.labelProvider", "Provider:")} ${consult.provider_name}`,
    );
  parts.push(managedByPawPi());
  return { summary, startDate, endDate, location: "", notes: parts.join("\n") };
}

// Transport / pet-taxi trip — pickup/dropoff as location/notes. 60-min default.
export function buildTransportCalendarDetails(trip) {
  const { startDate, endDate } = resolveStartEnd({ starts_at: trip.scheduled_at }, 60);
  const summary = trip.provider_name
    ? gt("generatedUi.calendar.transportTitleNamed", "Pet transport — {{name}}", {
        name: trip.provider_name,
      })
    : gt("generatedUi.calendar.transportTitle", "Pet transport");
  const location = trip.pickup_address || "";
  const parts = [];
  if (trip.pickup_address)
    parts.push(
      `${gt("generatedUi.calendar.labelPickup", "Pickup:")} ${trip.pickup_address}`,
    );
  if (trip.dropoff_address)
    parts.push(
      `${gt("generatedUi.calendar.labelDropoff", "Dropoff:")} ${trip.dropoff_address}`,
    );
  parts.push(managedByPawPi());
  return { summary, startDate, endDate, location, notes: parts.join("\n") };
}

// Community event / meetup. 60-min default.
export function buildEventCalendarDetails(event) {
  const { startDate, endDate } = resolveStartEnd(event, 60);
  const summary = event.title || gt("generatedUi.calendar.eventTitle", "Event");
  const location = event.location_name || event.address || "";
  const notes = event.description || "";
  return { summary, startDate, endDate, location, notes };
}
