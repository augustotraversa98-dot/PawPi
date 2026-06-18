/**
 * Guard test (ticket 2.55): the hardcoded demo name "Phoebe" must never leak
 * back into shipped (non-test) source. Test fixtures may still use it, so this
 * scan deliberately skips *.test.* files.
 */
const fs = require("fs");
const path = require("path");

const SRC_ROOT = __dirname;
const CODE_EXT = new Set([".js", ".jsx", ".ts", ".tsx"]);

function collectSourceFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectSourceFiles(full));
    } else if (
      CODE_EXT.has(path.extname(entry.name)) &&
      !/\.test\.[jt]sx?$/.test(entry.name)
    ) {
      out.push(full);
    }
  }
  return out;
}

describe("no hardcoded demo names in shipped source", () => {
  it('contains no "Phoebe" literal outside test fixtures', () => {
    const offenders = collectSourceFiles(SRC_ROOT).filter((file) =>
      /phoebe/i.test(fs.readFileSync(file, "utf8")),
    );
    expect(offenders.map((f) => path.relative(SRC_ROOT, f))).toEqual([]);
  });
});
