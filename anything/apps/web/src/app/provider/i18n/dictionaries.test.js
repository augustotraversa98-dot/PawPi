// Every dictionary of the provider panel carries the same words in English and Spanish. A new file in this folder
// is picked up without registering it.
import { describe, it, expect } from "vitest";

const modules = import.meta.glob(["./*.js", "!./*.test.js"], { eager: true });

function flatten(node, prefix = "", out = {}) {
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object") flatten(value, path, out);
    else out[path] = value;
  }
  return out;
}
const placeholders = (text) => (text.match(/\{\w+\}/g) || []).sort();

describe("provider panel dictionaries", () => {
  it("are found", () => {
    expect(Object.keys(modules)).toContain("./shell.js");
  });

  describe.each(Object.entries(modules))("%s", (_file, module) => {
    const dictionary = module.default;
    const en = flatten(dictionary.en);
    const es = flatten(dictionary.es);
    const sameOnPurpose = module.SAME_IN_BOTH ?? [];

    it("exports { en, es } with the same keys", () => {
      expect(Object.keys(dictionary).sort()).toEqual(["en", "es"]);
      expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
    });

    it("has only non-empty text, with the same placeholders", () => {
      for (const key of Object.keys(en)) {
        for (const text of [en[key], es[key]]) {
          expect(typeof text, key).toBe("string");
          expect(text.trim(), key).not.toBe("");
        }
        expect(placeholders(es[key]), key).toEqual(placeholders(en[key]));
      }
    });

    it("has no untranslated Spanish (words that are the same in both are listed in SAME_IN_BOTH)", () => {
      const same = Object.keys(en).filter((key) => es[key] === en[key]);
      expect(same.sort()).toEqual([...sameOnPurpose].sort());
    });

    it("gives every plural both forms", () => {
      for (const key of Object.keys(en)) {
        if (!/(^|\.)(one|other)$/.test(key)) continue;
        const base = key.replace(/(one|other)$/, "");
        // A group with a `one` form is a plural (the offering sections also have an `other`).
        if (`${base}one` in en) expect(en, key).toHaveProperty([`${base}other`]);
      }
    });
  });
});
