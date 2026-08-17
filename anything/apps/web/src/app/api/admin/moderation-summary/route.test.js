import { describe, it, expect, vi, beforeEach } from "vitest";

// GET /api/admin/moderation-summary — the capability probe for the moderation nav link (MOD2 PR2).

import { GET } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { resolveUserId } from "@/app/api/utils/currentUser";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/currentUser", () => ({ resolveUserId: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: "9999999999" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  resolveUserId.mockResolvedValue(7);
});

describe("GET /api/admin/moderation-summary", () => {
  it("anonymous → 401", async () => {
    auth.mockResolvedValue(undefined);
    expect((await GET()).status).toBe(401);
  });

  it("a non-admin → 200 { is_admin: false } (not a 403 — it's a probe)", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ is_admin: false }]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.is_admin).toBe(false);
    expect(body.open_count).toBe(0);
    // never runs the (admin-only) count query
    expect(sql).toHaveBeenCalledTimes(1);
  });

  it("an admin → 200 { is_admin: true, open_count } via the v2 DEFINER reader", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ is_admin: true }]);
    sql.mockResolvedValueOnce([{ open_count: 3 }]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ is_admin: true, open_count: 3 });
    expect(sql.mock.calls[1][0].join(" ")).toContain("app_admin_list_reports_v2");
  });

  it("a DB error degrades to { is_admin: false } (link hidden, no hard error)", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockRejectedValueOnce(new Error("boom"));
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ is_admin: false, open_count: 0 });
  });
});
