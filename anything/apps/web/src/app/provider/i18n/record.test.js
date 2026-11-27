import { describe, it, expect } from "vitest";
import recordCopy from "./record";
import { formatRecordDate, recordFileHref } from "../lib/record";
import { RECORD_SECTIONS } from "../../api/utils/careAccess";

function flatten(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "object") flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}
const en = flatten(recordCopy.en);
const es = flatten(recordCopy.es);
const placeholders = (s) => (s.match(/\{\w+\}/g) || []).sort();

describe("clinical record copy", () => {
  it("has the same keys in both languages", () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
  });

  it("has no empty or untranslated string, and keeps placeholders", () => {
    for (const key of Object.keys(en)) {
      expect(es[key].trim(), key).not.toBe("");
      expect(es[key], key).not.toBe(en[key]);
      expect(placeholders(es[key]), key).toEqual(placeholders(en[key]));
    }
  });

  it("names every section the server can share", () => {
    for (const lang of ["en", "es"]) {
      expect(Object.keys(recordCopy[lang].sections)).toEqual(RECORD_SECTIONS);
    }
  });
});

describe("formatRecordDate", () => {
  it("is YYYY-MM-DD in English and dd/MM/yyyy in Spanish", () => {
    expect(formatRecordDate("2026-05-01T12:00:00Z", "en")).toBe("2026-05-01");
    expect(formatRecordDate("2026-05-01", "es")).toBe("01/05/2026");
    expect(formatRecordDate(null, "es")).toBe("—");
  });
});

describe("recordFileHref", () => {
  it("opens a private key through the media route as this provider", () => {
    expect(recordFileHref("pets/5/a.pdf", 3)).toBe(
      "/api/media?key=pets%2F5%2Fa.pdf&providerId=3",
    );
  });

  it("opens an https address as it is", () => {
    expect(recordFileHref("https://files.example.com/a.pdf", 3)).toBe(
      "https://files.example.com/a.pdf",
    );
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,x",
    "file:///var/a.jpg",
    "pets/5/../a.pdf",
    "",
    null,
  ])("does not link %s", (value) => {
    expect(recordFileHref(value, 3)).toBeNull();
  });
});
