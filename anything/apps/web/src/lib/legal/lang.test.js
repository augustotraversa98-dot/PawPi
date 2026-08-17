import { describe, it, expect } from "vitest";
import { langFromSearch, buildPageMeta } from "./lang";

const TITLES = { es: "Política de Privacidad", en: "Privacy Policy" };
const DESCRIPTIONS = { es: "desc es", en: "desc en" };

describe("langFromSearch", () => {
  it("defaults to es (es-AR primary) when no param", () => {
    expect(langFromSearch("")).toBe("es");
    expect(langFromSearch(undefined)).toBe("es");
    expect(langFromSearch("?foo=bar")).toBe("es");
    expect(langFromSearch("?lang=es")).toBe("es");
  });

  it("returns en only for lang=en", () => {
    expect(langFromSearch("?lang=en")).toBe("en");
    expect(langFromSearch("?a=1&lang=en")).toBe("en");
  });

  it("ignores unknown lang values (falls back to es)", () => {
    expect(langFromSearch("?lang=fr")).toBe("es");
  });
});

describe("buildPageMeta", () => {
  it("es default: title/description in es, canonical without query", () => {
    const m = buildPageMeta({
      path: "/privacy",
      search: "",
      titles: TITLES,
      descriptions: DESCRIPTIONS,
    });
    expect(m[0]).toEqual({ title: "Política de Privacidad" });
    expect(m).toContainEqual({ name: "description", content: "desc es" });
    expect(m).toContainEqual({
      tagName: "link",
      rel: "canonical",
      href: "https://pawpi.info/privacy",
    });
  });

  it("en: title/description in en, canonical points at ?lang=en", () => {
    const m = buildPageMeta({
      path: "/privacy",
      search: "?lang=en",
      titles: TITLES,
      descriptions: DESCRIPTIONS,
    });
    expect(m[0]).toEqual({ title: "Privacy Policy" });
    expect(m).toContainEqual({ name: "description", content: "desc en" });
    expect(m).toContainEqual({
      tagName: "link",
      rel: "canonical",
      href: "https://pawpi.info/privacy?lang=en",
    });
  });

  it("always emits hreflang alternates for es-AR, en, and x-default", () => {
    const m = buildPageMeta({
      path: "/terms",
      search: "",
      titles: { es: "T", en: "T" },
      descriptions: { es: "d", en: "d" },
    });
    expect(m).toContainEqual({
      tagName: "link",
      rel: "alternate",
      hrefLang: "es-AR",
      href: "https://pawpi.info/terms",
    });
    expect(m).toContainEqual({
      tagName: "link",
      rel: "alternate",
      hrefLang: "en",
      href: "https://pawpi.info/terms?lang=en",
    });
    expect(m).toContainEqual({
      tagName: "link",
      rel: "alternate",
      hrefLang: "x-default",
      href: "https://pawpi.info/terms",
    });
  });
});
