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
// A range whose close < open spans midnight (overnight); close === open is degenerate and
// treated as closed. Anything unrecognized → null.

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

// Parsed ranges for a given weekday, or null when that day has none we can use (missing key,
// "closed"/null/false, or unparseable). The previous-day spillover below doesn't distinguish
// those cases — it only ever reads overnight ranges to prove OPEN.
function rangesForDow(hoursJson, byLower, dow) {
  const key = byLower.get(DAY_ABBR[dow]) ?? byLower.get(DAY_FULL[dow]);
  if (key == null) return null;
  const value = hoursJson[key];
  if (value == null || value === false) return null;
  if (typeof value === "string" && value.trim().toLowerCase() === "closed") return null;
  return normalizeRanges(value);
}

export function deriveOpenNow(hoursJson, date = new Date()) {
  if (hoursJson == null || typeof hoursJson !== "object" || Array.isArray(hoursJson)) {
    return null;
  }
  const byLower = new Map(
    Object.keys(hoursJson).map((k) => [k.toLowerCase(), k]),
  );
  const dow = date.getDay(); // 0 = Sunday
  const now = date.getHours() * 60 + date.getMinutes();

  // Previous-day overnight SPILLOVER: a range that spans midnight (close < open) keeps the
  // provider open into the early hours of the NEXT day, so a caller at 05:00 is still inside
  // yesterday's overnight shift. Honour it before deciding today. This is purely additive —
  // it can only prove OPEN (true); it never turns an unknown/closed result into null/false.
  const prevRanges = rangesForDow(hoursJson, byLower, (dow + 6) % 7);
  if (prevRanges && prevRanges.some(([o, c]) => c < o && now < c)) {
    return true;
  }

  const todayKey = byLower.get(DAY_ABBR[dow]) ?? byLower.get(DAY_FULL[dow]);
  if (todayKey == null) return null; // no entry for today → unknown

  const value = hoursJson[todayKey];
  if (value == null || value === false) return false;
  if (typeof value === "string" && value.trim().toLowerCase() === "closed") {
    return false;
  }

  const ranges = normalizeRanges(value);
  if (ranges == null) return null; // present but unparseable → unknown

  return ranges.some(([o, c]) => rangeContains(o, c, now));
}
