import { describe, it, expect, vi, beforeEach } from "vitest";

// PATCH /api/providers/[id]/services/reorder — set sort_order by array index (Phase 2c-i).
// Owner|admin only; one provider-scoped unnest() UPDATE. Mirrors shop-products/reorder.

import { PATCH } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const PROFILE_ROW = { id: 7, auth_user_id: 42 };
const MEMBERSHIP = [{ id: 1, provider_id: 100, user_profile_id: 7, status: "active", role: "owner" }];
const PARAMS = { params: { id: "100" } };

const queryTextOf = (i) => (sql.mock.calls[i]?.[0] ?? []).join(" ");
const valuesOf = (i) => sql.mock.calls[i]?.slice(1) ?? [];
const allText = () => sql.mock.calls.map((c) => (c?.[0] ?? []).join(" ")).join(" | ");

const req = (body) =>
  new Request("http://localhost/api/providers/100/services/reorder", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("PATCH services/reorder", () => {
  it("403 for a non-owner/admin caller (no membership row)", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]).mockResolvedValueOnce([]);
    const res = await PATCH(req({ ordered_ids: [1, 2] }), PARAMS);
    expect(res.status).toBe(403);
    expect(allText()).not.toContain("UPDATE provider_services");
  });

  it("422 when ordered_ids is not an array of integers", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]).mockResolvedValueOnce(MEMBERSHIP);
    const res = await PATCH(req({ ordered_ids: "nope" }), PARAMS);
    expect(res.status).toBe(422);
    expect(allText()).not.toContain("UPDATE provider_services");
  });

  it("200 issues one provider-scoped unnest UPDATE with the ids + positions", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]).mockResolvedValueOnce(MEMBERSHIP).mockResolvedValueOnce([]);

    const res = await PATCH(req({ ordered_ids: [5, 3] }), PARAMS);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const text = queryTextOf(2);
    expect(text).toContain("UPDATE provider_services");
    expect(text).toContain("unnest(");
    expect(text).toContain("ps.provider_id =");
    expect(valuesOf(2)).toEqual(expect.arrayContaining([[5, 3], [0, 1], "100"]));
  });
});
