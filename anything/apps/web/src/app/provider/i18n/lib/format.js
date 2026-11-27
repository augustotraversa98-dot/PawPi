// Interpolation, plurals and locale-aware formatting for the provider panel. Pure functions that take the language,
// so they work in components and in plain modules. Spanish is es-AR, dd/MM/yyyy and a 24 h clock; both languages
// use a 24 h clock.

const NUMBER_LOCALE = { es: "es-AR", en: "en-US" };
const DATE_LOCALE = { es: "es-AR", en: "en-GB" };

/** "Hola {name}" + { name } → "Hola Ana". Values are inserted as text. */
export function fill(template, values = {}) {
  return String(template).replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ""));
}

/** `forms` is { one, other }; `{count}` and any extra values are filled in. */
export function plural(forms, count, lang, values = {}) {
  const category = new Intl.PluralRules(DATE_LOCALE[lang]).select(Number(count) || 0);
  return fill(forms[category] ?? forms.other, { count, ...values });
}

export function formatNumber(value, lang, options) {
  return new Intl.NumberFormat(NUMBER_LOCALE[lang], options).format(Number(value) || 0);
}

/** Integer cents → "ARS 1.250,00" (es) / "ARS 1,250.00" (en). */
export function formatMoney(cents, currency, lang) {
  const amount = formatNumber((Number(cents) || 0) / 100, lang, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${currency || "ARS"} ${amount}`;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const pad = (n) => String(n).padStart(2, "0");

/**
 * A calendar date. A "YYYY-MM-DD" string is a wall-clock day and never shifts with the time zone; anything else is
 * read as an instant, in `options.timeZone` or the browser's zone.
 * Without Intl date options: "31/12/2026" (es) / "2026-12-31" (en). With them ({ day, month, year, weekday }),
 * the locale's wording. "" when there is no readable date.
 */
export function formatDate(value, lang, options = {}) {
  if (value == null || value === "") return "";
  const dayOnly = typeof value === "string" && DATE_ONLY.test(value);
  const date = new Date(dayOnly ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return "";
  const { timeZone, ...shape } = options;
  const zone = dayOnly ? { timeZone: "UTC" } : timeZone ? { timeZone } : {};
  if (Object.keys(shape).length > 0) {
    return new Intl.DateTimeFormat(DATE_LOCALE[lang], { ...shape, ...zone }).format(date);
  }
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", ...zone })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return lang === "es"
    ? `${parts.day}/${parts.month}/${parts.year}`
    : `${parts.year}-${parts.month}-${parts.day}`;
}

/** "14:30". A "14:30[:00]" string is a wall-clock time and is kept as written. */
export function formatTime(value, { timeZone } = {}) {
  if (value == null || value === "") return "";
  const wall = typeof value === "string" && value.match(/^(\d{1,2}):(\d{2})(:\d{2}(\.\d+)?)?$/);
  if (wall) return `${pad(wall[1])}:${wall[2]}`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}

/** An instant as "31/12/2026 · 14:30". */
export function formatDateTime(value, lang, { timeZone } = {}) {
  const date = formatDate(value, lang, timeZone ? { timeZone } : {});
  return date ? `${date} · ${formatTime(value, { timeZone })}` : "";
}

/** "2026-07" → "07/2026" (es); English keeps the value. */
export function formatMonth(value, lang) {
  const match = String(value ?? "").match(/^(\d{4})-(\d{2})$/);
  return match && lang === "es" ? `${match[2]}/${match[1]}` : String(value ?? "");
}
