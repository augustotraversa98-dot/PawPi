import { describe, it, expect, vi, beforeEach } from "vitest";

// /api/push-tokens — device Expo push-token registry (BN2 PR1).

import { POST, DELETE } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { resolveUserId } from "@/app/api/utils/currentUser";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/currentUser", () => ({ resolveUserId: vi.fn() }));
// withRequestContext just needs to pass the handler through in unit tests.
vi.mock("@/app/api/utils/requestContext", () => ({
  withRequestContext: (fn) => fn,
}));

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const req = (method, body) =>
  new Request("http://localhost/api/push-tokens", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/push-tokens", () => {
  it("anonymous → 401", async () => {
    auth.mockResolvedValue(undefined);
    expect((await POST(req("POST", { token: "x" }))).status).toBe(401);
  });

  it("no profile → 404", async () => {
    auth.mockResolvedValue(SESSION);
    resolveUserId.mockResolvedValue(null);
    expect((await POST(req("POST", { token: "x" }))).status).toBe(404);
  });

  it("missing token → 400", async () => {
    auth.mockResolvedValue(SESSION);
    resolveUserId.mockResolvedValue(7);
    expect((await POST(req("POST", { platform: "ios" }))).status).toBe(400);
  });

  it("upserts the caller's token → 201 with id", async () => {
    auth.mockResolvedValue(SESSION);
    resolveUserId.mockResolvedValue(7);
    sql.mockResolvedValueOnce([{ id: 3, platform: "ios" }]);
    const res = await POST(req("POST", { token: "ExponentPushToken[x]", platform: "ios" }));
    expect(res.status).toBe(201);
    expect((await res.json())).toMatchObject({ ok: true, id: 3 });
  });

  it("defaults an unknown platform to ios", async () => {
    auth.mockResolvedValue(SESSION);
    resolveUserId.mockResolvedValue(7);
    sql.mockResolvedValueOnce([{ id: 3, platform: "ios" }]);
    await POST(req("POST", { token: "t", platform: "windows" }));
    // The platform bound into the query is the second interpolated value.
    const values = sql.mock.calls[0].slice(1);
    expect(values).toContain("ios");
  });

  it("unmigrated table (42P01) → friendly 503", async () => {
    auth.mockResolvedValue(SESSION);
    resolveUserId.mockResolvedValue(7);
    sql.mockRejectedValueOnce({ code: "42P01" });
    expect((await POST(req("POST", { token: "t" }))).status).toBe(503);
  });
});

describe("DELETE /api/push-tokens", () => {
  it("removes the caller's token → ok", async () => {
    auth.mockResolvedValue(SESSION);
    resolveUserId.mockResolvedValue(7);
    sql.mockResolvedValueOnce([]);
    const res = await DELETE(req("DELETE", { token: "t" }));
    expect(res.status).toBe(200);
    expect((await res.json())).toEqual({ ok: true });
  });

  it("missing token → 400", async () => {
    auth.mockResolvedValue(SESSION);
    resolveUserId.mockResolvedValue(7);
    expect((await DELETE(req("DELETE", {}))).status).toBe(400);
  });
});
