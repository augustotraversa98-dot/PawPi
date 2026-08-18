// Medications & Care — PURE constants + display helpers only.
//
// NR4 (docs/night-run-2026-08-18.md): the in-memory mock store (seeded with fake meds
// like Carprofen / Enalapril) was REMOVED. All medication / vaccine / preventive data now
// lives in the real backend (pet_medications, pet_preventive_treatments, pet_vaccinations)
// and is read/written via react-query hooks. This module keeps only stateless helpers used
// for rendering: the preventive-type catalog and date/status derivation. NO seed data, no
// in-memory arrays, no CRUD.

// Preventive treatment types. Labels are localized in the UI via
// `health.medications.prevTypes.<key>`; only the stable key + emoji live here.
export const PREVENTIVE_TYPES = [
  { key: "flea", emoji: "🦟" },
  { key: "tick", emoji: "🕷️" },
  { key: "heartworm", emoji: "❤️" },
  { key: "flea_tick", emoji: "🦟" },
  { key: "flea_tick_heartworm", emoji: "💊" },
  { key: "dewormer", emoji: "🪱" },
  { key: "supplement", emoji: "💊" },
  { key: "other", emoji: "🏥" },
];

export function getPreventiveTypeEmoji(typeKey) {
  const type = PREVENTIVE_TYPES.find((t) => t.key === typeKey);
  return type ? type.emoji : "💊";
}

// Parse a backend date value (a `date` column serialized to an ISO string, or a canonical
// YYYY-MM-DD) into a Date at local midnight. Returns null for empty values.
function parseDbDate(value) {
  if (!value) return null;
  const s = String(value).slice(0, 10); // YYYY-MM-DD
  const [y, m, d] = s.split("-").map((n) => parseInt(n, 10));
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

// Format a backend date value as dd/MM/yyyy (Argentine convention). Empty → "".
export function formatDate(value) {
  const date = parseDbDate(value);
  if (!date) return "";
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${date.getFullYear()}`;
}

export function getDaysUntil(value) {
  const date = parseDbDate(value);
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((date.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

// Status derivation for a vaccine's due/expiration date (pet_vaccinations.expires_on).
// Returns a stable key (localized in the UI) + a color. No due date → treated as current.
export function getVaccineStatus(expiresOn) {
  const days = getDaysUntil(expiresOn);
  if (days === null) return { key: "current", color: "#81C784" };
  if (days < 0) return { key: "overdue", color: "#E57373" };
  if (days <= 30) return { key: "dueSoon", color: "#FFB74D" };
  return { key: "current", color: "#81C784" };
}

// Status derivation for a preventive's next_due date. No next-due → on schedule.
export function getPreventiveStatus(nextDue) {
  const days = getDaysUntil(nextDue);
  if (days === null) return { key: "onSchedule", color: "#81C784" };
  if (days < 0) return { key: "overdue", color: "#E57373" };
  if (days <= 3) return { key: "dueSoon", color: "#FFB74D" };
  return { key: "onSchedule", color: "#81C784" };
}
