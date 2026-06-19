import { describe, it, expect, vi, beforeEach } from "vitest";

// /api/nutrition-plans/[id] — owner edits (PATCH) or soft-deletes (DELETE) their plan (ticket 2.75).
// RLS owner_all scopes the row; a non-owner touches ZERO → 404.

import { PATCH, DELETE } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { resolveUserId } from "@/app/api/utils/currentUser";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/currentUser", () => ({ resolveUserId: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const PARAMS = { params: { id: "6" } };
const patch = (body) =>
  new Request("http://localhost/api/nutrition-plans/6", { method: "PATCH", body: JSON.stringify(body) });
const del = () => new Request("http://localhost/api/nutrition-plans/6", { method: "DELETE" });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  resolveUserId.mockResolvedValue(7);
});

describe("PATCH /api/nutrition-plans/[id]", () => {
  it("anonymous → 401", async () => {
    auth.mockResolvedValue(undefined);
    expect((await PATCH(patch({ notes: "x" }), PARAMS)).status).toBe(401);
  });

  it("no profile yet → 404", async () => {
    auth.mockResolvedValue(SESSION);
    resolveUserId.mockResolvedValueOnce(null);
    expect((await PATCH(patch({ notes: "x" }), PARAMS)).status).toBe(404);
  });

  it("invalid food_form → 400", async () => {
    auth.mockResolvedValue(SESSION);
    const res = await PATCH(patch({ food_form: "gas" }), PARAMS);
    expect(res.status).toBe(400);
    expect(sql).not.toHaveBeenCalled();
  });

  it("owner edit → 200", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ id: 6, food_form: "raw" }]);
    const res = await PATCH(patch({ food_form: "raw" }), PARAMS);
    expect(res.status).toBe(200);
    expect((await res.json()).plan).toMatchObject({ food_form: "raw" });
    const q = sql.mock.calls[0][0].join(" ");
    expect(q).toContain("UPDATE nutrition_plans");
    expect(q).toContain("owner_user_id =");
  });

  it("non-owner → ZERO rows → 404", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([]);
    expect((await PATCH(patch({ notes: "x" }), PARAMS)).status).toBe(404);
  });
});

describe("DELETE /api/nutrition-plans/[id]", () => {
  it("anonymous → 401", async () => {
    auth.mockResolvedValue(undefined);
    expect((await DELETE(del(), PARAMS)).status).toBe(401);
  });

  it("owner soft-delete → 200", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ id: 6 }]);
    const res = await DELETE(del(), PARAMS);
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    expect(sql.mock.calls[0][0].join(" ")).toContain("deleted_at = now()");
  });

  it("non-owner / already deleted → 404", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([]);
    expect((await DELETE(del(), PARAMS)).status).toBe(404);
  });
});
