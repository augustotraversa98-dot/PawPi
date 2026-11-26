// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

// The real server app from __create/index.ts. Only two things are stubbed: the Node server bootstrap (hands back the
// app instead of listening) and the /api route scan (not involved: the path under test is outside /api).
vi.mock("react-router-hono-server/node", () => ({
  createHonoServer: async ({ app }) => app,
}));
vi.mock("../../../../__create/route-builder", async () => {
  const { Hono } = await import("hono");
  return { API_BASENAME: "/api", api: new Hono() };
});

describe("removed /integrations/* route", () => {
  const outbound = vi.fn(async () => new Response("outbound"));
  let app;

  beforeAll(async () => {
    app = (await import("../../../../__create/index.ts")).default;
    vi.stubGlobal("fetch", outbound);
  }, 30_000);

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it.each(["GET", "POST", "PUT", "PATCH", "DELETE"])("%s answers 404 with no outbound request", async (method) => {
    const res = await app.request("/integrations/example/path?q=1", {
      method,
      body: method === "GET" ? undefined : "x",
    });

    expect(res.status).toBe(404);
    expect(outbound).not.toHaveBeenCalled();
  });

  it("has no handler registered for the path", () => {
    expect(app.routes.filter((r) => r.path.startsWith("/integrations"))).toEqual([]);
  });
});
