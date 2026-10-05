import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// PUT /api/user-profile/timezone (notifications v2, PR 3a): flag-gated, validated, owner-scoped.

import { PUT } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/requestContext", () => ({ withRequestContext: (fn) => fn }));

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const put = (body) =>
  new Request("http://localhost/api/user-profile/timezone", { method: "PUT", body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  delete process.env.NOTIF_V2_ENABLED;
});
afterEach(() => {
  delete process.env.NOTIF_V2_ENABLED;
});

describe("flag OFF", () => {
  it("anonymous → 401", async () => {
    auth.mockResolvedValue(undefined);
    expect((await PUT(put({ timezone: "Europe/Madrid" }))).status).toBe(401);
  });
  it("signed in → 200 no-op and NO database query at all", async () => {
    auth.mockResolvedValue(SESSION);
    const res = await PUT(put({ timezone: "Europe/Madrid" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, skipped: "disabled" });
    expect(sql).not.toHaveBeenCalled();
  });
});

describe("flag ON", () => {
  beforeEach(() => {
    process.env.NOTIF_V2_ENABLED = "1";
  });

  it("stores a known zone for the caller (scoped by auth_user_id)", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ name: "Europe/Madrid" }]); // pg_timezone_names
    sql.mockResolvedValueOnce([{ timezone: "Europe/Madrid" }]); // UPDATE
    const res = await PUT(put({ timezone: "Europe/Madrid" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, timezone: "Europe/Madrid" });
    const upd = sql.mock.calls[1];
    expect(upd[0].join("?")).toContain("UPDATE user_profiles");
    expect(upd.slice(1)).toEqual(["Europe/Madrid", 42]);
  });

  it("rejects non-IANA input (400) without touching the DB", async () => {
    auth.mockResolvedValue(SESSION);
    for (const timezone of ["", "bogus", "x; drop table user_profiles", 7, null, "a".repeat(100)]) {
      expect((await PUT(put({ timezone }))).status, String(timezone)).toBe(400);
    }
    expect((await PUT(put({}))).status).toBe(400);
    expect(sql).not.toHaveBeenCalled();
  });

  it("rejects a zone Postgres does not know (400, nothing stored)", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([]); // not in pg_timezone_names
    expect((await PUT(put({ timezone: "Europe/Madrid" }))).status).toBe(400);
    expect(sql).toHaveBeenCalledTimes(1);
  });

  it("no profile row → 404", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ name: "Europe/Madrid" }]);
    sql.mockResolvedValueOnce([]);
    expect((await PUT(put({ timezone: "Europe/Madrid" }))).status).toBe(404);
  });

  it("DB failure → 500 with a generic message", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockRejectedValueOnce(new Error("secret internals"));
    const res = await PUT(put({ timezone: "Europe/Madrid" }));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("secret internals");
  });
});
