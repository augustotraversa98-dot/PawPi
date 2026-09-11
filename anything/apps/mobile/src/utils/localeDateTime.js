import { getI18n } from "react-i18next";

// AUDIT A-34 — locale-aware display formatting for the Argentine audience.
//
// The app was littered with `toLocaleDateString("en-US", …)` and
// `toLocaleTimeString("en-US", { hour12: true })` — a US locale (MM/DD, AM/PM)
// for a Spanish-first Argentine product. These helpers pick the locale from the
// active i18n language and always use 24-hour time + day-first dates:
//   • Spanish  → es-AR  (dd/MM/yyyy, 24h, Spanish month/day names)
//   • English  → en-GB  (dd/MM/yyyy, 24h, English month/day names — Argentine
//                        date order kept, only the language of the names changes)
//
// Pass a Date or any value `new Date(...)` accepts. Options mirror the standard
// Intl option bags so callers keep their existing weekday/month/day choices;
// hour12 is forced false so a stray true can't reintroduce AM/PM.

export function currentDateLocale() {
  let lang = "es";
  try {
    lang = getI18n()?.language || "es";
  } catch {
    lang = "es"; // i18n not initialised (e.g. a unit test that mocks react-i18next)
  }
  return String(lang).toLowerCase().startsWith("es") ? "es-AR" : "en-GB";
}

export function formatLocalTime(value, options) {
  const d = value instanceof Date ? value : new Date(value);
  return d.toLocaleTimeString(currentDateLocale(), {
    hour: "2-digit",
    minute: "2-digit",
    ...(options || {}),
    hour12: false,
  });
}

export function formatLocalDate(value, options) {
  const d = value instanceof Date ? value : new Date(value);
  return d.toLocaleDateString(currentDateLocale(), {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(options || {}),
  });
}

export function formatLocalDateTime(value, options) {
  const d = value instanceof Date ? value : new Date(value);
  return d.toLocaleString(currentDateLocale(), {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...(options || {}),
    hour12: false,
  });
}
