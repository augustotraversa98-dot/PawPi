// Language resolution for the public pages. es-AR is PRIMARY (default); en is the
// secondary toggle, selected via the `?lang=en` query param. Kept as a leaf module
// so both the meta() exports (server) and components (client) share one rule.
import { SITE_URL } from "@/lib/brand/tokens";

export const DEFAULT_LANG = "es";

export function langFromSearch(search) {
  const raw = new URLSearchParams(search || "").get("lang");
  return raw === "en" ? "en" : "es";
}

// Build the SEO head descriptors (title, description, canonical, hreflang
// alternates) for a public page. Pure — unit-tested without a router.
export function buildPageMeta({ path, search, titles, descriptions }) {
  const lang = langFromSearch(search);
  const base = `${SITE_URL}${path}`;
  const enUrl = `${base}?lang=en`;
  const canonical = lang === "en" ? enUrl : base;
  return [
    { title: titles[lang] },
    { name: "description", content: descriptions[lang] },
    { tagName: "link", rel: "canonical", href: canonical },
    { tagName: "link", rel: "alternate", hrefLang: "es-AR", href: base },
    { tagName: "link", rel: "alternate", hrefLang: "en", href: enUrl },
    { tagName: "link", rel: "alternate", hrefLang: "x-default", href: base },
  ];
}
