// en.json and es.json must expose IDENTICAL key sets (CLAUDE.md: all user-facing copy ships
// EN + ES). A missing Spanish key silently falls back to English in the app — exactly the
// "half-translated screen" bug class (QA 2026-10-16 bugs 05/06/11) — so fail the build instead.
//
// Note: the locale files intentionally contain a few duplicate JSON keys (last one wins at
// parse time); this compares the PARSED result, i.e. what the app actually uses.

const en = require("./locales/en.json");
const es = require("./locales/es.json");

function flatten(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}

const enFlat = flatten(en);
const esFlat = flatten(es);

test("en.json and es.json have identical key sets", () => {
  const missingInEs = Object.keys(enFlat).filter((k) => !(k in esFlat));
  const missingInEn = Object.keys(esFlat).filter((k) => !(k in enFlat));
  expect({ missingInEs, missingInEn }).toEqual({ missingInEs: [], missingInEn: [] });
});

test("no translation value is empty", () => {
  const empty = [...Object.entries(enFlat), ...Object.entries(esFlat)]
    .filter(([, v]) => typeof v === "string" && v.trim() === "")
    .map(([k]) => k);
  expect(empty).toEqual([]);
});

test("interpolation placeholders match between EN and ES", () => {
  const vars = (s) => (typeof s === "string" ? [...s.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort() : []);
  const mismatched = Object.keys(enFlat)
    .filter((k) => k in esFlat && JSON.stringify(vars(enFlat[k])) !== JSON.stringify(vars(esFlat[k])))
    .map((k) => k);
  expect(mismatched).toEqual([]);
});
