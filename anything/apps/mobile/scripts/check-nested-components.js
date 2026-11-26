#!/usr/bin/env node
// Fails when a NEW component is declared inside another component. React sees a new component type on every render and
// remounts it; around a text field that closes the keyboard on every letter (see docs/keyboard-convention.md).
//
//   npm run lint:components
//
// Detection is Biome's lint/correctness/noNestedComponentDefinitions, the only rule ../biome.json enables. The cases that
// already existed are listed in nested-components-baseline.json and only warn. The comparison is per file, component name
// and count, so moving lines around changes nothing. A case beyond the baseline fails, and so does a baseline entry that
// no longer matches (otherwise the same case could come back unnoticed). Files with syntax errors are tracked the same
// way, because Biome may not be able to check all of such a file.

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const RULE = "lint/correctness/noNestedComponentDefinitions";
const APP_ROOT = path.resolve(__dirname, "..");
const APP_DIR_IN_REPO = "anything/apps/mobile";
const BASELINE = path.join(__dirname, "nested-components-baseline.json");
const BASELINE_NAME = "scripts/nested-components-baseline.json";
const IDENTIFIER = /^[\p{ID_Start}$_][\p{ID_Continue}$]*$/u;

/** The component name Biome underlined (its columns count characters, starting at 1). */
function nameAt(source, { start, end }) {
  const line = source.split("\n")[start.line - 1] ?? "";
  const text = Array.from(line).slice(start.column - 1, end.column - 1).join("");
  return start.line === end.line && IDENTIFIER.test(text) ? text : "(unnamed)";
}

/** @returns {{components: Object<string, Object<string, number[]>>, unparsed: Object<string, number[]>}} line numbers */
function scan(root) {
  const bin = path.join(path.dirname(require.resolve("@biomejs/biome/package.json")), "bin", "biome");
  const result = spawnSync(process.execPath, [bin, "lint", "--reporter=json", "--max-diagnostics=none"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    throw new Error(`Biome did not return a report (exit ${result.status}).\n${result.stderr || result.error || ""}`);
  }
  // Never pass on a report that is incomplete or not in the expected shape.
  const { summary, diagnostics } = report;
  if (!Array.isArray(diagnostics) || summary?.diagnosticsNotPrinted !== 0) {
    throw new Error("Biome's report is incomplete or has an unexpected shape.");
  }

  const found = { components: {}, unparsed: {} };
  for (const d of diagnostics) {
    const file = d.location?.path;
    if (d.category === RULE) {
      const name = nameAt(fs.readFileSync(path.join(root, file), "utf8"), d.location);
      const names = (found.components[file] ??= {});
      (names[name] ??= []).push(d.location.start.line);
    } else if (d.category === "parse") {
      (found.unparsed[file] ??= []).push(d.location.start.line);
    } else if (d.severity === "error" || d.severity === "fatal") {
      throw new Error(`Biome reported an unexpected problem: ${d.category} ${file ?? ""} ${d.message}`);
    }
  }
  return found;
}

/** One row per file + name, from either the scan (arrays of lines) or the baseline (counts). */
function rows({ components = {}, unparsed = {} }) {
  const out = new Map();
  for (const [file, names] of Object.entries(components)) {
    for (const [name, value] of Object.entries(names)) out.set(`${file}\n${name}`, { file, name, value });
  }
  for (const [file, value] of Object.entries(unparsed)) out.set(`${file}\n`, { file, name: null, value });
  return out;
}

function compare(found, baseline) {
  const now = rows(found);
  const allowed = rows(baseline);
  const added = [];
  const known = [];
  const stale = [];
  for (const [key, { file, name, value: lines }] of now) {
    const limit = allowed.get(key)?.value ?? 0;
    (lines.length > limit ? added : known).push({ file, name, lines, allowed: limit });
  }
  for (const [key, { file, name, value: limit }] of allowed) {
    const count = now.get(key)?.value.length ?? 0;
    if (count < limit) stale.push({ file, name, count, allowed: limit });
  }
  return { added, known, stale };
}

const label = (name) => (name === null ? "syntax error" : `component ${name} is declared inside another component`);

/** @returns {number} the exit code */
function run({ root = APP_ROOT, baselinePath = BASELINE, log = console.log, github = !!process.env.GITHUB_ACTIONS } = {}) {
  const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
  const { added, known, stale } = compare(scan(root), baseline);
  const annotate = (level, file, line, message) => {
    if (github) log(`::${level} file=${APP_DIR_IN_REPO}/${file},line=${line}::${message}`);
    else log(`${level}: ${file}:${line} ${message}`);
  };

  for (const k of known) {
    for (const line of k.lines) annotate("warning", k.file, line, `${label(k.name)} (existing, in the baseline)`);
  }
  for (const a of added) {
    const extra = a.allowed ? ` (${a.lines.length} found, the baseline allows ${a.allowed}; one of these is new)` : "";
    for (const line of a.lines) annotate("error", a.file, line, `NEW: ${label(a.name)}${extra}`);
  }
  for (const s of stale) {
    annotate("error", s.file, 1, `OUTDATED BASELINE: ${label(s.name)}: the baseline lists ${s.allowed}, found ${s.count}`);
  }

  if (added.some((a) => a.name !== null)) {
    log(
      "\nWhat to do: move the component outside the component that declares it and pass what it needs as props,\n" +
        "or make it a plain function with a lowercase name and call it: {renderRow()}.\n" +
        "Do not add new cases to the baseline. See docs/keyboard-convention.md.\n" +
        "(If you only renamed or moved a file or component that is already listed, update its entry in\n" +
        `${BASELINE_NAME}.)`,
    );
  }
  if (added.some((a) => a.name === null)) {
    log("\nWhat to do: fix the syntax error; Biome may not be able to check all of that file until you do.");
  }
  if (stale.length) {
    log(
      `\nWhat to do: if you fixed, renamed or moved it, lower or remove that entry in ${BASELINE_NAME}\n` +
        "so the same case cannot come back unnoticed.",
    );
  }
  const total = (list) => list.reduce((n, item) => n + item.lines.length, 0);
  const failed = added.length > 0 || stale.length > 0;
  log(`\nlint:components ${failed ? "FAILED" : "passed"}: ${total(known)} known, ${total(added)} in new or grown entries, ${stale.length} outdated baseline entries.`);
  return failed ? 1 : 0;
}

module.exports = { run, scan, compare, APP_ROOT, BASELINE };

if (require.main === module) process.exitCode = run();
