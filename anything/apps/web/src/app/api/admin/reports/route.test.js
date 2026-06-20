import { describe, it, expect, vi, beforeEach } from "vitest";

// GET /api/admin/reports — admin moderation queue (Guideline 1.2, T2).

import { GET } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { resolveUserId } from "@/app/api/utils/currentUser";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/currentUser", () => ({ resolveUserId: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const get = () => new Request("http://localhost/api/admin/reports");

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  resolveUserId.mockResolvedValue(7);
});

describe("GET /api/admin/reports", () => {
  it("anonymous → 401", async () => {
    auth.mockResolvedValue(undefined);
    expect((await GET(get())).status).toBe(401);
  });

  it("a non-admin → 403", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ is_admin: false }]);
    expect((await GET(get())).status).toBe(403);
  });

  it("an admin gets the queue via the DEFINER helper → 200", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ is_admin: true }]);
    sql.mockResolvedValueOnce([{ id: 1, target_type: "post", status: "open" }]);
    const res = await GET(get());
    expect(res.status).toBe(200);
    expect((await res.json()).reports).toHaveLength(1);
    expect(sql.mock.calls[1][0].join(" ")).toContain("app_admin_list_reports");
  });
});
