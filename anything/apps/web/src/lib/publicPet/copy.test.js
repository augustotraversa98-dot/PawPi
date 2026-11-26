import { describe, it, expect } from "vitest";
import { PET_PAGE_COPY } from "./copy";

function flatten(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "object") flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}
const es = flatten(PET_PAGE_COPY.es);
const en = flatten(PET_PAGE_COPY.en);
const placeholders = (s) => (s.match(/\{\w+\}/g) || []).sort();

describe("pet page copy", () => {
  it("has the same keys in both languages", () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
  });

  // Argentine Spanish uses the same word.
  const SAME_ON_PURPOSE = ["microchip"];

  it("has no empty or untranslated string, and keeps placeholders", () => {
    for (const key of Object.keys(en)) {
      expect(es[key].trim(), key).not.toBe("");
      if (!SAME_ON_PURPOSE.includes(key)) expect(es[key], key).not.toBe(en[key]);
      expect(placeholders(es[key]), key).toEqual(placeholders(en[key]));
    }
  });

  it.each(["es", "en"])("tells the finder to include a phone or email (%s)", (lang) => {
    const { relayHint, relayPlaceholder } = PET_PAGE_COPY[lang].tag;
    for (const text of [relayHint, relayPlaceholder]) {
      expect(text).toMatch(/tel[eé]fono|phone/i);
      expect(text).toMatch(/email/i);
    }
  });
});
