// enrichmentDraft — pure helpers for the magic-onboarding review (ticket 2.83). The enrichment
// draft (2.21 + 2.82) proposes services with free-form price/duration (e.g. "$45", "60 min"); these
// turn an edited proposed row into the integer fields the services CRUD route validates. No fake
// data: an unparseable/blank value becomes null/undefined, never an invented number.

// "$45.50" / "45,50" / 45 → 4550 cents. Blank/garbage → null.
export function priceToCents(raw) {
  if (raw == null) return null;
  const cleaned = String(raw).replace(/[^0-9.,]/g, "").replace(",", ".");
  if (cleaned === "") return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

// "60", "60 min", "1h" (best-effort: first integer) → 60. Blank/garbage → null.
export function durationToMin(raw) {
  if (raw == null) return null;
  const m = String(raw).match(/\d+/);
  if (!m) return null;
  const value = parseInt(m[0], 10);
  return Number.isInteger(value) && value > 0 ? value : null;
}

// Normalize the enrichment draft's services into editable review rows. Each row keeps the original
// free-form strings (so the provider can edit) plus a stable key. Drops nameless candidates.
export function toServiceRows(services) {
  return (services || [])
    .filter((s) => s && String(s.name || "").trim() !== "")
    .map((s, i) => ({
      key: `svc-${i}`,
      name: String(s.name).trim(),
      price: s.price != null ? String(s.price) : "",
      duration: s.duration != null ? String(s.duration) : "",
      description: s.description != null ? String(s.description) : "",
      selected: true,
    }));
}

// Build the POST body for the services CRUD route from an edited review row.
export function rowToServiceBody(row) {
  return {
    name: row.name.trim(),
    description: row.description?.trim() || undefined,
    price_cents: priceToCents(row.price),
    duration_min: durationToMin(row.duration),
  };
}
