// Money helpers for the services screen. The backend stores money in integer
// CENTS (price_cents / deposit_cents); the UI shows and edits dollars. Kept in a
// leaf module (no React) so both the screen and its tests can pin the conversion.

// Format integer cents as a "$12.50" display string. null/undefined → em-dash.
export function centsToCurrency(cents) {
  if (cents == null) return "—";
  return `$${(cents / 100).toFixed(2)}`;
}

// Seed a currency text input from stored cents. null/undefined → "" (so an
// untouched field diffs cleanly and the placeholder shows).
export function centsToInput(cents) {
  if (cents == null) return "";
  return (cents / 100).toFixed(2);
}

// Parse a dollars text input into integer cents. Returns:
//   { cents: undefined }            for a blank input (field omitted)
//   { cents: <non-negative int> }   for a valid amount
//   { error: <message> }            for anything else
// Mirrors invalidServiceFields server-side (non-negative integer cents).
export function dollarsToCents(raw) {
  const str = String(raw ?? "").trim().replace(/^\$/, "");
  if (str === "") return { cents: undefined };
  const value = Number(str);
  if (!Number.isFinite(value) || value < 0) {
    return { error: "Enter a valid amount (e.g. 12.50)" };
  }
  return { cents: Math.round(value * 100) };
}

// Parse a minutes text input into a positive integer. Returns the same shape as
// dollarsToCents. Mirrors invalidServiceFields (positive integer minutes).
export function parseDurationMin(raw) {
  const str = String(raw ?? "").trim();
  if (str === "") return { value: undefined };
  if (!/^\d+$/.test(str) || Number(str) <= 0) {
    return { error: "Enter a whole number of minutes" };
  }
  return { value: Number(str) };
}
