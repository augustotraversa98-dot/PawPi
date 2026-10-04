import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Hono } from "hono";
import { apiNotFound, API_NOT_FOUND_BODY } from "./apiNotFound.js";
import { routeLabel } from "../../../lib/telemetry/routes.js";

// Mirrors the wiring in __create/index.ts: real routes under /api, then the catch-all, then a stand-in for the
// React Router SPA handler (which answers 200 + HTML for everything, the bug being fixed).
function buildApp(seen) {
  const api = new Hono();
  api.get("/pets", (c) => c.json({ pets: [] }));
  api.post("/pets", (c) => c.json({ created: true }, 201));
  api.get("/pets/:petId", (c) => c.json({ id: c.req.param("petId") }));

  const app = new Hono();
  app.use("*", async (c, next) => {
    await next();
    seen?.push({ matchedRoutes: c.req.matchedRoutes, path: c.req.path, status: c.res.status });
  });
  app.route("/api", api);
  app.all("/api/*", apiNotFound);
  app.all("*", (c) => c.html("<!doctype html><html><body>spa</body></html>"));
  return app;
}

describe("unknown /api/* paths", () => {
  const app = buildApp();

  it.each([
    ["GET", "/api/nope"],
    ["GET", "/api/nope/12345"],
    ["POST", "/api/nope"],
    ["PUT", "/api/pets/1/does-not-exist"],
    ["DELETE", "/api/health/deep/extra"],
    ["PATCH", "/api/"],
    ["GET", "/api"],
    ["GET", "/api/nope?x=1&y=<script>"],
  ])("%s %s -> JSON 404 {error:not_found}", async (method, path) => {
    const res = await app.request(path, { method });
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    expect(await res.json()).toEqual({ error: "not_found" });
  });

  it("the body is exactly the contract and echoes nothing from the request", async () => {
    expect(API_NOT_FOUND_BODY).toEqual({ error: "not_found" });
    const res = await app.request("/api/secret-token-abc?q=hello", { headers: { authorization: "Bearer xyz" } });
    const text = await res.text();
    expect(text).toBe('{"error":"not_found"}');
  });

  it("does not shadow real routes (registered after them)", async () => {
    const list = await app.request("/api/pets");
    expect(list.status).toBe(200);
    expect(await list.json()).toEqual({ pets: [] });
    expect((await app.request("/api/pets", { method: "POST" })).status).toBe(201);
    expect(await (await app.request("/api/pets/7")).json()).toEqual({ id: "7" });
  });

  it("leaves non-API paths to the SPA handler", async () => {
    const res = await app.request("/account/signin");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
    // a path that only starts with the letters 'api' is not an API path
    const lookalike = await app.request("/apiary");
    expect(lookalike.status).toBe(200);
  });

  it("telemetry keeps bucketing these as 'unmatched' (the /api/* wildcard never becomes a label)", async () => {
    const seen = [];
    const a = buildApp(seen);
    await a.request("/api/nope/12345");
    const { matchedRoutes, path, status } = seen[0];
    expect(status).toBe(404);
    expect(routeLabel({ matchedRoutes, path, status })).toBe("unmatched");
  });
});

describe("wiring in __create/index.ts", () => {
  const src = readFileSync(resolve(__dirname, "../../../../__create/index.ts"), "utf8");

  it("registers the JSON 404 after the real /api routes", () => {
    const routeAt = src.indexOf("app.route(API_BASENAME, api)");
    const notFoundAt = src.indexOf("app.all('/api/*', apiNotFound)");
    expect(routeAt).toBeGreaterThan(-1);
    expect(notFoundAt).toBeGreaterThan(routeAt);
    expect(src).toMatch(/import \{ apiNotFound \} from '..\/src\/app\/api\/utils\/apiNotFound\.js'/);
  });

  it("registers it before the server is created (so the SPA catch-all cannot win)", () => {
    expect(src.indexOf("app.all('/api/*', apiNotFound)")).toBeLessThan(src.indexOf("createHonoServer({"));
  });
});
