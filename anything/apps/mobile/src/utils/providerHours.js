// Best-effort "open now" from a provider location's free-form hours_json (Services Hub P2).
// hours_json is jsonb with NO enforced schema — it's stored verbatim from the provider
// locations route — so this recognizes the sensible shapes and, crucially, returns
//   true   → provably open at `date`
//   false  → provably closed at `date`
//   null   → UNKNOWN (missing day / unparseable) — callers MUST NOT hide the provider.
//
// Recognized per-weekday value shapes (key is the day, case-insensitive; 3-letter OR
// full day name):
//   "closed" | null | false                 → closed that day
//   "09:00-17:00" | "9-17"                   → one range
//   ["09:00-13:00", "15:00-19:00"]           → multiple ranges (strings)
//   { open: "09:00", close: "17:00" }        → one range (object)
//   [{ open, close }, ...]                    → multiple ranges (objects)
// A range whose close <= open spans midnight (overnight). Anything unrecognized → null.

const DAY_ABBR = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const DAY_FULL = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

function toMinutes(s) {
  if (typeof s !== "string") return null;
  const m = s.trim().match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = m[2] != null ? Number(m[2]) : 0;
  if (!Number.isFinite(h) || h > 23 || min > 59) return null;
  return h * 60 + min;
}

// Is `now` (minutes past midnight) inside [open, close)? Handles overnight ranges.
function rangeContains(open, close, now) {
  if (open == null || close == null || open === close) return false;
  if (close > open) return now >= open && now < close;
  return now >= open || now < close; // overnight (spans midnight)
}

// Normalize a day's value into an array of [openMin, closeMin], or null if any part
// is unrecognizable (so the caller falls back to "unknown", not "closed").
function normalizeRanges(value) {
  const parseOne = (v) => {
    if (typeof v === "string") {
      const parts = v.split("-");
      if (parts.length !== 2) return null;
      const o = toMinutes(parts[0]);
      const c = toMinutes(parts[1]);
      return o == null || c == null ? null : [o, c];
    }
    if (v && typeof v === "object") {
      const o = toMinutes(v.open);
      const c = toMinutes(v.close);
      return o == null || c == null ? null : [o, c];
    }
    return null;
  };
  const arr = Array.isArray(value) ? value : [value];
  const ranges = [];
  for (const item of arr) {
    const r = parseOne(item);
    if (r == null) return null;
    ranges.push(r);
  }
  return ranges.length ? ranges : null;
}

export function deriveOpenNow(hoursJson, date = new Date()) {
  if (hoursJson == null || typeof hoursJson !== "object" || Array.isArray(hoursJson)) {
    return null;
  }
  const dow = date.getDay(); // 0 = Sunday
  const byLower = new Map(
    Object.keys(hoursJson).map((k) => [k.toLowerCase(), k]),
  );
  const todayKey = byLower.get(DAY_ABBR[dow]) ?? byLower.get(DAY_FULL[dow]);
  if (todayKey == null) return null; // no entry for today → unknown

  const value = hoursJson[todayKey];
  if (value == null || value === false) return false;
  if (typeof value === "string" && value.trim().toLowerCase() === "closed") {
    return false;
  }

  const ranges = normalizeRanges(value);
  if (ranges == null) return null; // present but unparseable → unknown

  const now = date.getHours() * 60 + date.getMinutes();
  return ranges.some(([o, c]) => rangeContains(o, c, now));
}
