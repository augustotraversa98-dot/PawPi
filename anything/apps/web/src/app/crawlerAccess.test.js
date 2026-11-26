import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import PublicHead from "@/components/brand/PublicHead";

// What crawlers may reach: public/robots.txt, public/sitemap.xml and the noindex tag on the private-link
// pet pages. /p/ pages show one pet's data to whoever holds the link, so they stay disallowed AND noindex.
const root = resolve(__dirname, "../..");
const read = (p) => readFileSync(resolve(root, p), "utf8");

const SITE = "https://www.pawpi.info";
const PUBLIC_PAGES = ["/", "/privacy", "/terms", "/eula", "/support"];
const DISALLOWED = ["/api/", "/account/", "/provider", "/admin", "/p/"];

const robots = read("public/robots.txt");
const directives = robots
  .split("\n")
  .map((line) => line.replace(/#.*/, "").trim())
  .filter(Boolean)
  .map((line) => {
    const colon = line.indexOf(":");
    return [line.slice(0, colon).toLowerCase(), line.slice(colon + 1).trim()];
  });
const values = (name) => directives.filter(([k]) => k === name).map(([, v]) => v);
const rules = directives.filter(([k]) => k === "allow" || k === "disallow");

// RFC 9309: the longest matching rule wins (Allow on a tie).
function allowedByLongestMatch(path) {
  const hits = rules
    .filter(([, prefix]) => path.startsWith(prefix))
    .sort((a, b) => b[1].length - a[1].length || (a[0] === "allow" ? -1 : 1));
  return hits.length === 0 || hits[0][0] === "allow";
}
// Older parsers (Python's robotparser among them) take the first matching line instead.
function allowedByFirstMatch(path) {
  const hit = rules.find(([, prefix]) => path.startsWith(prefix));
  return !hit || hit[0] === "allow";
}
const PARSERS = [
  ["longest match", allowedByLongestMatch],
  ["first match", allowedByFirstMatch],
];

describe("robots.txt", () => {
  it("states the three content signals on one line", () => {
    expect(values("content-signal")).toEqual([
      expect.stringMatching(/^search=yes, ai-input=yes, ai-train=(yes|no)$/),
    ]);
  });

  it("has a single group, for every crawler", () => {
    expect(values("user-agent")).toEqual(["*"]);
  });

  it("points at the sitemap", () => {
    expect(values("sitemap")).toEqual([`${SITE}/sitemap.xml`]);
  });

  it("disallows exactly the private areas, never the whole site", () => {
    expect(values("disallow")).toEqual(DISALLOWED);
    expect(robots).not.toMatch(/^\s*disallow:\s*\/\s*(#.*)?$/im);
    expect(values("allow")).toEqual(["/.well-known/", "/"]);
  });

  describe.each(PARSERS)("read by %s", (_name, allowed) => {
    it.each([
      ...PUBLIC_PAGES,
      "/privacy?lang=en",
      "/sitemap.xml",
      "/.well-known/api-catalog",
      "/.well-known/agent-skills/index.json",
      "/images/home/og-es.jpg",
      "/assets/entry.client.js",
    ])("%s is crawlable", (path) => {
      expect(allowed(path)).toBe(true);
    });

    it.each([
      "/api/health/deep",
      "/api/public/emergency/tag/abc",
      "/account/signin",
      "/account/reset-password?token=abc",
      "/provider",
      "/provider/pets/1/record",
      "/admin/moderation",
      "/p/tag/abc",
      "/p/card/abc",
    ])("%s is not crawlable", (path) => {
      expect(allowed(path)).toBe(false);
    });
  });
});

describe("sitemap.xml", () => {
  const doc = new DOMParser().parseFromString(read("public/sitemap.xml"), "application/xml");
  const entries = [...doc.getElementsByTagName("url")].map((url) => ({
    loc: url.getElementsByTagName("loc")[0].textContent,
    alternates: Object.fromEntries(
      [...url.getElementsByTagName("xhtml:link")].map((link) => [
        link.getAttribute("hreflang"),
        link.getAttribute("href"),
      ]),
    ),
  }));
  const locs = entries.map((e) => e.loc);

  it("lists every public page once per language, and nothing else", () => {
    const expected = PUBLIC_PAGES.flatMap((p) => [`${SITE}${p}`, `${SITE}${p}?lang=en`]);
    expect(locs).toEqual(expected);
  });

  it("gives each URL the same reciprocal hreflang set", () => {
    for (const { loc, alternates } of entries) {
      const base = loc.replace("?lang=en", "");
      expect(alternates).toEqual({
        "es-AR": base,
        en: `${base}?lang=en`,
        "x-default": base,
      });
      for (const href of Object.values(alternates)) expect(locs).toContain(href);
    }
  });

  it("lists no disallowed path, and only pages that exist", () => {
    for (const loc of locs) {
      const { pathname, search } = new URL(loc);
      for (const [, allowed] of PARSERS) expect(allowed(pathname + search)).toBe(true);
      expect(existsSync(resolve(root, `src/app${pathname.replace(/\/$/, "")}/page.jsx`))).toBe(true);
    }
  });
});

describe("private-link pet pages", () => {
  const NOINDEX = '<meta name="robots" content="noindex, nofollow"/>';
  const head = (pathname) =>
    renderToStaticMarkup(createElement(PublicHead, { pathname, search: "" }));

  // Every page file under src/app/p, so a new one is covered without editing this test.
  const pageFiles = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const file = resolve(dir, entry.name);
      if (entry.isDirectory()) return pageFiles(file);
      return entry.name === "page.jsx" ? [file] : [];
    });
  const appDir = resolve(root, "src/app");
  const paths = pageFiles(resolve(appDir, "p")).map(
    (file) => `/${relative(appDir, file).replace(/\/page\.jsx$/, "").replace(/\[[^\]]+\]/g, "abc")}`,
  );

  it("covers the tag and vet card pages", () => {
    expect(paths).toEqual(expect.arrayContaining(["/p/card/abc", "/p/tag/abc"]));
  });

  it.each(paths)("%s is disallowed and noindex", (path) => {
    for (const [, allowed] of PARSERS) expect(allowed(path)).toBe(false);
    expect(head(path)).toBe(NOINDEX);
  });

  it("is noindex however the URL is cased or slashed", () => {
    expect(head("/P/Tag/abc")).toBe(NOINDEX);
    expect(head("/p/card/abc/")).toBe(NOINDEX);
    expect(head("//p/tag/abc")).toBe(NOINDEX);
  });

  it.each(PUBLIC_PAGES)("%s stays indexable", (path) => {
    expect(head(path)).not.toContain('name="robots"');
  });

  it("is rendered by the root layout's <head>", () => {
    expect(read("src/app/root.tsx")).toMatch(/<head>[\s\S]*<PublicHead pathname=\{pathname\}[\s\S]*<\/head>/);
  });
});
