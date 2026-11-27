// How the record screens show a stored date and open a stored file. Leaf module: no React, no router.

// A date column or timestamp as the screen shows it: YYYY-MM-DD in English, dd/MM/yyyy in Spanish.
export function formatRecordDate(value, lang) {
  if (!value) return "—";
  const day = String(value).slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  return lang === "es" && match ? `${match[3]}/${match[2]}/${match[1]}` : day;
}

const PRIVATE_KEY = /^pets\/\d+\/[a-zA-Z0-9._-]+$/;

// Where a stored file opens from: a private key goes through the authenticated media route as this provider; an
// https address opens as it is; anything else is not linked.
export function recordFileHref(value, providerId) {
  if (typeof value !== "string") return null;
  if (PRIVATE_KEY.test(value) && !value.includes("..")) {
    return `/api/media?key=${encodeURIComponent(value)}&providerId=${encodeURIComponent(providerId)}`;
  }
  return /^https:\/\//i.test(value) ? value : null;
}
