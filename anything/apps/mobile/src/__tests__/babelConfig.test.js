// AUDIT A-27 — the release bundle must strip console.* (keeping error/warn).
// This guards babel.config.js so a future edit can't silently start shipping
// the app's debug logs (auth email, user/pet objects, medical file URLs) again.

const path = require("path");

function loadConfig(nodeEnv) {
  const configPath = path.resolve(__dirname, "../../babel.config.js");
  jest.resetModules();
  const factory = require(configPath);
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = nodeEnv;
  try {
    // Minimal Babel `api` stub: our config only uses api.cache.using().
    const api = { cache: { using: () => {} } };
    return factory(api);
  } finally {
    process.env.NODE_ENV = prev;
  }
}

describe("babel.config.js console stripping (AUDIT A-27)", () => {
  it("adds transform-remove-console in production, excluding error/warn", () => {
    const cfg = loadConfig("production");
    const plugin = cfg.plugins.find(
      (p) => Array.isArray(p) && p[0] === "transform-remove-console",
    );
    expect(plugin).toBeTruthy();
    expect(plugin[1].exclude).toEqual(["error", "warn"]);
  });

  it("does NOT strip console in development", () => {
    const cfg = loadConfig("development");
    const has = cfg.plugins.some(
      (p) => Array.isArray(p) && p[0] === "transform-remove-console",
    );
    expect(has).toBe(false);
  });

  it("does NOT strip console in test", () => {
    const cfg = loadConfig("test");
    const has = cfg.plugins.some(
      (p) => Array.isArray(p) && p[0] === "transform-remove-console",
    );
    expect(has).toBe(false);
  });
});
