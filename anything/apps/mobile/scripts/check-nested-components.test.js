/**
 * @jest-environment node
 */
// Self-check of `npm run lint:components`: runs the real Biome binary with the app's biome.json on small throwaway
// projects and proves that a new component declared inside a component fails the check.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { run, APP_ROOT } = require("./check-nested-components");

const EMPTY = { components: {}, unparsed: {} };
const CLEAN = "export default function Screen() { return <View />; }\n";
const NESTED_FUNCTION = `export default function Screen() {
  function Inner() { return <View />; }
  return <Inner />;
}
`;
const NESTED_ARROW = `export default function Screen() {
  const Inner = () => <View />;
  return <Inner />;
}
`;

const created = [];
afterAll(() => created.forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

function check(files, baseline = EMPTY) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nested-components-"));
  created.push(root);
  fs.copyFileSync(path.join(APP_ROOT, "biome.json"), path.join(root, "biome.json"));
  for (const [file, source] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), source);
  }
  const baselinePath = path.join(root, "baseline.json");
  fs.writeFileSync(baselinePath, JSON.stringify(baseline));
  const lines = [];
  const code = run({ root, baselinePath, github: false, log: (line) => lines.push(line) });
  return { code, output: lines.join("\n") };
}

const baselineFor = (file, names) => ({ components: { [file]: names }, unparsed: {} });

describe("lint:components", () => {
  it("biome.json enables only the nested-component rule, with no formatter or assists", () => {
    const config = JSON.parse(fs.readFileSync(path.join(APP_ROOT, "biome.json"), "utf8"));
    expect(config.linter.rules).toEqual({
      preset: "none",
      correctness: { noNestedComponentDefinitions: "error" },
    });
    expect(config.formatter.enabled).toBe(false);
    expect(config.assist.enabled).toBe(false);
  });

  it("passes code that declares components at module scope or calls a render function", () => {
    const result = check({
      "src/a.jsx": `const Row = () => <View />;
export default function Screen() {
  const renderRow = () => <Row />;
  return <View>{renderRow()}</View>;
}
`,
    });
    expect(result.code).toBe(0);
  });

  it.each(["js", "jsx", "tsx"])("fails a new nested function or arrow component in a .%s file", (ext) => {
    for (const source of [NESTED_FUNCTION, NESTED_ARROW]) {
      const result = check({ [`src/screen.${ext}`]: source });
      expect(result.code).toBe(1);
      expect(result.output).toContain(`error: src/screen.${ext}:2 NEW: component Inner is declared inside another component`);
      expect(result.output).toContain("What to do: move the component outside");
    }
  });

  it("only warns about a baselined case, wherever it has moved to in the file", () => {
    const shifted = `// one\n// two\n// three\n${NESTED_ARROW}`;
    const result = check({ "src/a.jsx": shifted }, baselineFor("src/a.jsx", { Inner: 1 }));
    expect(result.code).toBe(0);
    expect(result.output).toContain("warning: src/a.jsx:5 component Inner");
  });

  it("fails a second case with the same name in a baselined file", () => {
    const twice = `${NESTED_ARROW}export function Other() {
  const Inner = () => <View />;
  return <Inner />;
}
`;
    const result = check({ "src/a.jsx": twice }, baselineFor("src/a.jsx", { Inner: 1 }));
    expect(result.code).toBe(1);
    expect(result.output).toContain("2 found, the baseline allows 1");
  });

  it("fails a different name in a baselined file, and the same name in another file", () => {
    const result = check(
      { "src/a.jsx": NESTED_ARROW.replace(/Inner/g, "Added"), "src/b.jsx": NESTED_ARROW },
      baselineFor("src/a.jsx", { Inner: 1 }),
    );
    expect(result.code).toBe(1);
    expect(result.output).toContain("src/a.jsx:2 NEW: component Added");
    expect(result.output).toContain("src/b.jsx:2 NEW: component Inner");
  });

  it("fails when a baseline entry no longer matches, so it gets removed", () => {
    const result = check({ "src/a.jsx": CLEAN }, baselineFor("src/a.jsx", { Inner: 1 }));
    expect(result.code).toBe(1);
    expect(result.output).toContain("OUTDATED BASELINE");
  });

  it("fails a new syntax error, which could keep a file from being checked", () => {
    const result = check({ "src/a.jsx": "export default function Screen() { return <View>></View>; }\n" });
    expect(result.code).toBe(1);
    expect(result.output).toContain("NEW: syntax error");
  });

  it("stops with an error, instead of passing, when Biome cannot run its config", () => {
    expect(() => check({ "src/a.jsx": CLEAN, "biome.json": "{ not json" })).toThrow(/Biome/);
  });
});
