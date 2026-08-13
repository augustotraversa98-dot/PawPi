import { describe, it, expect, vi, beforeEach } from "vitest";

// GET /api/providers/[id]/walk-credits — the OWNER's remaining prepaid walk balance with this
// provider (Ticket B2). Owner-context (RLS scopes to own packs). Degrade-clean (missing table → 0).
// 404 non-integer id before SQL. auth/sql mocked.

import { GET } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const PROFILE_ROW = { id: 7, auth_user_id: 42 };
const PARAMS = { params: { id: "100" } };
const getReq = () => new Request("http://localhost/api/providers/100/walk-credits");

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/providers/[id]/walk-credits", () => {
  it("401 for a guest", async () => {
    auth.mockResolvedValue(null);
    const res = await GET(getReq(), PARAMS);
    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  it("404 (before SQL) for a non-integer provider id", async () => {
    auth.mockResolvedValue(SESSION);
    const res = await GET(getReq(), { params: { id: "reorder" } });
    expect(res.status).toBe(404);
    expect(sql).not.toHaveBeenCalled();
  });

  it("returns the summed remaining balance", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]).mockResolvedValueOnce([{ remaining: 9 }]);
    const res = await GET(getReq(), PARAMS);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ remaining: 9 });
    expect(sql.mock.calls[1][0].join(" ")).toContain("walk_credit_packs");
  });

  it("degrades clean when the table is absent → 0", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockRejectedValueOnce(
        Object.assign(new Error('relation "walk_credit_packs" does not exist'), { code: "42P01" }),
      );
    const res = await GET(getReq(), PARAMS);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ remaining: 0 });
  });
});
