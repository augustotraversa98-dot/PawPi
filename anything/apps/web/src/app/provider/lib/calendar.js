// Pure date/grid helpers for the provider bookings calendar (ticket 2.24). No React,
// no network — kept in a leaf module so the grid math is unit-testable on its own.
// Week starts MONDAY (app-wide convention, Mon=0; see the mobile DayChips).

const DAY = 24 * 60 * 60 * 1000;

// Local YYYY-MM-DD for a Date (the day-column key). Local, not UTC, so a booking
// shows on the calendar day the provider sees it in their own timezone.
export function ymd(date) {
  const d = new Date(date);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function addDays(date, n) {
  return new Date(new Date(date).getTime() + n * DAY);
}

// Monday 00:00 local of the week containing `date`.
export function startOfWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const mondayIndex = (d.getDay() + 6) % 7; // Sun=6 … Mon=0
  return addDays(d, -mondayIndex);
}

export function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

// The ordered Date columns for a view ('week' → 7 days from Monday; 'day' → 1).
export function viewDays(view, anchor) {
  if (view === "day") return [startOfDay(anchor)];
  const ws = startOfWeek(anchor);
  return Array.from({ length: 7 }, (_, i) => addDays(ws, i));
}

// The [from, to) start_at window (ISO strings) the calendar query should pull for a
// view — exactly the visible columns, so the grid never over-fetches.
export function rangeForView(view, anchor) {
  const days = viewDays(view, anchor);
  const from = days[0];
  const to = addDays(days[days.length - 1], 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

// The booking's local day key + start hour, for placing it in a grid cell.
export function bookingDayKey(booking) {
  return booking?.start_at ? ymd(booking.start_at) : null;
}

export function bookingHour(booking) {
  return booking?.start_at ? new Date(booking.start_at).getHours() : null;
}

// The hour rows to render: business hours 7..20 by default, widened to include any
// booking that falls outside (so nothing is ever hidden off-grid).
export function hourRange(bookings, { min = 7, max = 20 } = {}) {
  let lo = min;
  let hi = max;
  for (const b of bookings ?? []) {
    const h = bookingHour(b);
    if (h == null) continue;
    if (h < lo) lo = h;
    const endH = b.end_at ? new Date(b.end_at).getHours() : h;
    if (endH > hi) hi = endH;
  }
  const hours = [];
  for (let h = lo; h <= hi; h++) hours.push(h);
  return hours;
}

// Group bookings by `${dayKey}|${hour}` so a cell lookup is O(1).
export function indexByCell(bookings) {
  const map = new Map();
  for (const b of bookings ?? []) {
    const key = `${bookingDayKey(b)}|${bookingHour(b)}`;
    const list = map.get(key) ?? [];
    list.push(b);
    map.set(key, list);
  }
  return map;
}

export function hourLabel(h) {
  const ampm = h < 12 ? "AM" : "PM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12} ${ampm}`;
}

const WEEKDAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Short column header e.g. "Mon 16". index is the day's position from Monday.
export function dayHeader(date) {
  const d = new Date(date);
  const idx = (d.getDay() + 6) % 7;
  return `${WEEKDAY[idx]} ${d.getDate()}`;
}
