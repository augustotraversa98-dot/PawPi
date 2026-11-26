// @vitest-environment node
// Guard: no hardcoded English in the provider panel. Every word the panel shows lives in a dictionary in this
// folder (see README.md), in both languages. Files still to be translated are listed in pending/*.json; those
// lists only shrink.
//
// To fix a failure, move the text into a dictionary. For a string that is never read by a person (an identifier,
// a developer-only message that a screen translates), add `i18n-ok: <reason>` in a comment on that line or the
// line above it.
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseSync } from "@babel/core";
import traverseModule from "@babel/traverse";

const traverse = traverseModule.default ?? traverseModule;
const I18N = path.dirname(fileURLToPath(import.meta.url));
const PROVIDER = path.dirname(I18N);

// JSX attributes and object keys whose value a person reads: any word in them counts.
const COPY_NAMES = new Set(
  (
    "alt aria-label body caption cta ctaLabel description desc emptyText emptyTitle heading helperText hint " +
    "label message placeholder sub subtitle text title confirmLabel cancelLabel saveLabel"
  ).split(" "),
);
// JSX attributes and object keys that never carry copy.
const OTHER_ATTRIBUTES = new Set(
  (
    "accept as autoComplete className d dataKey dir fill gestureHandling href htmlFor id inputMode key lang " +
    "layout method name rel role src stroke strokeDasharray style target to type value variant viewBox xmlns"
  ).split(" "),
);
const OTHER_KEYS = new Set(
  (
    "background backgroundColor border borderBottom borderColor borderTop boxShadow className color day fill " +
    "fontFamily headers hour hourCycle href id key margin method minute month mutationKey padding queryKey second " +
    "stroke style timeZone to transform transition type value weekday year"
  ).split(" "),
);
const STRING_CALLS = new Set(
  "addEventListener closest endsWith includes indexOf querySelector removeEventListener split startsWith".split(" "),
);

const hasWord = (text) => /\p{L}{2,}/u.test(text);

// A list of CSS classes ("flex items-center"): no capitals outside [brackets], and something only a class name has.
const isClassList = (tokens) => {
  const bare = tokens.map((token) => token.replace(/\[[^\]]*\]/g, "[]"));
  return (
    bare.every((token) => /^[a-z0-9![\]#():/_.%,&>*+='"-]+$/.test(token)) &&
    bare.some((token) => /[-:[/]/.test(token))
  );
};

// Does a string that is not obviously copy (a variable, an argument, an object value) read like words?
function readsAsProse(raw) {
  const text = raw.replace(/\{\}/g, " ").replace(/\s+/g, " ").trim();
  if (!hasWord(text)) return false;
  if (/^(https?:\/\/|mailto:|tel:|\/|\.{1,2}\/|#|\?|&)/i.test(text)) return false;
  const tokens = text.split(" ");
  if (tokens.length === 1) {
    if (/^[A-Z][a-z]+-[A-Z]/.test(text)) return false; // a header name such as Content-Type
    return /^\p{Lu}\p{Ll}+([-/'’]\p{L}+)*[.…!?:]*$/u.test(text);
  }
  return !isClassList(tokens) && tokens.some((token) => /^\(?\p{L}{2,}/u.test(token));
}

const attributeName = (node) =>
  node.name.type === "JSXNamespacedName" ? node.name.name.name : node.name.name;
const keyName = (node) => (node.computed ? null : (node.key.name ?? node.key.value));

// Where a literal sits: "skip" (never shown), "copy" (shown for sure) or "maybe" (judged by its words).
function placeOf(start) {
  // Inside an object or a call the string may be data, unless an object key says it is copy.
  let direct = true;
  let namedCopy = false;
  for (let child = start; child.parentPath; child = child.parentPath) {
    const parent = child.parentPath.node;
    switch (parent.type) {
      case "ImportDeclaration":
      case "ExportAllDeclaration":
      case "ExportNamedDeclaration":
        if (child.key === "source") return "skip";
        break;
      case "JSXAttribute": {
        const name = attributeName(parent);
        if (name.startsWith("data-") || OTHER_ATTRIBUTES.has(name)) return "skip";
        return namedCopy || (direct && COPY_NAMES.has(name)) ? "copy" : "maybe";
      }
      case "JSXExpressionContainer":
        if (child.parentPath.parentPath.node.type !== "JSXAttribute") {
          return namedCopy || direct ? "copy" : "maybe";
        }
        break;
      case "ObjectProperty":
        if (child.key === "key" || OTHER_KEYS.has(keyName(parent))) return "skip";
        if (direct && COPY_NAMES.has(keyName(parent))) namedCopy = true;
        direct = false;
        break;
      case "BinaryExpression":
        if (["===", "!==", "==", "!=", "in"].includes(parent.operator)) return "skip";
        break;
      case "SwitchCase":
        if (child.key === "test") return "skip";
        break;
      case "MemberExpression":
        if (child.key === "property") return "skip";
        break;
      case "CallExpression":
      case "NewExpression": {
        if (child.listKey !== "arguments") break;
        const { callee } = parent;
        if (callee.object?.name === "console") return "skip";
        if (STRING_CALLS.has(callee.property?.name)) return "skip";
        direct = false;
        break;
      }
      default:
        break;
    }
  }
  return namedCopy ? "copy" : "maybe";
}

export function scanSource(code) {
  const ast = parseSync(code, {
    babelrc: false,
    configFile: false,
    sourceType: "module",
    parserOpts: { plugins: ["jsx"] },
  });
  const lines = code.split("\n");
  const excused = (line) => [lines[line - 1], lines[line - 2]].some((l) => /i18n-ok:\s*\S/.test(l ?? ""));
  const findings = [];
  const add = (node, text) => {
    const line = node.loc.start.line;
    // For multi-line JSX text, report (and excuse) the line where the words start.
    const offset = String(text).match(/^\s*/)[0].split("\n").length - 1;
    if (!excused(line + offset)) {
      findings.push({ line: line + offset, text: String(text).replace(/\s+/g, " ").trim() });
    }
  };
  const literal = (path_, text) => {
    const place = placeOf(path_);
    if (place === "skip") return;
    if (place === "copy" ? hasWord(text) && !/^(https?:\/\/|\/)/.test(text) : readsAsProse(text)) {
      add(path_.node, text);
    }
  };
  traverse(ast, {
    JSXText(p) {
      if (hasWord(p.node.value)) add(p.node, p.node.value);
    },
    StringLiteral(p) {
      literal(p, p.node.value);
    },
    TemplateLiteral(p) {
      literal(p, p.node.quasis.map((q) => q.value.cooked).join("{}"));
    },
  });
  return findings;
}

function sources(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sources(full, out);
    // The files directly in this folder are the dictionaries.
    else if (/\.(jsx?|tsx?)$/.test(entry.name) && !/\.test\./.test(entry.name) && dir !== I18N) out.push(full);
  }
  return out;
}

const relative = (file) => path.relative(PROVIDER, file).split(path.sep).join("/");
const findingsByFile = new Map(
  sources(PROVIDER).map((file) => [relative(file), scanSource(readFileSync(file, "utf8"))]),
);
const pendingDir = path.join(I18N, "pending");
const pendingLists = (existsSync(pendingDir) ? readdirSync(pendingDir) : [])
  .filter((name) => name.endsWith(".json"))
  .map((name) => ({ name, ...JSON.parse(readFileSync(path.join(pendingDir, name), "utf8")) }));
const pending = new Set(pendingLists.flatMap((list) => list.files));

describe("hardcoded English in the provider panel", () => {
  it("has none in a translated file", () => {
    const offenders = [...findingsByFile]
      .filter(([file]) => !pending.has(file))
      .flatMap(([file, found]) => found.map((f) => `${file}:${f.line} ${JSON.stringify(f.text)}`));
    expect(offenders).toEqual([]);
  });

  it("lists as pending only files that still need work", () => {
    // `concurrentEdits` lists are being changed by other work, so an entry there may already be clean or gone.
    const done = pendingLists
      .filter((list) => !list.concurrentEdits)
      .flatMap((list) =>
        list.files
          .filter((file) => !findingsByFile.get(file)?.length)
          .map((file) => `${file}: remove it from pending/${list.name}`),
      );
    expect(done).toEqual([]);
  });

  it("lists each pending file once", () => {
    const all = pendingLists.flatMap((list) => list.files);
    expect(all).toHaveLength(pending.size);
  });

  it("flags what a person would read, and not code", () => {
    const flagged = (code) => scanSource(code).map((f) => f.text);
    expect(
      flagged(`const A = ({ n, e }) => (
        <div className="flex items-center" aria-label={\`Remove image \${n}\`}>
          <h1>Bookings</h1>
          <input placeholder="Search pets" />
          {e?.message || "Please try again."}
          {n ? "min" : null}
          <Card sub={\`\${n} paid orders\`} />
        </div>
      );`),
    ).toEqual(["Remove image {}", "Bookings", "Search pets", "Please try again.", "min", "{} paid orders"]);
    expect(
      flagged(`toast.error(err?.message || "Couldn't save");
        setError("This link is missing information");
        const meta = { title: "Add a location", to: "/provider/locations" };
        const label = "Saving";`),
    ).toEqual(["Couldn't save", "This link is missing information", "Add a location", "Saving"]);
    expect(
      flagged(`import x from "./Some Module";
        const WRAP = "flex min-h-screen w-full bg-[#FFF7EF] p-4";
        const B = ({ on }) => <p className={\`rounded \${on ? "text-white" : ""}\`} style={{ color: "#7A6254" }} data-testid="x y">{on === "Some Value" ? t.a : t.b}</p>;
        fetch(\`/api/providers/\${id}\`, { method: "POST", headers: { "Content-Type": "application/json" } });
        // i18n-ok: developer message, translated by the screen
        throw new Error(\`Request failed (\${status})\`);`),
    ).toEqual([]);
  });
});
