// Shared date/time display for a booking on the provider extranet (English-only —
// the extranet has no i18n). appointment_date/appointment_time are LOCAL wall-clock
// (the DB `time` column is `without time zone`), so they render verbatim with NO
// timezone conversion — that avoids the off-by-one a naive `new Date(dateOnly)`
// introduces. When the richer `start_at` timestamptz is present we prefer it,
// formatted in the provider's own IANA zone (providers.time_zone).

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// "2026-08-15" or a full ISO string ("2026-08-15T03:00:00.000Z") → "15 Aug 2026".
// Returns "" when unparseable so callers can fall back to an em-dash.
function formatWallClockDate(dateStr) {
  if (!dateStr) return "";
  const m = String(dateStr).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  const month = MONTHS[Number(m[2]) - 1];
  if (!month) return "";
  return `${Number(m[3])} ${month} ${m[1]}`;
}

// "14:30" or "14:30:00" → "14:30".
function formatWallClockTime(timeStr) {
  if (!timeStr) return "";
  return String(timeStr).slice(0, 5);
}

// Render a booking's when as "15 Aug 2026 · 14:30". Prefers the true `start_at`
// timestamptz (rendered in the provider's `timeZone`); otherwise composes the
// wall-clock appointment_date + appointment_time with no zone shift.
export function formatBookingWhen(row, timeZone) {
  if (!row) return "—";

  if (row.start_at) {
    const d = new Date(row.start_at);
    if (!Number.isNaN(d.getTime())) {
      try {
        return new Intl.DateTimeFormat("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
          ...(timeZone ? { timeZone } : {}),
        })
          .format(d)
          .replace(",", " ·");
      } catch {
        // An invalid timeZone throws — fall through to the wall-clock fields.
      }
    }
  }

  const date = formatWallClockDate(row.appointment_date);
  if (!date) return "—";
  const time = formatWallClockTime(row.appointment_time);
  return time ? `${date} · ${time}` : date;
}
