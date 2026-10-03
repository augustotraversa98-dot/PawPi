// Scheduled-time display — THE one formatter for the clock time a reminder card
// shows, in every Today section (Overdue, Due Soon, Next Up). Pure: no React.
//
// Output is the instance's LOCAL scheduled time plus a day qualifier when the
// scheduled day isn't today:
//   today              → "20:00"
//   yesterday/tomorrow → "Yesterday 20:00" / "Tomorrow 20:00"
//   within ±6 days     → "Mon 20:00"
//   further out        → "Jun 3, 20:00"
//
// The time part is always 24-hour HH:MM via the shared formatLocalTime (no AM/PM,
// whatever the device clock says). Day comparison is by LOCAL
// calendar day — never derive this from a reminder id (ids embed the UTC date;
// see the id-convention note in reminderGenerator.js).

function startOfLocalDay(d) {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

import { formatLocalTime } from "@/utils/localeDateTime";

export function formatScheduledTime(scheduledAt, now = new Date()) {
  const t = new Date(scheduledAt ?? NaN);
  if (Number.isNaN(t.getTime())) return "";
  const nowDate = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(nowDate.getTime())) return "";

  const time = formatLocalTime(t);

  // Whole local-calendar-day offset; rounding absorbs DST-shifted day lengths.
  const dayDiff = Math.round(
    (startOfLocalDay(t) - startOfLocalDay(nowDate)) / 86400000,
  );

  if (dayDiff === 0) return time;
  if (dayDiff === -1) return `Yesterday ${time}`;
  if (dayDiff === 1) return `Tomorrow ${time}`;
  if (Math.abs(dayDiff) <= 6) {
    const weekday = t.toLocaleDateString([], { weekday: "short" });
    return `${weekday} ${time}`;
  }
  const date = t.toLocaleDateString([], { month: "short", day: "numeric" });
  return `${date}, ${time}`;
}
