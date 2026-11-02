import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Regression guard: Google OAuth silently ran WITHOUT a DB adapter (no auth_users rows, session
// sub = random UUID → every API call 22P02/500). The adapter must stay on initAuthConfig.
describe("auth handler config", () => {
  it("passes the database adapter to initAuthConfig", () => {
    const src = readFileSync(resolve(__dirname, "../../../../__create/index.ts"), "utf8");
    const cfg = src.slice(src.indexOf("initAuthConfig("), src.indexOf("providers: ["));
    expect(cfg).toMatch(/^\s*adapter,\s*$/m);
  });
});

// Ghost-session guard: the /api/* middleware must 401 a non-integer sub BEFORE the iat gate
// (a token without iat used to skip the check and 500 downstream). The guard lives in
// api/utils/sessionGuard.js (behaviour covered by sessionGuard.test.js); this keeps the ordering
// invariant in the source and checks the server entry file still mounts it on /api/*.
describe("api ghost-session guard", () => {
  it("is mounted on /api/* in the server entry file", () => {
    const src = readFileSync(resolve(__dirname, "../../../../__create/index.ts"), "utf8");
    expect(src).toMatch(/app\.use\('\/api\/\*', sessionGuard\(\)\);/);
  });

  it("rejects non-integer subs independent of iat, ahead of the revocation lookup", () => {
    const g = readFileSync(resolve(__dirname, "../utils/sessionGuard.js"), "utf8");
    expect(g.indexOf("isValidAuthUserId(sub)")).toBeGreaterThan(-1);
    expect(g.indexOf("isValidAuthUserId(sub)")).toBeLessThan(g.indexOf("await isTokenRevoked(sub, iat)"));
    expect(g).not.toMatch(/sub != null && typeof iat === 'number'/);
  });
});
