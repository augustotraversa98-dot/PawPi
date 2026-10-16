// Regression guard for the e-mail-derived owner name leak (QA 2026-10-16 bug 04).
// Scans the API sources so the two leaking patterns can't quietly come back:
//   1. deriving a username from an e-mail address (`email.split("@")[0]`)
//   2. falling back to `username` when building another user's display name
//      (`COALESCE(x.full_name, x.username)`, `full_name || username`).
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const API_DIR = path.resolve(__dirname, "..");

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return /\.(js|jsx|ts)$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : [];
  });
}

const FILES = walk(API_DIR).map((p) => ({ p, src: fs.readFileSync(p, "utf8") }));

function offenders(re) {
  return FILES.filter(({ src }) => re.test(src))
    .map(({ p }) => path.relative(API_DIR, p))
    // ownerDisplay.js documents the forbidden pattern in its header comment.
    .filter((f) => f !== path.join("utils", "ownerDisplay.js"));
}

describe("no e-mail-derived or username-based owner names in the API", () => {
  it("never derives a username from the e-mail local-part", () => {
    // Allowed: utils/email (address masking for logs) — it does not create usernames.
    const bad = offenders(/email\??\.split\((['"])@\1\)\s*\[0\]/).filter(
      (f) => !f.startsWith(path.join("utils", "email")),
    );
    expect(bad).toEqual([]);
  });

  it("never falls back to username when building a display name", () => {
    expect(offenders(/coalesce\(\s*(\w+)\.full_name\s*,\s*\1\.username\s*\)/i)).toEqual([]);
    expect(offenders(/full_name\s*\|\|\s*\w+\.username/)).toEqual([]);
  });
});
