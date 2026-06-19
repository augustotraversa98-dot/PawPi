import { describe, it, expect, vi, beforeEach } from "vitest";

// DELETE /api/saved-places/[id] — unsave a favorite (ticket 2.73). RLS owner_all scopes the delete;
// a non-owner deletes ZERO → 404.

import { DELETE } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { resolveUserId } from "@/app/api/utils/currentUser";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/currentUser", () => ({ resolveUserId: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const PARAMS = { params: { id: "4" } };
const del = () => new Request("http://localhost/api/saved-places/4", { method: "DELETE" });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  resolveUserId.mockResolvedValue(7);
});

describe("DELETE /api/saved-places/[id]", () => {
  it("anonymous → 401", async () => {
    auth.mockResolvedValue(undefined);
    expect((await DELETE(del(), PARAMS)).status).toBe(401);
  });

  it("no profile yet → 404", async () => {
    auth.mockResolvedValue(SESSION);
    resolveUserId.mockResolvedValueOnce(null);
    expect((await DELETE(del(), PARAMS)).status).toBe(404);
  });

  it("owner deletes own → 200", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ id: 4 }]);
    const res = await DELETE(del(), PARAMS);
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    const q = sql.mock.calls[0][0].join(" ");
    expect(q).toContain("DELETE FROM saved_places");
    expect(q).toContain("owner_user_id =");
  });

  it("non-owner → ZERO rows → 404", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([]);
    expect((await DELETE(del(), PARAMS)).status).toBe(404);
  });

  it("DB failure → 500", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockRejectedValueOnce(new Error("boom"));
    expect((await DELETE(del(), PARAMS)).status).toBe(500);
  });
});
