// Which language a private-link pet page opens in. Whoever scans a tag never chose anything, so the browser's
// preferred language decides (navigator.languages mirrors the Accept-Language header): any `es*` → Spanish,
// any other language → English, none reported → Spanish (PawPi's primary language). `?lang=es|en`, set by the
// in-page toggle, always wins so a reload keeps the visitor's choice.

export function pickVisitorLang({ search, languages } = {}) {
  const chosen = new URLSearchParams(search || "").get("lang");
  if (chosen === "es" || chosen === "en") return chosen;
  const preferred = (languages || []).find(Boolean);
  if (!preferred) return "es";
  return /^es($|[-_])/i.test(preferred) ? "es" : "en";
}
