// Opening-hours helpers for the locations screen. hours_json is a free-form
// JSONB object server-side; the UI uses a simple per-weekday open/close editor.
// We settle on the shape { mon: { open: "09:00", close: "17:00" }, ... } and keep
// the round-trip (rows ⇄ hours_json) here so the screen and tests share it.

export const WEEKDAYS = [
  { key: "mon", label: "Mon" },
  { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" },
  { key: "sat", label: "Sat" },
  { key: "sun", label: "Sun" },
];

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
export function hoursSummary(hours) {
  if (!hours || typeof hours !== "object") return "";
  const parts = [];
  for (const day of WEEKDAYS) {
    const h = hours[day.key];
    if (!h) continue;
    if (h.open && h.close) parts.push(`${day.label} ${h.open}–${h.close}`);
    else if (h.open) parts.push(`${day.label} from ${h.open}`);
    else if (h.close) parts.push(`${day.label} until ${h.close}`);
  }
  return parts.join(" · ");
}
