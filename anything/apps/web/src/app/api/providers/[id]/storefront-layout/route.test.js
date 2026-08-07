import { describe, it, expect, vi, beforeEach } from "vitest";

// PATCH /api/providers/[id]/storefront-layout — set/clear providers.storefront_section_order
// (Phase 2c-i). Owner|admin only; validates the section keys (rejects unknown/duplicate);
// null clears the column. `auth`/`sql` mocked; the providerAuth helper runs its real SQL
// (mocked here) — matching the shop-products/route.js test convention.

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
  new Request("http://localhost/api/providers/100/storefront-layout", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("PATCH storefront-layout", () => {
  it("401 when unauthenticated", async () => {
    auth.mockResolvedValue(null);
    expect((await PATCH(req({ section_order: null }), PARAMS)).status).toBe(401);
  });

  it("403 for a non-owner/admin caller (no membership row)", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // resolveUserId
      .mockResolvedValueOnce([]); // requireProviderRole → no active membership
    const res = await PATCH(req({ section_order: ["about"] }), PARAMS);
    expect(res.status).toBe(403);
    expect(allText()).not.toContain("UPDATE providers");
  });

  it("422 when section_order is missing (undefined)", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]).mockResolvedValueOnce(MEMBERSHIP);
    const res = await PATCH(req({}), PARAMS);
    expect(res.status).toBe(422);
    expect(allText()).not.toContain("UPDATE providers");
  });

  it("422 on an unknown section key", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]).mockResolvedValueOnce(MEMBERSHIP);
    const res = await PATCH(req({ section_order: ["items", "clearance"] }), PARAMS);
    expect(res.status).toBe(422);
    expect(allText()).not.toContain("UPDATE providers");
  });

  it("422 on a duplicate section key", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]).mockResolvedValueOnce(MEMBERSHIP);
    const res = await PATCH(req({ section_order: ["items", "items"] }), PARAMS);
    expect(res.status).toBe(422);
    expect(allText()).not.toContain("UPDATE providers");
  });

  it("200 writes a valid section order, scoped to the provider", async () => {
    auth.mockResolvedValue(SESSION);
    const order = ["items", "posts", "about"];
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce(MEMBERSHIP)
      .mockResolvedValueOnce([{ id: 100, storefront_section_order: order }]);

    const res = await PATCH(req({ section_order: order }), PARAMS);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ section_order: order });
    const text = queryTextOf(2);
    expect(text).toContain("UPDATE providers");
    expect(text).toContain("storefront_section_order =");
    expect(text).toContain("WHERE id =");
    expect(valuesOf(2)).toEqual(expect.arrayContaining([order, "100"]));
  });

  it("200 with null clears the override", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce(MEMBERSHIP)
      .mockResolvedValueOnce([{ id: 100, storefront_section_order: null }]);

    const res = await PATCH(req({ section_order: null }), PARAMS);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ section_order: null });
    expect(valuesOf(2)).toContain(null);
  });

  it("404 when the scoped update matches no row", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce(MEMBERSHIP)
      .mockResolvedValueOnce([]);
    const res = await PATCH(req({ section_order: ["about"] }), PARAMS);
    expect(res.status).toBe(404);
  });
});
