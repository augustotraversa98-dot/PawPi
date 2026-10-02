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
// (a token without iat used to skip the check and 500 downstream).
describe("api ghost-session guard", () => {
  it("rejects non-integer subs independent of iat, ahead of the revocation lookup", () => {
    const src = readFileSync(resolve(__dirname, "../../../../__create/index.ts"), "utf8");
    const g = src.slice(src.indexOf("app.use('/api/*'"), src.indexOf("app.route(API_BASENAME"));
    expect(g.indexOf("isValidAuthUserId(sub)")).toBeGreaterThan(-1);
    expect(g.indexOf("isValidAuthUserId(sub)")).toBeLessThan(g.indexOf("isTokenRevoked"));
    expect(g).not.toMatch(/sub != null && typeof iat === 'number'/);
  });
});
