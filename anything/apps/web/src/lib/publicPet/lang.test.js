import { describe, it, expect } from "vitest";
import { htmlLang, isVisitorLangPath, pickVisitorLang } from "./lang";

describe("pickVisitorLang", () => {
  it.each(["en", "en-US", "en-GB", "EN-us", "en_AU"])("%s → English", (tag) => {
    expect(pickVisitorLang({ languages: [tag] })).toBe("en");
  });

  it.each(["es", "es-AR", "es-ES", "es-419", "ES-ar", "es_MX", "pt-BR", "fr", "de-DE", "eng", "zh-CN"])(
    "%s → Spanish",
    (tag) => {
      expect(pickVisitorLang({ languages: [tag] })).toBe("es");
    },
  );

  it("follows the FIRST preference", () => {
    expect(pickVisitorLang({ languages: ["en-GB", "es-AR"] })).toBe("en");
    expect(pickVisitorLang({ languages: ["es-AR", "en-US"] })).toBe("es");
    expect(pickVisitorLang({ languages: ["fr-FR", "en-US"] })).toBe("es");
  });

  it("falls back to Spanish when the browser reports nothing", () => {
    expect(pickVisitorLang({ languages: [] })).toBe("es");
    expect(pickVisitorLang({ languages: [undefined] })).toBe("es");
    expect(pickVisitorLang()).toBe("es");
  });

  it("lets a remembered choice win over the browser", () => {
    expect(pickVisitorLang({ remembered: "en", languages: ["es-AR"] })).toBe("en");
    expect(pickVisitorLang({ remembered: "es", languages: ["en-US"] })).toBe("es");
    expect(pickVisitorLang({ remembered: "fr", languages: ["en-US"] })).toBe("en");
  });

  it("lets ?lang= win over everything", () => {
    expect(pickVisitorLang({ search: "?lang=en", remembered: "es", languages: ["es-AR"] })).toBe("en");
    expect(pickVisitorLang({ search: "?lang=es", remembered: "en", languages: ["en-US"] })).toBe("es");
    expect(pickVisitorLang({ search: "?lang=xx", languages: ["en-US"] })).toBe("en");
  });
});

describe("isVisitorLangPath", () => {
  it.each([
    "/provider",
    "/provider/bookings",
    "/p/tag/abc",
    "/P/Card/abc",
    "/vet-invite",
    "/vet-invite/",
    "/account/signin",
    "/account/signup",
    "/account/forgot-password",
    "/account/reset-password/",
  ])(
    "%s follows the viewer",
    (path) => expect(isVisitorLangPath(path)).toBe(true),
  );

  it.each(["/", "/privacy", "/providers", "/account/logout", "/admin/moderation", "/vet-invites", "/pets", undefined])(
    "%s does not",
    (path) => expect(isVisitorLangPath(path)).toBe(false),
  );
});

describe("htmlLang", () => {
  it("is es-AR for Spanish", () => {
    expect(htmlLang("es")).toBe("es-AR");
    expect(htmlLang("en")).toBe("en");
  });
});
