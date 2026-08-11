import { describe, it, expect, vi, beforeEach } from "vitest";

// PATCH /api/providers/[id]/shop-products/[productId] — the Phase 2c-i additions: accept
// is_featured + compare_at_cents, enforcing compare_at_cents IS NULL OR > the effective price
// (matching the 0077 CHECK) with a 422. `auth`/`sql` mocked; the capability + role gates run
// their real (mocked) SQL, matching the shop-products/route.js test convention.
//
// sql call order on the happy path: resolveUserId → provider_has_capability →
// requireProviderRole membership → [compare_at price lookup] → UPDATE.

import { PATCH } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const PROFILE_ROW = { id: 7, auth_user_id: 42 };
const HAS_CAP = [{ has: true }];
const MEMBERSHIP = [{ id: 1, provider_id: 100, user_profile_id: 7, status: "active", role: "admin" }];
const PARAMS = { params: { id: "100", productId: "9" } };

const queryTextOf = (i) => (sql.mock.calls[i]?.[0] ?? []).join(" ");
const valuesOf = (i) => sql.mock.calls[i]?.slice(1) ?? [];
const allText = () => sql.mock.calls.map((c) => (c?.[0] ?? []).join(" ")).join(" | ");

const patchReq = (body) =>
  new Request("http://localhost/api/providers/100/shop-products/9", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("PATCH shop-products/[productId] — merchandising fields (2c-i)", () => {
  it("401 when unauthenticated", async () => {
    auth.mockResolvedValue(null);
    expect((await PATCH(patchReq({ is_featured: true }), PARAMS)).status).toBe(401);
  });

  it("403 for a non-owner/admin caller (no membership row)", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // resolveUserId
      .mockResolvedValueOnce(HAS_CAP) // capability gate
      .mockResolvedValueOnce([]); // requireProviderRole → no membership
    const res = await PATCH(patchReq({ is_featured: true }), PARAMS);
    expect(res.status).toBe(403);
    expect(allText()).not.toContain("UPDATE shop_products");
  });

  it("accepts is_featured + compare_at_cents (with price in body) and binds them", async () => {
    auth.mockResolvedValue(SESSION);
    const UPDATED = { id: 9, provider_id: 100, is_featured: true, compare_at_cents: 100000 };
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce(HAS_CAP)
      .mockResolvedValueOnce(MEMBERSHIP)
      .mockResolvedValueOnce([UPDATED]); // UPDATE (price in body → no pre-select)

    const res = await PATCH(patchReq({ is_featured: true, price_cents: 80000, compare_at_cents: 100000 }), PARAMS);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ product: UPDATED });
    const text = queryTextOf(3);
    expect(text).toContain("is_featured = COALESCE(");
    expect(text).toContain("compare_at_cents = CASE WHEN");
    expect(text).toContain("AND provider_id =");
    expect(valuesOf(3)).toEqual(expect.arrayContaining([true, 100000, "9", "100"]));
  });

  it("rejects compare_at_cents <= price_cents (both in body) with 422 and no write", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]).mockResolvedValueOnce(HAS_CAP).mockResolvedValueOnce(MEMBERSHIP);

    const res = await PATCH(patchReq({ price_cents: 90000, compare_at_cents: 90000 }), PARAMS);

    expect(res.status).toBe(422);
    expect(allText()).not.toContain("UPDATE shop_products");
  });

  it("rejects compare_at_cents <= the STORED price (price not in body) via a scoped lookup", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce(HAS_CAP)
      .mockResolvedValueOnce(MEMBERSHIP)
      .mockResolvedValueOnce([{ price_cents: 100000 }]); // current price lookup

    const res = await PATCH(patchReq({ compare_at_cents: 90000 }), PARAMS);

    expect(res.status).toBe(422);
    expect(queryTextOf(3)).toContain("AND provider_id ="); // the price lookup is scoped
    expect(allText()).not.toContain("UPDATE shop_products");
  });

  it("compare_at_cents: null is accepted (clears the discount)", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce(HAS_CAP)
      .mockResolvedValueOnce(MEMBERSHIP)
      .mockResolvedValueOnce([{ id: 9, compare_at_cents: null }]);

    const res = await PATCH(patchReq({ compare_at_cents: null }), PARAMS);

    expect(res.status).toBe(200);
    expect(queryTextOf(3)).toContain("compare_at_cents = CASE WHEN");
  });
});

// Defense-in-depth: a non-integer productId (a static path like "reorder" that reached this
// dynamic handler) must 404 BEFORE any SQL — never bound as an integer in Postgres.
describe("non-integer productId guard", () => {
  it("PATCH with a non-numeric productId → 404, no SQL", async () => {
    auth.mockResolvedValue(SESSION);
    const res = await PATCH(patchReq({ name: "x" }), {
      params: { id: "100", productId: "reorder" },
    });
    expect(res.status).toBe(404);
    expect(sql).not.toHaveBeenCalled();
  });
});
