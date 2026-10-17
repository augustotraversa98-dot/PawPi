// Copy regressions found by the 2026-10-17 consistency audit (docs/qa/consistency-audit-2026-10-17.md).
import fs from "fs";
import path from "path";
import en from "./locales/en.json";
import es from "./locales/es.json";

const read = (l) => fs.readFileSync(path.join(__dirname, "locales", `${l}.json`), "utf8");

// Walk every string value of a locale object.
function* values(obj, prefix = "") {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") yield* values(v, key);
    else if (typeof v === "string") yield [key, v];
  }
}

describe("locale files", () => {
  test.each(["en", "es"])("%s: ownerMenu is declared once (a second block silently shadowed 4 keys)", (l) => {
    expect(read(l).match(/^ {2}"ownerMenu": \{/gm)).toHaveLength(1);
  });

  test("ownerMenu keys the Profile menu uses exist in both languages", () => {
    for (const k of ["title", "settings", "logOut", "logOutConfirmTitle", "logOutConfirmBody"]) {
      expect(en.ownerMenu[k]).toBeTruthy();
      expect(es.ownerMenu[k]).toBeTruthy();
    }
  });

  test("every appAlerts key exists in both languages", () => {
    expect(Object.keys(es.appAlerts).sort()).toEqual(Object.keys(en.appAlerts).sort());
  });

  // Argentine voseo, not tuteo (the audit found ~12 slips). Whole-word, case-insensitive; only forms
  // that are unambiguous tuteo (never legitimate voseo or a noun).
  const TUTEO = /\b(puedes|podrás|tendrás|desliza|toca|recupera|elige|adjunta)\b/i;
  test("es.json has no tuteo imperatives/futures from the audited list", () => {
    const hits = [...values(es)].filter(([, v]) => TUTEO.test(v));
    expect(hits.map(([k]) => k)).toEqual([]);
  });
});
