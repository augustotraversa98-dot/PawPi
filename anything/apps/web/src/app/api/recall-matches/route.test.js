import { describe, it, expect, vi, beforeEach } from "vitest";

// GET /api/recall-matches — active (non-dismissed) food-recall alerts for the owner's pets (ticket
// 2.75). RLS scopes the rows to the caller; dismissed alerts are filtered out.

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

describe("GET /api/recall-matches", () => {
  it("anonymous → 401", async () => {
    auth.mockResolvedValue(undefined);
    expect((await GET()).status).toBe(401);
  });

  it("no profile yet → 404", async () => {
    auth.mockResolvedValue(SESSION);
    resolveUserId.mockResolvedValueOnce(null);
    expect((await GET()).status).toBe(404);
  });

  it("owner-scoped, non-dismissed alerts → 200", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ id: 1, pet_name: "Rex", brand: "Acme" }]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).matches).toHaveLength(1);
    const q = sql.mock.calls[0][0].join(" ");
    expect(q).toContain("m.owner_user_id =");
    expect(q).toContain("m.dismissed_at IS NULL");
  });

  it("DB failure → 500", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockRejectedValueOnce(new Error("boom"));
    expect((await GET()).status).toBe(500);
  });
});
