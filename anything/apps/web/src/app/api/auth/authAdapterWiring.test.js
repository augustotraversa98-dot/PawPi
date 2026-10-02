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
