import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { GET, PUT } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/requestContext", () => ({
  withRequestContext: (fn) => fn,
  withSavepoint: (fn) => fn(),
}));

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const put = (body) =>
  new Request("http://localhost/api/notification-prefs/quiet-hours", { method: "PUT", body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  delete process.env.NOTIF_V2_ENABLED;
  auth.mockResolvedValue(SESSION);
});
afterEach(() => {
  delete process.env.NOTIF_V2_ENABLED;
});

describe("auth + flag", () => {
  it("anonymous → 401", async () => {
    auth.mockResolvedValue(undefined);
    expect((await GET()).status).toBe(401);
    expect((await PUT(put({ enabled: false }))).status).toBe(401);
  });
  it("flag OFF → no-op and NO query", async () => {
    expect(await (await GET()).json()).toEqual({ skipped: "disabled" });
    expect(await (await PUT(put({ enabled: false }))).json()).toEqual({ ok: true, skipped: "disabled" });
    expect(sql).not.toHaveBeenCalled();
  });
});

describe("flag ON", () => {
  beforeEach(() => {
    process.env.NOTIF_V2_ENABLED = "true";
  });

  it("GET: defaults when the owner never set them", async () => {
    sql.mockResolvedValueOnce([{ id: 7 }]);
    sql.mockResolvedValueOnce([]);
    expect(await (await GET()).json()).toEqual({ enabled: true, start: 22, end: 8 });
  });

  it("GET: the stored row; a missing table (0132 not applied) degrades to the defaults", async () => {
    sql.mockResolvedValueOnce([{ id: 7 }]);
    sql.mockResolvedValueOnce([{ quiet_hours_enabled: true, quiet_start: 21, quiet_end: 6 }]);
    expect(await (await GET()).json()).toEqual({ enabled: true, start: 21, end: 6 });
    sql.mockResolvedValueOnce([{ id: 7 }]);
    sql.mockRejectedValueOnce(Object.assign(new Error("x"), { code: "42P01" }));
    expect(await (await GET()).json()).toEqual({ enabled: true, start: 22, end: 8 });
  });

  it("PUT validates input (400, nothing written)", async () => {
    for (const body of [{}, { enabled: "no" }, { start: 24 }, { start: -1 }, { end: 7.5 }, { end: "8" }]) {
      expect((await PUT(put(body))).status, JSON.stringify(body)).toBe(400);
    }
    expect(sql).not.toHaveBeenCalled();
  });

  it("PUT upserts the caller's OWN row only (owner resolved from the session)", async () => {
    sql.mockResolvedValueOnce([{ id: 7 }]);
    sql.mockResolvedValueOnce([{ quiet_hours_enabled: false, quiet_start: 22, quiet_end: 8 }]);
    const res = await PUT(put({ enabled: false }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ enabled: false, start: 22, end: 8 });
    const lookup = sql.mock.calls[0];
    expect(lookup.slice(1)).toEqual([42]); // auth_user_id
    const upsert = sql.mock.calls[1];
    expect(upsert[1]).toBe(7); // owner_user_id is the profile id, never a client-supplied value
  });

  it("PUT without a profile → 404; table missing → 503 (not a 500)", async () => {
    sql.mockResolvedValueOnce([]);
    expect((await PUT(put({ start: 21 }))).status).toBe(404);
    sql.mockResolvedValueOnce([{ id: 7 }]);
    sql.mockRejectedValueOnce(Object.assign(new Error("x"), { code: "42P01" }));
    expect((await PUT(put({ start: 21 }))).status).toBe(503);
  });
});
