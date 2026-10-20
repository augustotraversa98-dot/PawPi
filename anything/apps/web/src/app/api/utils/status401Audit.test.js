import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Guard for the "a 401 means a dead session" contract (see sessionExpiredCode.js).
//
// The mobile app signs the user out on a 401 that carries the session_expired code, and builds
// already in the wild sign out on ANY 401 — so a business rule that answers 401 (it happened in
// walk-pickup/redeem: "Invalid or expired pickup code") logs people out. This test reads every
// route file and fails, naming the offender, when a `401` is returned under any condition other
// than a missing session — unless it is a documented machine-credential route.
//
//   business / permission error -> 400 / 403 / 404 / 422
//   missing or invalid session  -> 401 (the middleware adds the session_expired code)

const API_DIR = path.resolve(__dirname, "..");

const SESSION_GUARD = /!\s*(session|authSession)\?\.user\?\.id/;

// 401s that are about a MACHINE credential, not the caller's session. The mobile app never calls
// these; the stamping middleware leaves them as a plain 401.
const MACHINE_AUTH = new Set([
  "payments/subscriptions/run/route.js",
  "recalls/ingest/route.js",
  "providers/calendar/sync/route.js",
  "engagement/reengagement/run/route.js",
  "engagement/weekly-digest/run/route.js",
  "notifications/push-receipts/run/route.js",
  "internal/grafana-alert/route.js",
  "payments/webhooks/mercadopago/route.js",
  "payments/webhooks/binance/route.js",
]);
// The sign-in bridge: 401 is part of its protocol and the client never treats it as expiry.
const AUTH_BRIDGE = new Set(["auth/token/route.js", "auth/expo-web-success/route.js"]);

function routeFiles(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) routeFiles(p, out);
    else if (e.name === "route.js") out.push(p);
  }
  return out;
}

describe("every 401 in /api routes is a session problem", () => {
  it("has no business / permission rule answering 401", () => {
    const offenders = [];
    for (const file of routeFiles(API_DIR)) {
      const rel = path.relative(API_DIR, file).split(path.sep).join("/");
      if (MACHINE_AUTH.has(rel) || AUTH_BRIDGE.has(rel)) continue;
      const lines = fs.readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        const code = line.replace(/\/\/.*$/, "");
        if (!/\b401\b/.test(code)) return;
        let cond = "";
        for (let j = i; j >= Math.max(0, i - 6); j--) {
          if (/\bif\s*\(/.test(lines[j])) {
            cond = lines[j];
            break;
          }
        }
        if (!SESSION_GUARD.test(cond)) offenders.push(`${rel}:${i + 1}  ${line.trim()}`);
      });
    }
    expect(
      offenders,
      "a 401 must mean a dead session. Use 400/403/404/422 for business errors:\n" + offenders.join("\n"),
    ).toEqual([]);
  });

  it("the machine-credential allowlist only names files that still exist", () => {
    for (const rel of [...MACHINE_AUTH, ...AUTH_BRIDGE]) {
      expect(fs.existsSync(path.join(API_DIR, rel)), rel).toBe(true);
    }
  });
});
