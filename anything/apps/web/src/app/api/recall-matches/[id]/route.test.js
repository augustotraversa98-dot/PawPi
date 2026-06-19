import { describe, it, expect, vi, beforeEach } from "vitest";

// PATCH /api/recall-matches/[id] — the owner dismisses a recall alert (ticket 2.75). RLS owner_all
// scopes the row; a non-owner touches ZERO → 404.

import { PATCH } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { resolveUserId } from "@/app/api/utils/currentUser";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/currentUser", () => ({ resolveUserId: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const PARAMS = { params: { id: "2" } };
const patch = () => new Request("http://localhost/api/recall-matches/2", { method: "PATCH" });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  resolveUserId.mockResolvedValue(7);
});

describe("PATCH /api/recall-matches/[id]", () => {
  it("anonymous → 401", async () => {
    auth.mockResolvedValue(undefined);
    expect((await PATCH(patch(), PARAMS)).status).toBe(401);
  });

  it("no profile yet → 404", async () => {
    auth.mockResolvedValue(SESSION);
    resolveUserId.mockResolvedValueOnce(null);
    expect((await PATCH(patch(), PARAMS)).status).toBe(404);
  });

  it("owner dismisses own alert → 200", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ id: 2 }]);
    const res = await PATCH(patch(), PARAMS);
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    const q = sql.mock.calls[0][0].join(" ");
    expect(q).toContain("SET dismissed_at = now()");
    expect(q).toContain("owner_user_id =");
    expect(q).toContain("dismissed_at IS NULL");
  });

  it("non-owner / already dismissed → 404", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([]);
    expect((await PATCH(patch(), PARAMS)).status).toBe(404);
  });

  it("DB failure → 500", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockRejectedValueOnce(new Error("boom"));
    expect((await PATCH(patch(), PARAMS)).status).toBe(500);
  });
});
