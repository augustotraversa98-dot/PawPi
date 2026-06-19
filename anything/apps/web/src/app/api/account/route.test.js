import { describe, it, expect, vi, beforeEach } from "vitest";

// DELETE /api/account — in-app account deletion (ticket 2.78). Calls delete_my_account() for the
// signed-in caller; falls back to deleting the auth row when there's no profile yet.

import { DELETE } from "./route";
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

describe("DELETE /api/account", () => {
  it("anonymous → 401", async () => {
    auth.mockResolvedValue(undefined);
    expect((await DELETE()).status).toBe(401);
  });

  it("deletes the account via delete_my_account() → 200", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ ok: true }]);
    const res = await DELETE();
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    expect(sql.mock.calls[0][0].join(" ")).toContain("delete_my_account");
  });

  it("returns 404 when the fn reports no account", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ ok: false }]);
    expect((await DELETE()).status).toBe(404);
  });

  it("no profile yet → deletes the auth row directly → 200", async () => {
    auth.mockResolvedValue(SESSION);
    resolveUserId.mockResolvedValueOnce(null);
    sql.mockResolvedValueOnce([]); // DELETE FROM auth_users
    const res = await DELETE();
    expect(res.status).toBe(200);
    expect((await res.json()).deleted).toBe("auth_only");
    expect(sql.mock.calls[0][0].join(" ")).toContain("DELETE FROM auth_users");
  });
});
