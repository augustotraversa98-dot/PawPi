// Which language PawPi's pages for tag scanners, vets and businesses open in: the private-link pet pages
// (/p/tag, /p/card), the vet invite page, the shared record page, the sign-in / sign-up / password pages and the
// provider panel. One rule:
//   1. `?lang=es|en` in the address,
//   2. the choice this viewer made before with the ES / EN switch (remembered in this browser, see langStore.js),
//   3. the browser's FIRST preferred language: any `en*` → English; anything else, or none → Spanish (es-AR),
//      PawPi's primary language.
// No account or business setting takes part. Leaf module: no React, no browser globals.

export const DEFAULT_VISITOR_LANG = "es";

export const isVisitorLang = (value) => value === "es" || value === "en";

export function langParam(search) {
  const value = new URLSearchParams(search || "").get("lang");
  return isVisitorLang(value) ? value : null;
}

export function pickVisitorLang({ search, remembered, languages } = {}) {
  const asked = langParam(search);
  if (asked) return asked;
  if (isVisitorLang(remembered)) return remembered;
  const preferred = (languages || []).find(Boolean);
  return preferred && /^en($|[-_])/i.test(preferred) ? "en" : DEFAULT_VISITOR_LANG;
}

// The paths whose pages follow this rule. Case-insensitive because the router also matches /P/Tag/....
export function isVisitorLangPath(pathname) {
  return /^\/+(p|vet-invite|shared-record|provider|account\/(signin|signup|forgot-password|reset-password))(\/|$)/i.test(
    String(pathname || ""),
  );
}

export const htmlLang = (lang) => (lang === "en" ? "en" : "es-AR");
