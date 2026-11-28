import shared from "../i18n/shared";
import { fill } from "../i18n/lib/format";

// Opening-hours helpers for the locations screen. hours_json is a free-form JSONB object server-side. The editor
// writes, per weekday, one range { open: "09:00", close: "17:00" }, a split day [range, range], "closed", or
// { open: "00:00", close: "24:00" } for a day open all day (the shapes lib/openNow.js reads; the directory's
// hours are stored the same way). The round-trip (rows ⇄ hours_json) lives here so the screen and tests share it.

// `label` is the English name, for screens not yet translated; translated screens use weekdayName(key, lang).
export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map(
  (key) => ({ key, label: shared.en.weekdaysShort[key] }),
);

export const weekdayName = (key, lang = "en") => shared[lang].weekdaysShort[key];

export const ALL_DAY = { open: "00:00", close: "24:00" };
export const blankRange = () => ({ open: "", close: "" });

// "9", "9:30" or "09:30" as the "HH:MM" a time input takes ("24:00" too); "" stays "", anything else is null.
function readTime(value) {
  if (value === undefined || value === null || value === "") return "";
  const match = typeof value === "string" ? value.trim().match(/^(\d{1,2})(?::(\d{2}))?$/) : null;
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  if (minute > 59 || hour > 24 || (hour === 24 && minute > 0)) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

// A stored range, as an object or as "09:00-17:00".
function readRange(item) {
  let parts = null;
  if (typeof item === "string") parts = item.split("-");
  else if (item && typeof item === "object") parts = [item.open, item.close];
  if (parts?.length !== 2) return null;
  const [open, close] = parts.map(readTime);
  if (open === null || close === null || (!open && !close)) return null;
  return { open, close };
}

// One day of the editor: { status: "hours" | "closed" | "allDay", ranges, stored? }. `stored` keeps a value the
// editor cannot show, so saving something else does not erase it.
function toRow(value) {
  const row = { status: "hours", ranges: [blankRange()] };
  if (value === undefined) return row;
  const closed =
    value === null || value === false || (typeof value === "string" && value.trim().toLowerCase() === "closed");
  if (closed) return { ...row, status: "closed" };
  const list = Array.isArray(value) ? value : [value];
  const ranges = list.map(readRange);
  if (ranges.length === 0 || ranges.includes(null)) return { ...row, stored: value };
  if (ranges.length === 1 && ranges[0].open === ALL_DAY.open && ranges[0].close === ALL_DAY.close) {
    return { ...row, status: "allDay" };
  }
  // A time input has no 24:00; closing at midnight is 00:00.
  return { ...row, ranges: ranges.map((r) => (r.close === "24:00" ? { ...r, close: "00:00" } : r)) };
}

// Seed editor rows from a stored hours_json (missing days → one empty range).
export function hoursToRows(hours) {
  const rows = {};
  for (const day of WEEKDAYS) rows[day.key] = toRow(hours?.[day.key]);
  return rows;
}

// Collapse editor rows into hours_json, keeping only days with something set.
// Returns undefined when nothing is filled so the field is simply omitted (an
// empty hours editor must NOT block save).
export function rowsToHours(rows) {
  const hours = {};
  for (const day of WEEKDAYS) {
    const row = rows?.[day.key];
    if (!row) continue;
    if (row.status === "closed") hours[day.key] = "closed";
    else if (row.status === "allDay") hours[day.key] = { ...ALL_DAY };
    else {
      const filled = row.ranges
        .map((r) => {
          const open = (r.open || "").trim();
          const close = (r.close || "").trim();
          return { ...(open && { open }), ...(close && { close }) };
        })
        .filter((r) => r.open || r.close);
      if (filled.length > 0) hours[day.key] = filled.length === 1 ? filled[0] : filled;
      else if (row.stored !== undefined) hours[day.key] = row.stored;
    }
  }
  return Object.keys(hours).length > 0 ? hours : undefined;
}

// One-line summary for the list, e.g. "Mon 09:00–13:00, 16:00–20:00 · Sun closed".
export function hoursSummary(hours, lang = "en") {
  if (!hours || typeof hours !== "object") return "";
  const parts = [];
  for (const day of WEEKDAYS) {
    if (hours[day.key] === undefined) continue;
    const row = toRow(hours[day.key]);
    const name = weekdayName(day.key, lang);
    const { from, until, closed, allDay } = shared[lang].hours;
    if (row.status === "closed") parts.push(fill(closed, { day: name }));
    else if (row.status === "allDay") parts.push(fill(allDay, { day: name }));
    else {
      const complete = row.ranges.filter((r) => r.open && r.close);
      const [first] = row.ranges;
      if (complete.length > 0) parts.push(`${name} ${complete.map((r) => `${r.open}–${r.close}`).join(", ")}`);
      else if (first.open) parts.push(fill(from, { day: name, time: first.open }));
      else if (first.close) parts.push(fill(until, { day: name, time: first.close }));
    }
  }
  return parts.join(" · ");
}
