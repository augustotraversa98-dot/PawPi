import { describe, it, expect, vi } from "vitest";
import { existsSync, readdirSync, statSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/utils/useUser", () => ({ default: () => ({ user: null, loading: false }) }));

import HomePage from "./page";
import PrivacyPage from "./privacy/page";
import TermsPage from "./terms/page";
import EulaPage from "./eula/page";
import SupportPage from "./support/page";
import PublicHead from "@/components/brand/PublicHead";
import { appStoreUrl } from "@/lib/brand/tokens";
import { HOME_COPY, HOME_IMAGES, SECTION_IDS } from "@/lib/home/copy";
import { documentLang } from "@/lib/home/meta";

const root = resolve(__dirname, "../..");
const PAGES = [
  ["/", HomePage],
  ["/privacy", PrivacyPage],
  ["/terms", TermsPage],
  ["/eula", EulaPage],
  ["/support", SupportPage],
];
const LANGS = [
  ["es", ""],
  ["en", "?lang=en"],
];

function renderAt(Page, url) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Page />
    </MemoryRouter>,
  );
}

describe.each(LANGS)("public pages (%s)", (lang, search) => {
  it.each(PAGES)("%s: no 'coming soon' copy is left", (path, Page) => {
    renderAt(Page, `${path}${search}`);
    expect(document.body.textContent).not.toMatch(/coming soon|pr[oó]ximamente/i);
  });

  it.each(PAGES)("%s: footer has every group, and its links keep the language", (path, Page) => {
    renderAt(Page, `${path}${search}`);
    const footer = within(screen.getByRole("contentinfo"));
    const L =
      lang === "en"
        ? {
            groups: ["Explore", "Business", "Legal & help"],
            links: [
              ["Features", `/${search}#features`],
              ["Screenshots", `/${search}#screenshots`],
              ["Who it's for", `/${search}#audiences`],
              ["List your business", `/account/signup${search}`],
              ["Business sign in", `/account/signin${search}`],
              ["Privacy", `/privacy${search}`],
              ["Terms", `/terms${search}`],
              ["EULA", `/eula${search}`],
              ["Support", `/support${search}`],
            ],
            download: "Download",
          }
        : {
            groups: ["Explorá", "Negocios", "Legal y ayuda"],
            links: [
              ["Funciones", "/#features"],
              ["Pantallas", "/#screenshots"],
              ["Para quién es", "/#audiences"],
              ["Listá tu negocio", "/account/signup"],
              ["Iniciar sesión de negocio", "/account/signin"],
              ["Privacidad", "/privacy"],
              ["Términos", "/terms"],
              ["EULA", "/eula"],
              ["Soporte", "/support"],
            ],
            download: "Descargar",
          };

    for (const name of L.groups) {
      expect(footer.getByRole("navigation", { name })).toBeInTheDocument();
    }
    for (const [name, href] of L.links) {
      expect(footer.getByRole("link", { name })).toHaveAttribute("href", href);
    }
    expect(footer.getByRole("link", { name: L.download })).toHaveAttribute(
      "href",
      appStoreUrl(lang),
    );
    expect(footer.getByRole("link", { name: "support@pawpi.info" })).toHaveAttribute(
      "href",
      "mailto:support@pawpi.info",
    );
    expect(footer.getByText(/© 2026 PawPi · Augusto Traversa/)).toBeInTheDocument();
    // Apple's own English credit lines, in both languages.
    expect(
      footer.getByText(
        "Apple and the Apple logo are trademarks of Apple Inc., registered in the U.S. and other countries. App Store is a service mark of Apple Inc.",
      ),
    ).toHaveAttribute("lang", "en");
  });

  it.each(PAGES)("%s: official badges only where allowed; header and footer use the button", (path, Page) => {
    renderAt(Page, `${path}${search}`);
    const badges = (scope) => [...scope.querySelectorAll('img[src^="/badges/"]')];
    const expected = { "/": 2, "/support": 1 }[path] ?? 0;
    expect(badges(document.body)).toHaveLength(expected);

    const label = lang === "en" ? "Download" : "Descargar";
    for (const landmark of [screen.getByRole("banner"), screen.getByRole("contentinfo")]) {
      expect(badges(landmark)).toHaveLength(0);
      expect(within(landmark).getByRole("link", { name: label })).toHaveAttribute(
        "href",
        appStoreUrl(lang),
      );
    }
  });

  it("homepage: anchor sections exist", () => {
    renderAt(HomePage, `/${search}`);
    for (const id of Object.values(SECTION_IDS)) {
      expect(document.getElementById(id)).not.toBeNull();
    }
  });

  it("homepage: every image has alt text, fixed dimensions and a self-hosted file", () => {
    const { container } = renderAt(HomePage, `/${search}`);
    const images = [...container.querySelectorAll("img")];
    // 9 screenshots + the 2 badges.
    expect(images).toHaveLength(Object.keys(HOME_IMAGES).length + 2);
    for (const img of images) {
      expect(img.getAttribute("alt")?.trim()).toBeTruthy();
      expect(Number(img.getAttribute("width"))).toBeGreaterThan(0);
      expect(Number(img.getAttribute("height"))).toBeGreaterThan(0);
      const src = img.getAttribute("src");
      expect(src).toMatch(/^\/(?!\/)/);
      expect(existsSync(resolve(root, `public${src}`))).toBe(true);
    }
  });

  it("homepage: all nine screenshots, hero eager and the rest lazy", () => {
    const { container } = renderAt(HomePage, `/${search}`);
    const shots = [...container.querySelectorAll('img[src^="/images/home/"]')];
    expect(shots.map((img) => img.getAttribute("src")).sort()).toEqual(
      Object.values(HOME_IMAGES)
        .map((i) => i.src)
        .sort(),
    );
    expect(shots[0].getAttribute("src")).toBe(HOME_IMAGES.profile.src);
    expect(shots[0]).toHaveAttribute("loading", "eager");
    for (const img of shots.slice(1)) {
      expect(img).toHaveAttribute("loading", "lazy");
      expect(img).toHaveAttribute("decoding", "async");
    }
  });

  it("homepage: keeps the non-diagnostic health wording", () => {
    renderAt(HomePage, `/${search}`);
    const wording =
      lang === "en"
        ? "It does not diagnose or replace professional veterinary care."
        : "No diagnostica ni reemplaza la atención veterinaria profesional.";
    expect(screen.getByText((text) => text.includes(wording))).toBeInTheDocument();
  });

  it("homepage: every App Store link is the one for this language", () => {
    const { container } = renderAt(HomePage, `/${search}`);
    const links = [...container.querySelectorAll('a[href*="apps.apple.com"]')];
    // header button, hero badge, dog-owner card, closing badge, footer button
    expect(links).toHaveLength(5);
    for (const a of links) expect(a).toHaveAttribute("href", appStoreUrl(lang));
  });

  it("support: has the 'get the app' block", () => {
    renderAt(SupportPage, `/support${search}`);
    const title = lang === "en" ? "Get the app" : "Descargá la app";
    const block = screen.getByRole("complementary", { name: title });
    expect(within(block).getByRole("link")).toHaveAttribute("href", appStoreUrl(lang));
  });
});

describe("homepage copy", () => {
  it("has the same shape in both languages", () => {
    const shape = (v) =>
      Array.isArray(v)
        ? v.map(shape)
        : v && typeof v === "object"
          ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shape(x)]))
          : "value";
    const strip = (c) => ({ ...c, hero: { ...c.hero, screensNote: null } });
    expect(shape(strip(HOME_COPY.en))).toEqual(shape(strip(HOME_COPY.es)));
  });
});

describe("server-rendered head", () => {
  const html = (pathname, search = "") =>
    renderToStaticMarkup(<PublicHead pathname={pathname} search={search} />);

  it.each(PAGES.map(([path]) => path))("%s carries the Safari smart banner", (path) => {
    expect(html(path)).toContain('<meta name="apple-itunes-app" content="app-id=6785949610"/>');
  });

  it("stays out of the rest of the web app", () => {
    expect(html("/provider")).toBe("");
    expect(html("/account/signin")).toBe("");
    expect(documentLang("/account/logout", "")).toBe("en");
    // The sign-in pages carry no public head, but they do speak the viewer's language (Spanish unless asked).
    expect(documentLang("/account/signin", "")).toBe("es-AR");
  });

  it("sets <html lang> from the page language", () => {
    expect(documentLang("/", "")).toBe("es-AR");
    expect(documentLang("/privacy/", "")).toBe("es-AR");
    expect(documentLang("/support", "?lang=en")).toBe("en");
  });

  it("starts the provider panel and the private-link pages in Spanish, unless ?lang or the viewer says English", () => {
    for (const path of ["/provider", "/provider/bookings", "/p/tag/abc", "/vet-invite"]) {
      expect(documentLang(path, "")).toBe("es-AR");
      expect(documentLang(path, "?lang=en")).toBe("en");
      expect(documentLang(path, "", "en")).toBe("en");
      expect(documentLang(path, "?lang=en", "es")).toBe("es-AR");
    }
  });

  it.each(LANGS)("homepage (%s): social card and honest JSON-LD", (lang, search) => {
    const doc = new DOMParser().parseFromString(`<head>${html("/", search)}</head>`, "text/html");
    const meta = (attr, name) =>
      doc.querySelector(`meta[${attr}="${name}"]`)?.getAttribute("content");

    const image = `https://www.pawpi.info/images/home/og-${lang}.jpg`;
    expect(meta("property", "og:image")).toBe(image);
    expect(meta("name", "twitter:card")).toBe("summary_large_image");
    expect(existsSync(resolve(root, `public/images/home/og-${lang}.jpg`))).toBe(true);

    const ld = JSON.parse(doc.querySelector('script[type="application/ld+json"]').textContent);
    expect(ld).toMatchObject({
      "@type": "SoftwareApplication",
      name: "PawPi",
      operatingSystem: "iOS",
      downloadUrl: appStoreUrl(lang),
    });
    for (const key of ["aggregateRating", "review", "offers", "interactionStatistic"]) {
      expect(ld).not.toHaveProperty(key);
    }
  });

  it("legal pages carry no homepage social tags", () => {
    expect(html("/privacy")).not.toContain("og:image");
    expect(html("/privacy")).not.toContain("ld+json");
  });
});

describe("assets and links", () => {
  it("web screenshots stay small", () => {
    for (const { src } of Object.values(HOME_IMAGES)) {
      expect(statSync(resolve(root, `public${src}`)).size).toBeLessThanOrEqual(120_000);
    }
  });

  it("nobody hardcodes the App Store URL outside tokens.js", () => {
    const offenders = [];
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const file = resolve(dir, entry.name);
        if (entry.isDirectory()) walk(file);
        else if (/\.(jsx?|tsx?|md)$/.test(entry.name) && !/\.test\./.test(entry.name)) {
          if (/apps\.apple\.com\/[a-z]{2}\/app\/pawpi|6785949610/.test(readFileSync(file, "utf8"))) {
            offenders.push(file.slice(root.length + 1));
          }
        }
      }
    };
    walk(resolve(root, "src"));
    expect(offenders).toEqual(["src/lib/brand/tokens.js"]);
  });
});
