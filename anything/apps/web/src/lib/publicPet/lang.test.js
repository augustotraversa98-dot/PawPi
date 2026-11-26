import { describe, it, expect } from "vitest";
import { pickVisitorLang } from "./lang";

describe("pickVisitorLang", () => {
  it.each(["es", "es-AR", "es-ES", "es-419", "ES-ar", "es_MX"])("%s → Spanish", (tag) => {
    expect(pickVisitorLang({ languages: [tag] })).toBe("es");
  });

  it.each(["en-US", "en", "pt-BR", "fr", "est", "de-DE"])("%s → English", (tag) => {
    expect(pickVisitorLang({ languages: [tag] })).toBe("en");
  });

  it("follows the FIRST preference", () => {
    expect(pickVisitorLang({ languages: ["en-GB", "es-AR"] })).toBe("en");
    expect(pickVisitorLang({ languages: ["es-AR", "en-US"] })).toBe("es");
  });

  it("falls back to Spanish when the browser reports nothing", () => {
    expect(pickVisitorLang({ languages: [] })).toBe("es");
    expect(pickVisitorLang({ languages: [undefined] })).toBe("es");
    expect(pickVisitorLang()).toBe("es");
  });

  it("lets ?lang= win over the browser", () => {
    expect(pickVisitorLang({ search: "?lang=en", languages: ["es-AR"] })).toBe("en");
    expect(pickVisitorLang({ search: "?lang=es", languages: ["en-US"] })).toBe("es");
    expect(pickVisitorLang({ search: "?lang=xx", languages: ["en-US"] })).toBe("en");
  });
});
