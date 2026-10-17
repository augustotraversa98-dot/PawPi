// Ratchet from the 2026-10-17 consistency audit (A-01/A-02/A-04): an icon-only Back / Close / Delete
// touchable must carry an accessibilityLabel (screen readers otherwise announce nothing). Checks every
// source file where `t` is the i18n function in scope (`const { t } = useTranslation()`); the
// handful of English-only screens without `t` are tracked in the audit doc instead.
const fs = require("fs");
const path = require("path");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;

const SRC = path.join(__dirname);
const SKIP = new Set(["constants", "__create", "i18n", "node_modules"]);
const TOUCH = new Set(["Pressable", "TouchableOpacity", "PressableScale", "TouchableWithoutFeedback", "TouchableHighlight"]);
const ICONS = new Set(["ArrowLeft", "ChevronLeft", "X", "Trash2"]);

function* files(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!SKIP.has(e.name)) yield* files(path.join(dir, e.name));
    } else if (/\.(js|jsx)$/.test(e.name) && !/\.test\./.test(e.name)) yield path.join(dir, e.name);
  }
}

test("icon-only Back/Close/Delete buttons are labelled wherever i18n `t` is in scope", () => {
  const offenders = [];
  for (const f of files(SRC)) {
    const code = fs.readFileSync(f, "utf8");
    if (!/(ArrowLeft|ChevronLeft|\bX\b|Trash2)/.test(code)) continue;
    let ast;
    try {
      ast = parser.parse(code, { sourceType: "module", plugins: ["jsx"] });
    } catch {
      continue;
    }
    traverse(ast, {
      JSXOpeningElement(p) {
        const n = p.node.name.type === "JSXIdentifier" ? p.node.name.name : null;
        if (!n || !TOUCH.has(n)) return;
        const attrs = p.node.attributes;
        if (attrs.some((a) => a.type === "JSXSpreadAttribute")) return;
        if (attrs.some((a) => a.type === "JSXAttribute" && (a.name.name === "accessibilityLabel" || a.name.name === "aria-label"))) return;
        const kids = p.parent.children.filter((c) => !(c.type === "JSXText" && !c.value.trim()));
        if (kids.length !== 1 || kids[0].type !== "JSXElement") return;
        const icon = kids[0].openingElement.name.type === "JSXIdentifier" ? kids[0].openingElement.name.name : null;
        if (!ICONS.has(icon)) return;
        const d = p.scope.getBinding("t")?.path?.node;
        const isI18nT =
          d && d.type === "VariableDeclarator" && d.init?.callee?.name === "useTranslation" && d.id.type === "ObjectPattern";
        if (isI18nT) offenders.push(`${path.relative(SRC, f)}:${p.node.loc.start.line} <${n}><${icon}/>`);
      },
    });
  }
  expect(offenders).toEqual([]);
});
