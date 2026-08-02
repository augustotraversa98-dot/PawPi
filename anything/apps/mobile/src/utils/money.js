// One money formatter for the whole app so the SAME price never renders two ways.
//
// PawPi launches in Argentina; the DB default currency is ARS. Argentine users read
// pesos as a bare "$" with es-AR grouping ("." for thousands, "," for decimals),
// e.g. $1.500 — an "ARS" prefix reads as foreign money. So ARS is shown as "$" and
// decimals are hidden when the amount is whole (the common case). A non-ARS currency
// is rare here (a provider could set USD); to stay unambiguous it keeps the ISO-code
// prefix ("USD 49.00"). Prices are integer cents; provider_services rows carry no
// currency column and fall back to the ARS default.
//
// Hermes-safe: no Intl/toLocaleString (grouping is done manually).

export function formatMoney(cents, currency = "ARS") {
  if (cents == null || Number.isNaN(cents)) return null;
  const code = (currency || "ARS").toUpperCase();
  const sign = cents < 0 ? "-" : "";
  const absCents = Math.abs(cents);
  const whole = Math.trunc(absCents / 100);
  const frac = absCents % 100;

  if (code === "ARS") {
    const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    const decimals = frac === 0 ? "" : `,${String(frac).padStart(2, "0")}`;
    return `${sign}$${grouped}${decimals}`;
  }

  // Non-ARS: keep the ISO code so a foreign price is never mistaken for pesos.
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}${code} ${grouped}.${String(frac).padStart(2, "0")}`;
}
