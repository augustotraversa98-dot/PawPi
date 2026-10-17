// Ratchet from the 2026-10-17 consistency audit (V-05): a quoted hex that is byte-identical to an
// approved COLORS token must be written as the token, so the palette stays single-sourced.
// (Off-palette hexes are tracked separately in docs/qa/consistency-audit-2026-10-17.md and are not
// asserted here.)
import fs from "fs";
import path from "path";
import { COLORS } from "./colors";

const SRC = path.join(__dirname, "..");
const SKIP_DIRS = new Set(["constants", "__create", "i18n", "node_modules"]);
const TOKENS = new Map(Object.entries(COLORS).map(([name, hex]) => [hex.toLowerCase(), name]));

function* files(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) yield* files(path.join(dir, e.name));
    } else if (/\.(js|jsx)$/.test(e.name) && !/\.test\./.test(e.name)) {
      yield path.join(dir, e.name);
    }
  }
}

test("no quoted hex literal duplicates a COLORS token", () => {
  const offenders = [];
  for (const f of files(SRC)) {
    const lines = fs.readFileSync(f, "utf8").split("\n");
    lines.forEach((line, i) => {
      for (const m of line.matchAll(/["'](#[0-9A-Fa-f]{6})["']/g)) {
        const name = TOKENS.get(m[1].toLowerCase());
        if (name) offenders.push(`${path.relative(SRC, f)}:${i + 1} ${m[1]} -> COLORS.${name}`);
      }
    });
  }
  expect(offenders).toEqual([]);
});
