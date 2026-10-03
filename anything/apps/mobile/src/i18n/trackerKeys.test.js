/* eslint-env jest */
const fs = require("fs");
const path = require("path");
const en = require("./locales/en.json");
const es = require("./locales/es.json");

// Guards the UX-audit regression where the Track dashboards/modals and the
// Reminders "Upcoming" tab rendered raw key strings: every literal t("...") key
// in these components must exist in BOTH locales.
const FILES = [
  "../components/Health/Weight",
  "../components/Health/Pee",
  "../components/Health/Poo",
  "../components/Health/Vomit",
  "../components/Health/FoodWater",
  "../components/Health/WalkActivity",
  "../components/Health/Reminders/UpcomingTab.jsx",
];

function walk(p) {
  const full = path.join(__dirname, p);
  if (fs.statSync(full).isFile()) return [full];
  return fs
    .readdirSync(full)
    .filter((f) => f.endsWith(".jsx") && !f.includes(".test."))
    .map((f) => path.join(full, f));
}

const has = (d, key) =>
  key.split(".").reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), d) !== undefined;

describe("tracker + upcoming-reminders i18n keys", () => {
  const keys = new Set();
  for (const f of FILES.flatMap(walk)) {
    const src = fs.readFileSync(f, "utf8");
    for (const m of src.matchAll(/\bt\(\s*"((?:trackers|health\.reminders\.upcoming)\.[A-Za-z0-9_.]+)"/g)) {
      keys.add(m[1]);
    }
  }

  test("finds keys to check", () => {
    expect(keys.size).toBeGreaterThan(50);
  });

  test.each([
    ["en", en],
    ["es", es],
  ])("%s has every key", (_name, dict) => {
    const missing = [...keys].filter(
      (k) => !has(dict, k) && !has(dict, `${k}_one`) && !has(dict, `${k}_other`),
    );
    expect(missing).toEqual([]);
  });
});
