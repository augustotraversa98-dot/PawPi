// Guard: no NEW hardcoded English literal may be rendered from a screen/component file.
//
// CLAUDE.md: all user-facing copy ships EN + ES. A literal like <Text>No routines yet</Text> or
// placeholder="e.g., Breakfast" bypasses i18n entirely, so parity/untranslated tests can never see it and
// Spanish users get a half-English screen. This test scans src/app and src/components with a heuristic
// (hardcodedEnglishScan.js: JSX text, user-facing JSX props, Alert/toast args, user-facing object keys) and
// fails on any finding not listed in hardcodedEnglish.allowlist.json.
//
// To fix a failure: move the string to en.json + es.json and render it with t(). Add to the allowlist ONLY
// for a legitimate exception (brand name, __DEV__-only text, data deliberately persisted in English), with
// a reason. Entries marked "baseline:" are known debt being burned down area by area — never add new ones.
const fs = require("fs");
const path = require("path");
const { scanSource } = require("./hardcodedEnglishScan");

const ROOT = path.join(__dirname, "..", "..");
const allowlist = require("./hardcodedEnglish.allowlist.json");

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "node_modules" && e.name !== "__tests__") walk(p, out);
    } else if (/\.(jsx|js|tsx|ts)$/.test(e.name) && !/\.test\./.test(e.name)) out.push(p);
  }
  return out;
}

const files = [...walk(path.join(ROOT, "src/app")), ...walk(path.join(ROOT, "src/components"))];
const findings = [];
for (const f of files) {
  findings.push(...scanSource(fs.readFileSync(f, "utf8"), path.relative(ROOT, f).split(path.sep).join("/")));
}
const keyOf = (file, text) => `${file}::${text}`;
const allowed = new Set(allowlist.map(([file, text]) => keyOf(file, text)));

describe("hardcoded English literals in screens/components", () => {
  test("every finding is translated via t() or explicitly allowlisted", () => {
    const offenders = findings
      .filter((x) => !allowed.has(keyOf(x.file, x.text)))
      .map((x) => `${x.file}:${x.line} [${x.kind}] ${JSON.stringify(x.text)}`);
    expect(offenders).toEqual([]);
  });

  test("the allowlist has no stale entries", () => {
    const seen = new Set(findings.map((x) => keyOf(x.file, x.text)));
    const stale = allowlist.filter(([file, text]) => !seen.has(keyOf(file, text))).map(([file, text]) => `${file} :: ${text}`);
    expect(stale).toEqual([]);
  });

  test("every allowlist entry states a reason", () => {
    expect(allowlist.filter((e) => !e[2] || !String(e[2]).trim()).map((e) => e[0] + " :: " + e[1])).toEqual([]);
  });

  test("the scanner itself flags what it should (self-test)", () => {
    const bad = `export default function X(){ const { t } = useTranslation(); return (<View><Text>No routines yet</Text><TextInput placeholder="e.g., Breakfast" accessibilityLabel="Close" /><Text>{ok ? "Save Changes" : "Create"}</Text><Text>{t("a.b")}</Text></View>); }`;
    const texts = scanSource(bad, "x.jsx").map((f) => f.text).sort();
    expect(texts).toEqual(["Close", "Create", "No routines yet", "Save Changes", "e.g., Breakfast"].sort());
    expect(scanSource(`export const A = () => <Text>{t("a.b")}</Text>;`, "y.jsx")).toEqual([]);
  });
});
