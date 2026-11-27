// Google Maps opening hours, as serpapi_pull.py stores them, → the app's provider_locations.hours_json.
//
//   in   { "lunes": "10 a.m.–1 p.m., 4–8 p.m.", "sábado": "Abierto las 24 horas", "domingo": "Cerrado" }
//   out  { "mon": [{ "open": "10:00", "close": "13:00" }, { "open": "16:00", "close": "20:00" }],
//          "sat": { "open": "00:00", "close": "24:00" }, "sun": "closed" }
//
// One range is an object, a split day an array, both readable by deriveOpenNow (mobile utils/providerHours.js and
// web provider/lib/openNow.js). Midnight closing is "00:00"; "24:00" is used only for a day that is open all day.
//
// Nothing is guessed: one value that cannot be read with a single meaning leaves the whole week empty and reports
// which value it was.

const DAYS = {
  lunes: "mon",
  martes: "tue",
  "miércoles": "wed",
  jueves: "thu",
  viernes: "fri",
  "sábado": "sat",
  domingo: "sun",
};
const APP_DAYS = new Set(Object.values(DAYS));

// "9", "9:30", "9 a.m.", "12:15 p.m." on each side of an en dash.
const RANGE = /^(\d{1,2})(?::(\d{2}))?(?: ([ap])\.m\.)?\s*–\s*(\d{1,2})(?::(\d{2}))? ([ap])\.m\.$/;
const NOON = 12 * 60;

function minutes(hour, minute, half) {
  const h = Number(hour);
  const m = Number(minute ?? 0);
  if (h < 1 || h > 12 || m > 59) return null;
  return ((h % 12) + (half === "p" ? 12 : 0)) * 60 + m;
}

const clock = (total) =>
  `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;

/** "4–8 p.m." → [960, 1200], or null. A start without a.m./p.m. takes the end's, as Google writes it. */
function readRange(text) {
  const match = RANGE.exec(text);
  if (!match) return null;
  const [, h1, m1, half1, h2, m2, half2] = match;
  const open = minutes(h1, m1, half1 ?? half2);
  const close = minutes(h2, m2, half2);
  if (open === null || close === null || open === close) return null;
  if (close < open) {
    // Past midnight is only believed when both ends say a.m./p.m. and it closes in the morning.
    if (!half1 || close >= NOON) return null;
  }
  return [open, close];
}

/** One day's text → the app's value, or null when it cannot be read. */
export function readDay(value) {
  if (typeof value !== "string") return null;
  // Google separates "10" from "a.m." with a narrow no-break space (U+202F).
  const text = value.replace(/\s+/g, " ").trim();
  if (text === "Cerrado") return "closed";
  if (text === "Abierto las 24 horas") return { open: "00:00", close: "24:00" };

  const ranges = text.split(",").map((part) => readRange(part.trim()));
  if (ranges.some((r) => r === null)) return null;
  // In order and not overlapping; only the last one may run past midnight.
  for (let i = 1; i < ranges.length; i += 1) {
    const [previousOpen, previousClose] = ranges[i - 1];
    if (previousClose < previousOpen || ranges[i][0] < previousClose) return null;
  }
  const out = ranges.map(([open, close]) => ({ open: clock(open), close: clock(close) }));
  return out.length === 1 ? out[0] : out;
}

/**
 * A stored or scraped hours_json → { status, hours, problems }.
 *   "converted"   Google's format, every day read.        hours = the app's shape
 *   "unreadable"  a key or a value that cannot be read.   hours = null, problems = [{ day, value }]
 *   "empty"       no hours at all.                        hours = null
 *   "other"       already English day keys (an owner's, or converted before): not ours to rewrite.
 */
export function normalizeGoogleHours(raw) {
  const entries = raw && typeof raw === "object" && !Array.isArray(raw) ? Object.entries(raw) : [];
  if (entries.length === 0) return { status: "empty", hours: null, problems: [] };

  const named = entries.map(([key, value]) => [key.normalize("NFC").toLowerCase(), value]);
  if (named.every(([key]) => APP_DAYS.has(key))) return { status: "other", hours: null, problems: [] };

  const week = {};
  const problems = [];
  for (const [key, value] of named) {
    const day = Object.hasOwn(DAYS, key) ? DAYS[key] : null;
    const read = day ? readDay(value) : null;
    if (read === null) problems.push({ day: key, value });
    else week[day] = read;
  }
  if (problems.length > 0) return { status: "unreadable", hours: null, problems };

  // Monday first, whatever order the source used.
  const hours = {};
  for (const day of APP_DAYS) if (day in week) hours[day] = week[day];
  return { status: "converted", hours, problems: [] };
}
