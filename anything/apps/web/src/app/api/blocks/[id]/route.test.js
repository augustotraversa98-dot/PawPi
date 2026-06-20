import { describe, it, expect, vi, beforeEach } from "vitest";

// DELETE /api/blocks/[id] — unblock = soft-delete (Guideline 1.2, T2).

import { DELETE } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { resolveUserId } from "@/app/api/utils/currentUser";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/currentUser", () => ({ resolveUserId: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const del = () => new Request("http://localhost/api/blocks/3", { method: "DELETE" });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  resolveUserId.mockResolvedValue(7);
});

describe("DELETE /api/blocks/[id]", () => {
  it("anonymous → 401", async () => {
    auth.mockResolvedValue(undefined);
    expect((await DELETE(del(), { params: { id: "3" } })).status).toBe(401);
  });

  it("invalid id → 400", async () => {
    auth.mockResolvedValue(SESSION);
    expect((await DELETE(del(), { params: { id: "abc" } })).status).toBe(400);
  });

  it("not the blocker's row → 404", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([]); // nothing updated
    expect((await DELETE(del(), { params: { id: "3" } })).status).toBe(404);
  });

  it("soft-deletes the caller's own block → 200", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ id: 3 }]);
    const res = await DELETE(del(), { params: { id: "3" } });
    expect(res.status).toBe(200);
    expect((await res.json()).unblocked).toBe(true);
    expect(sql.mock.calls[0][0].join(" ")).toContain("UPDATE user_blocks SET deleted_at");
  });
});
