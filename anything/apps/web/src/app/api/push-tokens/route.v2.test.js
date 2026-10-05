import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// POST /api/push-tokens under notifications v2: last_seen stamped + invalid_since cleared; flag OFF and a
// missing 0131 schema both fall back to the unchanged legacy upsert.

import { POST } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { resolveOrCreateUserId } from "@/app/api/utils/currentUser";
import { __resetNotifV2SchemaStateForTests } from "@/app/api/utils/notifV2";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/currentUser", () => ({ resolveUserId: vi.fn(), resolveOrCreateUserId: vi.fn() }));
vi.mock("@/app/api/utils/requestContext", () => ({
  withRequestContext: (fn) => fn,
  withSavepoint: (fn) => fn(),
}));

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const req = (body) =>
  new Request("http://localhost/api/push-tokens", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const text = (c) => c[0].join("?");

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  __resetNotifV2SchemaStateForTests();
  delete process.env.NOTIF_V2_ENABLED;
  auth.mockResolvedValue(SESSION);
  resolveOrCreateUserId.mockResolvedValue(7);
});
afterEach(() => {
  delete process.env.NOTIF_V2_ENABLED;
});

describe("POST /api/push-tokens — v2", () => {
  it("flag OFF: only the legacy upsert runs (no last_seen / invalid_since column touched)", async () => {
    sql.mockResolvedValueOnce([{ id: 3, platform: "ios" }]);
    const res = await POST(req({ token: "ExponentPushToken[x]", platform: "ios" }));
    expect(res.status).toBe(201);
    expect(sql).toHaveBeenCalledTimes(1);
    expect(text(sql.mock.calls[0])).not.toMatch(/last_seen|invalid_since/);
  });

  it("flag ON: re-registering stamps last_seen and CLEARS invalid_since", async () => {
    process.env.NOTIF_V2_ENABLED = "true";
    sql.mockResolvedValueOnce([{ id: 3, platform: "ios" }]);
    const res = await POST(req({ token: "ExponentPushToken[x]", platform: "ios" }));
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ ok: true, id: 3 });
    expect(sql).toHaveBeenCalledTimes(1);
    const q = text(sql.mock.calls[0]);
    expect(q).toContain("last_seen = now()");
    expect(q).toContain("invalid_since = NULL");
  });

  it("flag ON but 0131 not applied (42703): falls back to the legacy upsert, still 201", async () => {
    process.env.NOTIF_V2_ENABLED = "true";
    sql.mockRejectedValueOnce(Object.assign(new Error("column missing"), { code: "42703" }));
    sql.mockResolvedValueOnce([{ id: 9, platform: "ios" }]);
    const res = await POST(req({ token: "ExponentPushToken[x]", platform: "ios" }));
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ id: 9 });
    expect(sql).toHaveBeenCalledTimes(2);
    expect(text(sql.mock.calls[1])).not.toMatch(/last_seen|invalid_since/);
  });
});
