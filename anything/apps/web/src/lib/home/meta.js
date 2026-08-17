import { buildPageMeta, langFromSearch } from "@/lib/legal/lang";
import { SITE_URL } from "@/lib/brand/tokens";

// Homepage <head>: the shared title/description/canonical/hreflang set plus
// Open Graph + Twitter card tags for social sharing. Applied client-side by
// useDocumentHead (this app doesn't wire route-module meta). No og:image yet —
// there's no hosted raster brand asset, and an SVG/broken image is worse than a
// clean summary card; add one later and set og:image + twitter:card=summary_large_image.
export function buildHomeMeta({ search, titles, descriptions }) {
  const lang = langFromSearch(search);
  const base = buildPageMeta({ path: "/", search, titles, descriptions });
  const url = lang === "en" ? `${SITE_URL}/?lang=en` : `${SITE_URL}/`;

  return [
    ...base,
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: "PawPi" },
    { property: "og:title", content: titles[lang] },
    { property: "og:description", content: descriptions[lang] },
    { property: "og:url", content: url },
    { property: "og:locale", content: lang === "en" ? "en_US" : "es_AR" },
    { name: "twitter:card", content: "summary" },
    { name: "twitter:title", content: titles[lang] },
    { name: "twitter:description", content: descriptions[lang] },
  ];
}
