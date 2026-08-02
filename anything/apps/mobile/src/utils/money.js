// One money formatter for the whole app so the SAME price never renders as two
// different currencies. Before this, provider.jsx printed price_cents as "$X" while
// shop.jsx printed the identical value as "ARS X" — the same catalog item looked
// like USD on one screen and ARS on another (a real trust/conversion bug).
//
// Prices are stored as integer cents plus an ISO currency code (DB default "ARS";
// provider_services rows carry no currency column and fall back to the default).
// We prefix the ISO code rather than a bare "$" because "$" is shared by USD, ARS,
// MXN and others — the code makes the currency unambiguous everywhere.
//
// Hermes-safe: no Intl/toLocaleString options (grouping is done manually).

export function formatMoney(cents, currency = "ARS") {
  if (cents == null || Number.isNaN(cents)) return null;
  const code = (currency || "ARS").toUpperCase();
  const negative = cents < 0;
  const fixed = (Math.abs(cents) / 100).toFixed(2);
  const [whole, frac] = fixed.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${code} ${grouped}.${frac}`;
}
