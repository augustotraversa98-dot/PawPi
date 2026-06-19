// ics.js — RFC 5545 iCalendar (.ics) generation for owner-scoped export (ticket 2.79;
// extended for events in 2.80). PURE string builders: no DB access, no secrets. The web
// ICS routes fetch the caller's OWN row (auth + owner/visibility scoped) and hand it
// here. Output is a single-VEVENT VCALENDAR that opens cleanly in Apple/Google Calendar
// and on Android/desktop/email.
//
// Why floating vs UTC times:
//   - Bookings come from vet_appointments.appointment_date (date) + appointment_time
//     (time WITHOUT time zone) — i.e. a wall-clock instant with no zone. We emit it as a
//     FLOATING local date-time (no trailing Z), which RFC 5545 defines as "interpreted in
//     the viewer's local zone" — exactly the booking's semantics, and conversion-bug-free.
//   - Events come from timestamptz columns (a true instant) — we emit those as UTC (Z).
//   - DTSTAMP (document creation time) is always UTC (Z), per spec.

const pad = (n) => String(n).padStart(2, "0");

// Escape a text value per RFC 5545 §3.3.11: backslash, semicolon, comma, newline.
// Order matters — escape the backslash first so we don't double-escape our own escapes.
export function escapeIcsText(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

// Format a JS Date as a UTC timestamp: YYYYMMDDTHHMMSSZ.
export function formatIcsUtc(date) {
  return (
    date.getUTCFullYear() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    "T" +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    "Z"
  );
}

// Format a wall-clock date + time (+ optional minute offset) as a FLOATING local
// date-time: YYYYMMDDTHHMMSS (no zone). `dateStr` = "YYYY-MM-DD" (extra chars ignored),
// `timeStr` = "HH:MM" or "HH:MM:SS". Uses a local-time Date for safe minute arithmetic.
export function formatFloatingDateTime(dateStr, timeStr, addMinutes = 0) {
  const [y, m, d] = String(dateStr).slice(0, 10).split("-").map(Number);
  const [hh = 0, mm = 0, ss = 0] = String(timeStr || "00:00:00")
    .split(":")
    .map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1, hh, mm + addMinutes, ss, 0);
  return (
    dt.getFullYear() +
    pad(dt.getMonth() + 1) +
    pad(dt.getDate()) +
    "T" +
    pad(dt.getHours()) +
    pad(dt.getMinutes()) +
    pad(dt.getSeconds())
  );
}

// Assemble a VCALENDAR with one VEVENT from already-formatted DTSTART/DTEND strings.
// CRLF line endings + trailing CRLF, as RFC 5545 requires.
function buildVCalendar({ uid, dtstart, dtend, summary, location, description }) {
  const dtstamp = formatIcsUtc(new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//PawPi//Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${dtstart}`,
    `DTEND:${dtend}`,
    `SUMMARY:${escapeIcsText(summary)}`,
  ];
  if (location) lines.push(`LOCATION:${escapeIcsText(location)}`);
  if (description) lines.push(`DESCRIPTION:${escapeIcsText(description)}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

// Build a booking (.ics) from a vet_appointments row. Stable UID per booking so a
// re-download updates the same calendar entry. Default 30-min duration (matches the
// mobile add-to-calendar precedent — vet_appointments has no duration column).
export function buildBookingIcs(row, { durationMinutes = 30 } = {}) {
  const dateStr = String(row.appointment_date).slice(0, 10);
  const timeStr = String(row.appointment_time || "00:00:00");

  const descParts = [];
  if (row.reason_for_visit) descParts.push(row.reason_for_visit);
  if (row.veterinarian) descParts.push(`Veterinarian: ${row.veterinarian}`);
  if (row.notes) descParts.push(row.notes);

  return buildVCalendar({
    uid: `booking-${row.id}@pawpi`,
    dtstart: formatFloatingDateTime(dateStr, timeStr, 0),
    dtend: formatFloatingDateTime(dateStr, timeStr, durationMinutes),
    summary: row.title || "Booking",
    location: row.clinic || "",
    description: descParts.join("\n"),
  });
}

// Build an event (.ics) from an events row (ticket 2.80). starts_at/ends_at are
// timestamptz (true instants) → emitted as UTC. Falls back to a 60-min duration when
// ends_at is absent. Stable UID per event.
export function buildEventIcs(row, { defaultDurationMinutes = 60 } = {}) {
  const start = row.starts_at instanceof Date ? row.starts_at : new Date(row.starts_at);
  const end =
    row.ends_at != null
      ? row.ends_at instanceof Date
        ? row.ends_at
        : new Date(row.ends_at)
      : new Date(start.getTime() + defaultDurationMinutes * 60 * 1000);

  return buildVCalendar({
    uid: `event-${row.id}@pawpi`,
    dtstart: formatIcsUtc(start),
    dtend: formatIcsUtc(end),
    summary: row.title || "Event",
    location: row.location_name || row.address || "",
    description: row.description || "",
  });
}
