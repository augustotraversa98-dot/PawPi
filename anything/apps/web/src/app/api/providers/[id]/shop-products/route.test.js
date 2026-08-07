import { describe, it, expect, vi, beforeEach } from "vitest";

// /api/providers/[id]/shop-products — a shop's catalog (Ticket 2.11). GET gates the 'shop'
// capability; POST additionally requires provider-admin (catalog writes are admin-only).
// `auth`/`sql` mocked; providerAuth helpers run real SQL (mocked here).

import { GET, POST } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const PROFILE_ROW = { id: 7, auth_user_id: 42 };
const PARAMS = { params: { id: "100" } }; // provider id

const getReq = () =>
  new Request("http://localhost/api/providers/100/shop-products");
const postReq = (body) =>
  new Request("http://localhost/api/providers/100/shop-products", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });

const allQueryText = () =>
  sql.mock.calls.map((c) => (c?.[0] ?? []).join(" ")).join(" | ");

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/providers/[id]/shop-products", () => {
  it("401 when unauthenticated", async () => {
    auth.mockResolvedValue(null);
    expect((await GET(getReq(), PARAMS)).status).toBe(401);
  });

  it("403 when the provider lacks the 'shop' capability", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // resolveUserId
      .mockResolvedValueOnce([{ has: false }]); // provider_has_capability → false
    const res = await GET(getReq(), PARAMS);
    expect(res.status).toBe(403);
  });

  it("200 lists products for a shop provider", async () => {
    auth.mockResolvedValue(SESSION);
    const PRODUCTS = [{ id: 1, name: "Kibble", active: true }];
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // resolveUserId
      .mockResolvedValueOnce([{ has: true }]) // capability
      .mockResolvedValueOnce(PRODUCTS); // products (RLS-scoped)
    const res = await GET(getReq(), PARAMS);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.products).toEqual(PRODUCTS);
  });

  it("orders featured-first → sort_order → recency and projects the merchandising columns (Phase 2a)", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // resolveUserId
      .mockResolvedValueOnce([{ has: true }]) // capability
      .mockResolvedValueOnce([]); // products
    await GET(getReq(), PARAMS);
    const q = allQueryText();
    expect(q).toContain("ORDER BY is_featured DESC, sort_order ASC, created_at DESC");
    expect(q).toContain("is_featured");
    expect(q).toContain("sort_order");
    expect(q).toContain("compare_at_cents");
  });
});

describe("POST /api/providers/[id]/shop-products", () => {
  it("403 when not provider admin", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // resolveUserId
      .mockResolvedValueOnce([{ has: true }]) // capability
      .mockResolvedValueOnce([]); // requireProviderRole → no admin membership
    const res = await POST(postReq({ name: "X", price_cents: 100 }), PARAMS);
    expect(res.status).toBe(403);
    expect(allQueryText()).not.toContain("INSERT INTO shop_products");
  });

  it("400 when name missing", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // resolveUserId
      .mockResolvedValueOnce([{ has: true }]) // capability
      .mockResolvedValueOnce([{ id: 1, role: "admin" }]); // admin membership
    const res = await POST(postReq({ price_cents: 100 }), PARAMS);
    expect(res.status).toBe(400);
  });

  it("400 when price_cents is negative", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([{ has: true }])
      .mockResolvedValueOnce([{ id: 1, role: "admin" }]);
    const res = await POST(postReq({ name: "X", price_cents: -5 }), PARAMS);
    expect(res.status).toBe(400);
  });

  it("400 when image_urls is not an array (ticket 2.23)", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // resolveUserId
      .mockResolvedValueOnce([{ has: true }]) // capability
      .mockResolvedValueOnce([{ id: 1, role: "admin" }]); // admin membership
    const res = await POST(
      postReq({ name: "X", price_cents: 100, image_urls: "nope" }),
      PARAMS,
    );
    expect(res.status).toBe(400);
    expect(allQueryText()).not.toContain("INSERT INTO shop_products");
  });

  it("201 creates a product for an admin", async () => {
    auth.mockResolvedValue(SESSION);
    const CREATED = { id: 9, name: "Kibble", price_cents: 5000, is_rx: false, active: true };
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // resolveUserId
      .mockResolvedValueOnce([{ has: true }]) // capability
      .mockResolvedValueOnce([{ id: 1, role: "admin" }]) // admin membership
      .mockResolvedValueOnce([CREATED]); // INSERT
    const res = await POST(
      postReq({ name: "Kibble", price_cents: 5000, stock_qty: 10, is_rx: true }),
      PARAMS,
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.product).toEqual(CREATED);
    expect(allQueryText()).toContain("INSERT INTO shop_products");
  });
});
