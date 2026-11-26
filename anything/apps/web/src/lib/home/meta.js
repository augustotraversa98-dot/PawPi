import { langFromSearch } from "@/lib/legal/lang";
import { APP_STORE_ID, SITE_URL, appStoreUrl } from "@/lib/brand/tokens";
import { HOME_COPY } from "@/lib/home/copy";

// <head> data for the public pages that must be in the SERVER-rendered HTML: link-preview crawlers and
// Safari's smart banner read the raw document and never run our scripts. components/brand/PublicHead.jsx
// renders it from root.tsx. Title/description/canonical/hreflang stay client-managed (useDocumentHead),
// so each tag has exactly one owner.

// The public marketing/legal pages.
const PUBLIC_PATHS = ["/", "/privacy", "/terms", "/eula", "/support"];

export function isPublicPath(pathname) {
  const path = String(pathname || "").replace(/(.)\/+$/, "$1");
  return PUBLIC_PATHS.includes(path);
}

// Pages under /p/ (pet tag, vet card) open for anyone holding the private link and show one pet's data,
// so they must never be indexed: public/robots.txt disallows /p/ and the server-rendered head carries
// noindex. Case-insensitive because the router also matches /P/Tag/....
export function isPrivateLinkPath(pathname) {
  return /^\/+p(\/|$)/i.test(String(pathname || ""));
}

// <html lang> for a public page; the rest of the web app is English.
export function documentLang(pathname, search) {
  if (!isPublicPath(pathname)) return "en";
  return langFromSearch(search) === "en" ? "en" : "es-AR";
}

export function appleItunesAppContent() {
  return `app-id=${APP_STORE_ID}`;
}

// Homepage Open Graph + Twitter card tags, with the self-hosted 1200x630 card.
export function buildHomeSocialMeta({ search }) {
  const lang = langFromSearch(search);
  const { title, description, hero } = HOME_COPY[lang];
  const url = lang === "en" ? `${SITE_URL}/?lang=en` : `${SITE_URL}/`;
  const image = `${SITE_URL}/images/home/og-${lang}.jpg`;

  return [
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: "PawPi" },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:url", content: url },
    { property: "og:locale", content: lang === "en" ? "en_US" : "es_AR" },
    { property: "og:image", content: image },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { property: "og:image:alt", content: hero.title.join(" ") },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: image },
  ];
}

// schema.org SoftwareApplication for the homepage, serialized for an inline JSON-LD block. Only facts we
// can stand behind: no ratings, reviews, prices or counts.
export function buildHomeJsonLd({ search }) {
  const lang = langFromSearch(search);
  const data = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "PawPi",
    description: HOME_COPY[lang].description,
    operatingSystem: "iOS",
    applicationCategory: "LifestyleApplication",
    url: lang === "en" ? `${SITE_URL}/?lang=en` : `${SITE_URL}/`,
    downloadUrl: appStoreUrl(lang),
  };
  // "<" is escaped so no value can ever close the surrounding <script> element.
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
