// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import { originGuard, CROSS_SITE_CODE } from "./originGuard.js";

// Header handling that depends on configuration. The full caller matrix runs against the real server entry in
// test/integration/request-origin.integration.test.ts.
const post = async (env, headers, path = "/api/things") => {
  const app = new Hono();
  app.use("/api/*", originGuard({ env }));
  app.all("*", (c) => c.json({ served: true }));
  return app.request(`http://www.pawpi.info${path}`, {
    method: "POST",
    headers: { host: "www.pawpi.info", ...headers },
  });
};

describe("originGuard", () => {
  beforeEach(() => vi.spyOn(console, "warn").mockImplementation(() => {}));
  afterEach(() => vi.restoreAllMocks());

  it("answers 403 with a machine code and logs no path", async () => {
    const res = await post({}, { origin: "https://other.example" }, "/api/public/secret-token");
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe(CROSS_SITE_CODE);
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.warn.mock.calls[0][0]).not.toContain("secret-token");
  });

  it("works without CORS_ORIGINS", async () => {
    expect((await post({}, { origin: "https://www.pawpi.info" })).status).toBe(200);
    expect((await post({}, { origin: "http://localhost:8081" })).status).toBe(403);
  });

  it("reads a comma-separated CORS_ORIGINS and ignores blank, * and null entries as wildcards", async () => {
    const env = { CORS_ORIGINS: " http://localhost:8081 , ,*,null" };
    expect((await post(env, { origin: "http://localhost:8081" })).status).toBe(200);
    expect((await post(env, { origin: "https://other.example" })).status).toBe(403);
    expect((await post(env, { origin: "null" })).status).toBe(403);
    expect((await post(env, { origin: "" })).status).toBe(403);
  });

  it("compares host and port, using the first X-Forwarded-Host entry", async () => {
    const proxied = { host: "localhost:4000", "x-forwarded-host": "WWW.PawPi.info, internal" };
    expect((await post({}, { ...proxied, origin: "https://www.pawpi.info" })).status).toBe(200);
    expect((await post({}, { host: "localhost:4000", origin: "http://localhost:4000" })).status).toBe(200);
    expect((await post({}, { host: "localhost:4000", origin: "http://localhost:8081" })).status).toBe(403);
    expect((await post({}, { host: "not a host", origin: "https://other.example" })).status).toBe(403);
  });

  it("exempts only the auth prefix and the unsubscribe link", async () => {
    const headers = { origin: "https://other.example" };
    expect((await post({}, headers, "/api/auth/signin/google")).status).toBe(200);
    expect((await post({}, headers, "/api/notification-prefs/email-unsubscribe")).status).toBe(200);
    expect((await post({}, headers, "/api/authx")).status).toBe(403);
    expect((await post({}, headers, "/api/notification-prefs")).status).toBe(403);
    expect((await post({}, headers, "/api")).status).toBe(403);
  });

  it("only a Bearer token with a value counts as one", async () => {
    const origin = "https://other.example";
    expect((await post({}, { origin, authorization: "Bearer abc" })).status).toBe(200);
    expect((await post({}, { origin, authorization: "Bearer " })).status).toBe(403);
    expect((await post({}, { origin, authorization: "Basic abc" })).status).toBe(403);
  });
});
