import { describe, it, expect, vi, beforeEach } from "vitest";

// POST /api/admin/reports/[id]/action — admin act on a report (Guideline 1.2, T2).

import { POST } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { resolveUserId } from "@/app/api/utils/currentUser";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/currentUser", () => ({ resolveUserId: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const post = (body) =>
  new Request("http://localhost/api/admin/reports/3/action", {
    method: "POST",
    body: JSON.stringify(body),
  });
const P = { params: { id: "3" } };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  resolveUserId.mockResolvedValue(7);
});

describe("POST /api/admin/reports/[id]/action", () => {
  it("anonymous → 401", async () => {
    auth.mockResolvedValue(undefined);
    expect((await POST(post({ action: "hide" }), P)).status).toBe(401);
  });

  it("a non-admin → 403", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ is_admin: false }]);
    expect((await POST(post({ action: "hide" }), P)).status).toBe(403);
  });

  it("an invalid action → 400", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ is_admin: true }]);
    expect((await POST(post({ action: "nuke" }), P)).status).toBe(400);
  });

  it("admin 'hide' → 200 (calls the DEFINER action helper)", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ is_admin: true }]);
    sql.mockResolvedValueOnce([]); // app_admin_action_report
    const res = await POST(post({ action: "hide" }), P);
    expect(res.status).toBe(200);
    expect((await res.json()).actioned).toBe(true);
    expect(sql.mock.calls[1][0].join(" ")).toContain("app_admin_action_report");
  });

  it("admin 'remove' with ban → 200 (ban flag threaded)", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ is_admin: true }]);
    sql.mockResolvedValueOnce([]);
    const res = await POST(post({ action: "remove", ban: true }), P);
    expect(res.status).toBe(200);
    expect((await res.json()).ban).toBe(true);
  });

  it("a missing report → 404", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ is_admin: true }]);
    sql.mockRejectedValueOnce(new Error("report not found"));
    expect((await POST(post({ action: "dismiss" }), P)).status).toBe(404);
  });
});
