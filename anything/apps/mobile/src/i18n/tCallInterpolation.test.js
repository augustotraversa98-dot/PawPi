// Guard: a t("some.key") call with NO variables must not target a string that needs them.
// "Share {{name}}'s week" once shipped as a button label with a literal "{{name}}" because the
// call site passed nothing. This statically scans the app source for single-argument t("literal")
// calls and fails if the EN or ES string contains a {{placeholder}}.

const fs = require("fs");
const path = require("path");
const en = require("./locales/en.json");
const es = require("./locales/es.json");

function lookup(catalog, key) {
  return key.split(".").reduce((o, p) => (o == null ? o : o[p]), catalog);
}
function sourceFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, out);
    else if (/\.(js|jsx)$/.test(entry.name) && !/\.test\./.test(entry.name)) out.push(full);
  }
  return out;
}

test("no single-argument t() call targets a string with {{placeholders}}", () => {
  const srcRoot = path.join(__dirname, "..");
  const callRe = /\bt\(\s*(["'])([\w.-]+)\1\s*\)/g;
  const offenders = [];
  for (const file of sourceFiles(srcRoot)) {
    const src = fs.readFileSync(file, "utf8");
    let m;
    while ((m = callRe.exec(src))) {
      for (const [lang, catalog] of [["en", en], ["es", es]]) {
        const value = lookup(catalog, m[2]);
        if (typeof value === "string" && /{{\s*\w+\s*}}/.test(value)) {
          offenders.push(`${path.relative(srcRoot, file)} → t("${m[2]}") [${lang}] needs variables`);
        }
      }
    }
  }
  expect(offenders).toEqual([]);
});
