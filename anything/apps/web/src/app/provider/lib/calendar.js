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

// ── Proportional (duration-sized) layout (Phase 3) ─────────────────────────────
// A booking is positioned by its wall-clock START and sized by its real DURATION,
// computed in the PROVIDER's IANA zone (DST-safe via Intl) — a Google-Calendar-style
// grid where a 1h booking is twice the height of a 30-min one. Pixel scale:
export const HOUR_PX = 54; // rendered height of one hour
export const PX_PER_MIN = HOUR_PX / 60; // 0.9 px/min
export const MIN_BLOCK_PX = 22; // floor so a sub-slot booking stays tappable
export const DEFAULT_START_HOUR = 7;
export const DEFAULT_END_HOUR = 20;

// Wall-clock { date:'YYYY-MM-DD', minutes:sinceMidnight } of an absolute instant IN
// `timeZone` (DST-safe). null for an unparseable instant. Omitted/invalid zone → local.
export function zonedMinutes(instant, timeZone) {
  const d = new Date(instant);
  if (Number.isNaN(d.getTime())) return null;
  const opts = {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  };
  let dtf;
  try {
    dtf = new Intl.DateTimeFormat("en-CA", timeZone ? { timeZone, ...opts } : opts);
  } catch {
    dtf = new Intl.DateTimeFormat("en-CA", opts); // invalid zone → local
  }
  const p = {};
  for (const part of dtf.formatToParts(d)) {
    if (part.type !== "literal") p[part.type] = part.value;
  }
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    minutes: Number(p.hour) * 60 + Number(p.minute),
  };
}

// A booking's real duration in minutes (absolute elapsed start_at→end_at, so a DST
// shift never distorts it). Missing/invalid end → a 30-min default.
export function durationMinutes(booking) {
  const s = booking?.start_at ? new Date(booking.start_at).getTime() : NaN;
  const e = booking?.end_at ? new Date(booking.end_at).getTime() : NaN;
  if (!Number.isNaN(s) && !Number.isNaN(e) && e > s) return (e - s) / 60000;
  return 30;
}

// The visible hour band [startHour, endHour): business hours 7..20 by default, widened
// (in the provider zone) so no booking is ever off-grid.
export function gridHours(bookings, timeZone) {
  let lo = DEFAULT_START_HOUR * 60;
  let hi = DEFAULT_END_HOUR * 60;
  for (const b of bookings ?? []) {
    const z = zonedMinutes(b?.start_at, timeZone);
    if (!z) continue;
    const startMin = z.minutes;
    const endMin = startMin + durationMinutes(b);
    if (startMin < lo) lo = startMin;
    if (endMin > hi) hi = endMin;
  }
  return {
    startHour: Math.max(0, Math.floor(lo / 60)),
    endHour: Math.min(24, Math.ceil(hi / 60)),
  };
}

const pad2 = (n) => String(n).padStart(2, "0");
function hhmm(min) {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
}

// Lay out ONE day's bookings as absolutely-positioned blocks: top from the wall-clock
// start (minus the grid start), height from the duration, and side-by-side equal-width
// lanes for any group that overlaps in time. Simple greedy first-fit column packing —
// good enough for v1; it does not specially compact deeply-nested overlaps.
// `gridStartMin` = startHour * 60.
export function layoutDay(bookings, gridStartMin, timeZone) {
  const items = [];
  for (const b of bookings ?? []) {
    const z = zonedMinutes(b?.start_at, timeZone);
    if (!z) continue;
    const durationMin = durationMinutes(b);
    const startMin = z.minutes;
    const endMin = startMin + durationMin;
    items.push({
      booking: b,
      startMin,
      endMin,
      durationMin,
      top: (startMin - gridStartMin) * PX_PER_MIN,
      height: Math.max(MIN_BLOCK_PX, durationMin * PX_PER_MIN),
      timeLabel: `${hhmm(startMin)}–${hhmm(endMin)}`,
      lane: 0,
      laneCount: 1,
    });
  }
  items.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

  // Cluster into maximal overlap groups; within a cluster first-fit each block into the
  // earliest free lane, and share the lane count so the group tiles as equal columns.
  let cluster = [];
  let clusterEnd = -Infinity;
  const flush = () => {
    const laneEnds = [];
    for (const it of cluster) {
      let lane = laneEnds.findIndex((end) => it.startMin >= end);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(it.endMin);
      } else {
        laneEnds[lane] = it.endMin;
      }
      it.lane = lane;
    }
    for (const it of cluster) it.laneCount = laneEnds.length;
    cluster = [];
    clusterEnd = -Infinity;
  };
  for (const it of items) {
    if (cluster.length && it.startMin >= clusterEnd) flush();
    cluster.push(it);
    if (it.endMin > clusterEnd) clusterEnd = it.endMin;
  }
  flush();
  return items;
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
