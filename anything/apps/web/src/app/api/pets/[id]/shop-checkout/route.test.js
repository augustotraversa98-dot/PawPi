import { describe, it, expect, vi, beforeEach } from "vitest";

// POST /api/pets/[id]/shop-checkout — the OWNER turns a cart into a paid 'product' order
// (Ticket 2.11). Owner-context: pet ownership → 'shop' capability gate → per-line catalog
// validation (active, same shop, IN STOCK) → Rx gate for is_rx lines → create order +
// order_items → hand off to the 2.3 payment layer. `auth`/`sql`/payments mocked.

import { POST } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { createCheckout } from "@/app/api/utils/payments";
import { ProviderPaymentAccountError } from "@/app/api/utils/payments/config";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => {
  // sql is a tagged-template fn; sql.json(v) binds a jsonb value (returns it raw here so
  // tests can read the bound shipping_address object off the INSERT call).
  const fn = vi.fn();
  fn.json = (v) => v;
  return { default: fn };
});
vi.mock("@/app/api/utils/payments", () => ({ createCheckout: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const PROFILE_ROW = { id: 7, auth_user_id: 42 };
const PARAMS = { params: { id: "55" } }; // pet id

const postReq = (body) =>
  new Request("http://localhost/api/pets/55/shop-checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });

const allQueryText = () =>
  sql.mock.calls.map((c) => (c?.[0] ?? []).join(" ")).join(" | ");

const STD_PRODUCT = {
  id: 9,
  name: "Kibble",
  price_cents: 5000,
  stock_qty: 10,
  is_rx: false,
  active: true,
  provider_id: 100,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/pets/[id]/shop-checkout", () => {
  it("401 when unauthenticated", async () => {
    auth.mockResolvedValue(null);
    const res = await POST(
      postReq({ provider_id: 100, items: [{ product_id: 9 }], rail: "binance" }),
      PARAMS,
    );
    expect(res.status).toBe(401);
  });

  it("403 when the caller does not own the pet", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // resolveUserId
      .mockResolvedValueOnce([]); // pet ownership → none
    const res = await POST(
      postReq({ provider_id: 100, items: [{ product_id: 9 }], rail: "binance" }),
      PARAMS,
    );
    expect(res.status).toBe(403);
    expect(allQueryText()).not.toContain("INSERT INTO orders");
  });

  it("400 when the provider lacks the 'shop' capability", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // resolveUserId
      .mockResolvedValueOnce([{ id: 55 }]) // pet ownership
      .mockResolvedValueOnce([]); // shop capability → none
    const res = await POST(
      postReq({ provider_id: 100, items: [{ product_id: 9 }], rail: "binance" }),
      PARAMS,
    );
    expect(res.status).toBe(400);
    expect(createCheckout).not.toHaveBeenCalled();
  });

  it("409 when a line is OUT OF STOCK (never sell out-of-stock)", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // resolveUserId
      .mockResolvedValueOnce([{ id: 55 }]) // pet ownership
      .mockResolvedValueOnce([{ 1: 1 }]) // shop capability
      .mockResolvedValueOnce([{ ...STD_PRODUCT, stock_qty: 1 }]); // product (stock 1)
    const res = await POST(
      postReq({
        provider_id: 100,
        items: [{ product_id: 9, quantity: 5 }],
        rail: "binance",
      }),
      PARAMS,
    );
    expect(res.status).toBe(409);
    expect(allQueryText()).not.toContain("INSERT INTO orders");
    expect(createCheckout).not.toHaveBeenCalled();
  });

  it("404 when a product is not active / not this shop's", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // resolveUserId
      .mockResolvedValueOnce([{ id: 55 }]) // pet ownership
      .mockResolvedValueOnce([{ 1: 1 }]) // shop capability
      .mockResolvedValueOnce([]); // product lookup → none
    const res = await POST(
      postReq({ provider_id: 100, items: [{ product_id: 9 }], rail: "binance" }),
      PARAMS,
    );
    expect(res.status).toBe(404);
  });

  it("403 Rx gate: an is_rx line is blocked without a vet relationship", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // resolveUserId
      .mockResolvedValueOnce([{ id: 55 }]) // pet ownership
      .mockResolvedValueOnce([{ 1: 1 }]) // shop capability
      .mockResolvedValueOnce([{ ...STD_PRODUCT, is_rx: true }]) // Rx product in stock
      .mockResolvedValueOnce([{ ok: false }]); // app_pet_has_vet_relationship → false
    const res = await POST(
      postReq({ provider_id: 100, items: [{ product_id: 9 }], rail: "binance" }),
      PARAMS,
    );
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toMatch(/prescription/i);
    expect(allQueryText()).not.toContain("INSERT INTO orders");
    expect(createCheckout).not.toHaveBeenCalled();
  });

  it("201 Rx allowed when the pet HAS a vet relationship", async () => {
    auth.mockResolvedValue(SESSION);
    const ORDER = { id: 500, owner_user_id: 7, provider_id: 100, kind: "product" };
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // resolveUserId
      .mockResolvedValueOnce([{ id: 55 }]) // pet ownership
      .mockResolvedValueOnce([{ 1: 1 }]) // shop capability
      .mockResolvedValueOnce([{ ...STD_PRODUCT, is_rx: true }]) // Rx product
      .mockResolvedValueOnce([{ ok: true }]) // vet relationship → ok
      .mockResolvedValueOnce([ORDER]) // INSERT order
      .mockResolvedValueOnce([]); // INSERT order_item
    createCheckout.mockResolvedValue({
      payment: { id: 1, status: "pending" },
      checkoutUrl: "https://pay/x",
    });
    const res = await POST(
      postReq({ provider_id: 100, items: [{ product_id: 9 }], rail: "binance" }),
      PARAMS,
    );
    expect(res.status).toBe(201);
    expect(createCheckout).toHaveBeenCalledWith(ORDER, expect.objectContaining({ rail: "binance" }));
    expect(allQueryText()).toContain("INSERT INTO orders");
    expect(allQueryText()).toContain("INSERT INTO order_items");
  });

  it("201 standard (non-Rx) checkout reuses the 2.3 payment layer", async () => {
    auth.mockResolvedValue(SESSION);
    const ORDER = { id: 501, owner_user_id: 7, provider_id: 100, kind: "product" };
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // resolveUserId
      .mockResolvedValueOnce([{ id: 55 }]) // pet ownership
      .mockResolvedValueOnce([{ 1: 1 }]) // shop capability
      .mockResolvedValueOnce([STD_PRODUCT]) // product in stock
      .mockResolvedValueOnce([ORDER]) // INSERT order
      .mockResolvedValueOnce([]); // INSERT order_item
    createCheckout.mockResolvedValue({
      payment: { id: 2, status: "pending" },
      checkoutUrl: "https://pay/y",
    });
    const res = await POST(
      postReq({
        provider_id: 100,
        items: [{ product_id: 9, quantity: 2 }],
        rail: "mercadopago",
      }),
      PARAMS,
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.checkoutUrl).toBe("https://pay/y");
    // No Rx lookup for a non-Rx cart.
    expect(allQueryText()).not.toContain("app_pet_has_vet_relationship");
  });

  // ── P4b fulfillment: pickup | delivery + shipping_address (additive, back-compat) ──
  const okUpToInsert = (order, product = STD_PRODUCT) =>
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // resolveUserId
      .mockResolvedValueOnce([{ id: 55 }]) // pet ownership
      .mockResolvedValueOnce([{ 1: 1 }]) // shop capability
      .mockResolvedValueOnce([product]) // product in stock
      .mockResolvedValueOnce([order]) // INSERT order
      .mockResolvedValueOnce([]); // INSERT order_item

  const insertOrderValues = () => {
    // The INSERT INTO orders is the 5th sql call (idx 4): resolveUserId, pet, cap, product, INSERT.
    const call = sql.mock.calls[4];
    return call.slice(1);
  };

  it("omitting fulfillment fields creates a valid PICKUP order (back-compat)", async () => {
    auth.mockResolvedValue(SESSION);
    okUpToInsert({ id: 600, kind: "product" });
    createCheckout.mockResolvedValue({ payment: {}, checkoutUrl: "https://pay/a" });
    const res = await POST(
      postReq({ provider_id: 100, items: [{ product_id: 9 }], rail: "mercadopago" }),
      PARAMS,
    );
    expect(res.status).toBe(201);
    const text = allQueryText();
    expect(text).toContain("fulfillment_type");
    expect(text).toContain("shipping_address");
    const values = insertOrderValues();
    expect(values).toContain("pickup"); // defaulted
    expect(values).toContain(null); // shipping_address null for pickup
  });

  it("an explicit PICKUP order stores no address", async () => {
    auth.mockResolvedValue(SESSION);
    okUpToInsert({ id: 601, kind: "product" });
    createCheckout.mockResolvedValue({ payment: {}, checkoutUrl: "https://pay/b" });
    const res = await POST(
      postReq({
        provider_id: 100,
        items: [{ product_id: 9 }],
        rail: "mercadopago",
        fulfillment_type: "pickup",
      }),
      PARAMS,
    );
    expect(res.status).toBe(201);
    expect(insertOrderValues()).toContain("pickup");
  });

  it("a DELIVERY order persists fulfillment_type + the shipping_address object", async () => {
    auth.mockResolvedValue(SESSION);
    okUpToInsert({ id: 602, kind: "product" });
    createCheckout.mockResolvedValue({ payment: {}, checkoutUrl: "https://pay/c" });
    const address = { address: "123 Test St", lat: 1, lng: 2 };
    const res = await POST(
      postReq({
        provider_id: 100,
        items: [{ product_id: 9 }],
        rail: "mercadopago",
        fulfillment_type: "delivery",
        shipping_address: address,
      }),
      PARAMS,
    );
    expect(res.status).toBe(201);
    const values = insertOrderValues();
    expect(values).toContain("delivery");
    expect(values).toEqual(
      expect.arrayContaining([expect.objectContaining({ address: "123 Test St" })]),
    );
  });

  it("400 a DELIVERY order without an address (no order created)", async () => {
    auth.mockResolvedValue(SESSION);
    // Fulfillment is validated before any capability/product query — only the ownership
    // lookups run first.
    sql.mockResolvedValueOnce([PROFILE_ROW]).mockResolvedValueOnce([{ id: 55 }]);
    const res = await POST(
      postReq({
        provider_id: 100,
        items: [{ product_id: 9 }],
        rail: "mercadopago",
        fulfillment_type: "delivery",
      }),
      PARAMS,
    );
    expect(res.status).toBe(400);
    expect(allQueryText()).not.toContain("INSERT INTO orders");
    expect(createCheckout).not.toHaveBeenCalled();
  });

  it("400 an invalid fulfillment_type is rejected", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]).mockResolvedValueOnce([{ id: 55 }]);
    const res = await POST(
      postReq({
        provider_id: 100,
        items: [{ product_id: 9 }],
        rail: "mercadopago",
        fulfillment_type: "courier",
      }),
      PARAMS,
    );
    expect(res.status).toBe(400);
    expect(allQueryText()).not.toContain("INSERT INTO orders");
  });

  it("503 when payments are not configured (never crashes)", async () => {
    auth.mockResolvedValue(SESSION);
    const ORDER = { id: 502, owner_user_id: 7, provider_id: 100, kind: "product" };
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([{ id: 55 }])
      .mockResolvedValueOnce([{ 1: 1 }])
      .mockResolvedValueOnce([STD_PRODUCT])
      .mockResolvedValueOnce([ORDER])
      .mockResolvedValueOnce([]);
    const err = new Error("Payments not configured");
    err.status = 503;
    createCheckout.mockRejectedValue(err);
    const res = await POST(
      postReq({ provider_id: 100, items: [{ product_id: 9 }], rail: "binance" }),
      PARAMS,
    );
    expect(res.status).toBe(503);
  });

  it("409 when the shop provider hasn't connected MercadoPago (distinct from the platform 503)", async () => {
    auth.mockResolvedValue(SESSION);
    const ORDER = { id: 503, owner_user_id: 7, provider_id: 100, kind: "product" };
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([{ id: 55 }])
      .mockResolvedValueOnce([{ 1: 1 }])
      .mockResolvedValueOnce([STD_PRODUCT])
      .mockResolvedValueOnce([ORDER])
      .mockResolvedValueOnce([]);
    createCheckout.mockRejectedValue(
      new ProviderPaymentAccountError("mercadopago", "not_connected"),
    );
    const res = await POST(
      postReq({
        provider_id: 100,
        items: [{ product_id: 9 }],
        rail: "mercadopago",
      }),
      PARAMS,
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("account_not_connected");
    expect(body.error).toMatch(/hasn't connected MercadoPago/i);
  });
});
