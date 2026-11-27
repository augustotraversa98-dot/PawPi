import shared from "../i18n/shared";
import { fill } from "../i18n/lib/format";

// Opening-hours helpers for the locations screen. hours_json is a free-form
// JSONB object server-side; the UI uses a simple per-weekday open/close editor.
// We settle on the shape { mon: { open: "09:00", close: "17:00" }, ... } and keep
// the round-trip (rows ⇄ hours_json) here so the screen and tests share it.

// `label` is the English name, for screens not yet translated; translated screens use weekdayName(key, lang).
export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map(
  (key) => ({ key, label: shared.en.weekdaysShort[key] }),
);

export const weekdayName = (key, lang = "en") => shared[lang].weekdaysShort[key];

// Seed editor rows from a stored hours_json (missing days → empty open/close).
export function hoursToRows(hours) {
  const rows = {};
  for (const day of WEEKDAYS) {
    const h = (hours && hours[day.key]) || {};
    rows[day.key] = { open: h.open ?? "", close: h.close ?? "" };
  }
  return rows;
}

// Collapse editor rows into hours_json, keeping only days with something set.
// Returns undefined when nothing is filled so the field is simply omitted (an
// empty hours editor must NOT block save).
export function rowsToHours(rows) {
  const hours = {};
  for (const day of WEEKDAYS) {
    const open = (rows?.[day.key]?.open || "").trim();
    const close = (rows?.[day.key]?.close || "").trim();
    if (open || close) {
      hours[day.key] = {};
      if (open) hours[day.key].open = open;
      if (close) hours[day.key].close = close;
    }
  }
  return Object.keys(hours).length > 0 ? hours : undefined;
}

// One-line summary for the list, e.g. "Mon 09:00–17:00 · Sat 10:00–14:00".
export function hoursSummary(hours, lang = "en") {
  if (!hours || typeof hours !== "object") return "";
  const parts = [];
  for (const day of WEEKDAYS) {
    const h = hours[day.key];
    if (!h) continue;
    const name = weekdayName(day.key, lang);
    const { from, until } = shared[lang].hours;
    if (h.open && h.close) parts.push(`${name} ${h.open}–${h.close}`);
    else if (h.open) parts.push(fill(from, { day: name, time: h.open }));
    else if (h.close) parts.push(fill(until, { day: name, time: h.close }));
  }
  return parts.join(" · ");
}
