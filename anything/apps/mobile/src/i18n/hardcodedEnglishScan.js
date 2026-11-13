// Heuristic scanner for hardcoded English user-facing literals in screen/component source.
// Shared by hardcodedEnglish.guard.test.js (CI guard) and the one-off audit script.
//
// It is deliberately conservative: it flags only string literals that are rendered to the user
// (JSX text, user-facing JSX props, Alert/toast arguments, and user-facing option/object keys) and
// that look like English prose (>= 2 letters, a space or a capitalised word). Strings that already
// go through t()/i18n are never flagged.

const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;

const LETTERS = /[A-Za-z]{2,}/;
// Props whose string value is shown to the user.
const USER_PROPS = new Set([
  "placeholder",
  "accessibilityLabel",
  "accessibilityHint",
  "title",
  "label",
  "headerTitle",
  "tabBarLabel",
  "subtitle",
  "description",
  "message",
  "emptyText",
  "emptyTitle",
  "cta",
  "ctaLabel",
  "buttonLabel",
  "confirmText",
  "cancelText",
  "alt",
  "ctaLabel",
  "confirmLabel",
  "cancelLabel",
  "saveLabel",
  "subtitleText",
  "headerLeftLabel",
]);
// Object-literal keys that hold user-facing copy (kept narrower than USER_PROPS: object keys are noisier).
const USER_KEYS = new Set([
  "title",
  "headerTitle",
  "tabBarLabel",
  "label",
  "placeholder",
  "message",
  "subtitle",
  "description",
  "accessibilityLabel",
  "text",
  "prompt",
  "hint",
]);
const ALERT_CALLEES = new Set(["Alert.alert", "Alert.prompt", "toast", "toast.success", "toast.error", "toast.info", "toast.warning", "toast.message", "Toast.show", "showToast"]);

function looksLikeEnglishProse(raw) {
  const s = String(raw).replace(/\s+/g, " ").trim();
  if (!LETTERS.test(s)) return false;
  // Emoji/number-only, URL, path, hex colour, identifier-ish tokens are not copy.
  if (/^(https?:|\/|#[0-9a-f]{3,8}$|[a-z]+:\/\/)/i.test(s)) return false;
  if (/^[a-z][a-zA-Z0-9_.\-/]*$/.test(s)) return false; // single lowerCamel / kebab / dotted token (an id, not copy)
  if (/^[A-Z0-9_]+$/.test(s)) return false; // CONSTANT_CASE
  const hasSpace = /\s/.test(s);
  const capitalised = /^[A-Z][a-z]{1,}/.test(s);
  return hasSpace || capitalised;
}

function calleeName(node) {
  if (!node) return "";
  if (node.type === "Identifier") return node.name;
  if (node.type === "MemberExpression" && !node.computed) {
    const o = calleeName(node.object);
    return o ? `${o}.${node.property.name}` : node.property.name;
  }
  return "";
}

function literalText(node) {
  if (!node) return null;
  if (node.type === "StringLiteral") return node.value;
  if (node.type === "TemplateLiteral") return node.quasis.map((q) => q.value.cooked).join("{}");
  return null;
}

// String literals that can be rendered from a conditional/logical expression: {a ? "Edit" : "Create"}, {x && "Text"}.
function branchLiterals(expr, out = []) {
  if (!expr) return out;
  if (expr.type === "ConditionalExpression") {
    branchLiterals(expr.consequent, out);
    branchLiterals(expr.alternate, out);
  } else if (expr.type === "LogicalExpression") {
    branchLiterals(expr.right, out);
    if (expr.operator !== "&&") branchLiterals(expr.left, out);
  } else if (expr.type === "ParenthesizedExpression") {
    branchLiterals(expr.expression, out);
  } else if (expr.type === "StringLiteral" || (expr.type === "TemplateLiteral" && expr.expressions.length === 0)) {
    out.push(expr);
  }
  return out;
}

function scanSource(code, filename = "file.jsx") {
  let ast;
  try {
    ast = parser.parse(code, { sourceType: "module", plugins: ["jsx", "typescript"], errorRecovery: true });
  } catch {
    return [];
  }
  const findings = [];
  const add = (node, kind, text) => {
    const clean = String(text).replace(/\s+/g, " ").trim();
    findings.push({ file: filename, line: node.loc ? node.loc.start.line : 0, kind, text: clean });
  };

  traverse(ast, {
    JSXText(path) {
      const text = path.node.value;
      if (looksLikeEnglishProse(text)) add(path.node, "jsx-text", text);
    },
    JSXExpressionContainer(path) {
      // {"Some text"} or {`Some text`} as a JSX child (not as an attribute value).
      if (path.parent.type === "JSXAttribute") return;
      branchLiterals(path.node.expression).forEach((lit) => {
        const text = literalText(lit);
        if (text !== null && looksLikeEnglishProse(text)) add(lit, "jsx-text", text);
      });
    },
    JSXAttribute(path) {
      const name = path.node.name && path.node.name.name;
      if (!USER_PROPS.has(name)) return;
      const v = path.node.value;
      if (v && v.type === "StringLiteral") {
        if (looksLikeEnglishProse(v.value)) add(path.node, `prop:${name}`, v.value);
      } else if (v && v.type === "JSXExpressionContainer") {
        const exprs = branchLiterals(v.expression);
        if (v.expression.type === "TemplateLiteral" && v.expression.expressions.length > 0) exprs.push(v.expression);
        exprs.forEach((lit) => {
          const text = literalText(lit);
          if (text !== null && looksLikeEnglishProse(text)) add(lit, `prop:${name}`, text);
        });
      }
    },
    CallExpression(path) {
      const name = calleeName(path.node.callee);
      if (!ALERT_CALLEES.has(name)) return;
      path.node.arguments.slice(0, 3).forEach((arg) => {
        const text = literalText(arg);
        if (text !== null && looksLikeEnglishProse(text)) add(arg, `call:${name}`, text);
      });
    },
    ObjectProperty(path) {
      const key = path.node.key;
      const keyName = key.type === "Identifier" ? key.name : key.type === "StringLiteral" ? key.value : null;
      if (!keyName || !USER_KEYS.has(keyName)) return;
      const text = literalText(path.node.value);
      if (text !== null && looksLikeEnglishProse(text)) add(path.node, `key:${keyName}`, text);
    },
  });
  return findings;
}

module.exports = { scanSource, looksLikeEnglishProse };
