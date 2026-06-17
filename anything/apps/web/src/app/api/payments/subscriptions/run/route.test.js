import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// POST /api/payments/subscriptions/run — the shop auto-reorder charger (ticket 2.17).
// sql + createCheckout + the requestContext tx seam are mocked. Proves: secret gating;
// a due sub builds a kind='product' order with server-side price + a period-stable
// idempotency key + advances next_charge_at; PaymentsNotConfigured / Rx / inactive /
// low-stock / no-rail all SKIP cleanly without advancing; the run always 200s.

vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/requestContext", () => ({
  // run the per-sub callback inline; setCurrentUserId is a no-op in unit context.
  withTransaction: vi.fn((fn) => fn()),
  setCurrentUserId: vi.fn(),
}));
vi.mock("@/app/api/utils/payments", () => ({ createCheckout: vi.fn() }));

import { POST } from "./route";
import sql from "@/app/api/utils/sql";
import { createCheckout } from "@/app/api/utils/payments";
import { PaymentsNotConfiguredError } from "@/app/api/utils/payments/config";

const req = (secret) =>
  new Request("http://localhost/x", {
    method: "POST",
    headers: secret == null ? {} : { "x-cron-secret": secret },
  });

// A due subscription row as app_due_subscriptions() would return it.
const dueSub = (over = {}) => ({
  id: 1,
  owner_user_id: 7,
  provider_id: 5,
  product_id: 50,
  quantity: 2,
  plan: "monthly",
  next_charge_at: "2026-06-01T00:00:00.000Z",
  connected_rail: "mercadopago",
  ...over,
});

const product = (over = {}) => ({
  id: 50,
  name: "Kibble 5kg",
  price_cents: 3000,
  stock_qty: 10,
  is_rx: false,
  active: true,
  ...over,
});

let savedSecret;
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  savedSecret = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "topsecret";
});
afterEach(() => {
  if (savedSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = savedSecret;
});

describe("auth gating", () => {
  it("no CRON_SECRET configured → 503 (never runs open)", async () => {
    delete process.env.CRON_SECRET;
    const res = await POST(req("anything"));
    expect(res.status).toBe(503);
    expect(sql).not.toHaveBeenCalled();
  });

  it("wrong / missing x-cron-secret → 401, no scan", async () => {
    expect((await POST(req("nope"))).status).toBe(401);
    expect((await POST(req(null))).status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });
});

describe("charging a due subscription", () => {
  it("builds a kind='product' order with server price, charges with a period idempotency key, advances next_charge_at", async () => {
    sql.mockResolvedValueOnce([dueSub()]); // app_due_subscriptions()
    sql.mockResolvedValueOnce([product()]); // shop_products re-validate
    sql.mockResolvedValueOnce([{ id: 900 }]); // INSERT orders
    sql.mockResolvedValueOnce([]); // INSERT order_items
    createCheckout.mockResolvedValue({ payment: { id: 1 }, checkoutUrl: "u" });
    sql.mockResolvedValueOnce([]); // UPDATE subscriptions

    const res = await POST(req("topsecret"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ processed: 1, charged: 1, skipped: [], failed: [] });

    // The order INSERT is kind='product' (SQL literal) and binds amount = price (3000) *
    // qty (2) = 6000 + the subscription source_ref.
    const orderInsert = sql.mock.calls[2];
    expect(orderInsert[0].join(" ")).toContain("INSERT INTO orders");
    expect(orderInsert[0].join(" ")).toContain("'product'");
    expect(orderInsert).toEqual(expect.arrayContaining(["subscription:1", 6000]));
    // order_items bound the server-side unit price + quantity + product id.
    const itemInsert = sql.mock.calls[3];
    expect(itemInsert[0].join(" ")).toContain("INSERT INTO order_items");
    expect(itemInsert).toEqual(expect.arrayContaining([2, 3000, 50]));

    // createCheckout used the chosen rail + a period-stable idempotency key.
    expect(createCheckout).toHaveBeenCalledWith(
      { id: 900 },
      { rail: "mercadopago", idempotencyKey: "sub-1-2026-06-01" },
    );

    // next_charge_at advanced one month (monthly) — only after a successful checkout.
    const update = sql.mock.calls[4];
    expect(update[0].join(" ")).toContain("UPDATE subscriptions");
    const boundDate = update.find((v) => v instanceof Date);
    expect(boundDate.toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });
});

describe("clean skips (no advance, no throw, always 200)", () => {
  it("PaymentsNotConfigured → skipped, next_charge_at NOT advanced", async () => {
    sql.mockResolvedValueOnce([dueSub()]); // due
    sql.mockResolvedValueOnce([product()]); // re-validate
    sql.mockResolvedValueOnce([{ id: 900 }]); // INSERT orders
    sql.mockResolvedValueOnce([]); // INSERT order_items
    createCheckout.mockRejectedValue(new PaymentsNotConfiguredError("mercadopago"));

    const res = await POST(req("topsecret"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.charged).toBe(0);
    expect(body.skipped).toEqual([{ subId: 1, reason: "payments not configured" }]);
    // No UPDATE subscriptions ran (the only sql calls are due + revalidate + 2 inserts).
    const ranUpdate = sql.mock.calls.some((c) =>
      (c?.[0] ?? []).join(" ").includes("UPDATE subscriptions"),
    );
    expect(ranUpdate).toBe(false);
  });

  it("an Rx product is never auto-reordered → skipped before any order", async () => {
    sql.mockResolvedValueOnce([dueSub()]); // due
    sql.mockResolvedValueOnce([product({ is_rx: true })]); // re-validate → Rx

    const res = await POST(req("topsecret"));
    const body = await res.json();

    expect(body.skipped).toEqual([{ subId: 1, reason: "rx product not auto-reordered" }]);
    expect(createCheckout).not.toHaveBeenCalled();
    // Only due + revalidate ran — no order INSERT.
    expect(sql).toHaveBeenCalledTimes(2);
  });

  it("insufficient stock → skipped", async () => {
    sql.mockResolvedValueOnce([dueSub({ quantity: 5 })]);
    sql.mockResolvedValueOnce([product({ stock_qty: 2 })]);

    const body = await (await POST(req("topsecret"))).json();
    expect(body.skipped).toEqual([{ subId: 1, reason: "insufficient stock" }]);
    expect(createCheckout).not.toHaveBeenCalled();
  });

  it("an inactive/missing product → skipped", async () => {
    sql.mockResolvedValueOnce([dueSub()]);
    sql.mockResolvedValueOnce([]); // shop_products returns nothing (inactive)

    const body = await (await POST(req("topsecret"))).json();
    expect(body.skipped).toEqual([{ subId: 1, reason: "product unavailable" }]);
  });

  it("a provider with no connected rail → skipped without touching the DB per-sub", async () => {
    sql.mockResolvedValueOnce([dueSub({ connected_rail: null })]);

    const body = await (await POST(req("topsecret"))).json();
    expect(body.skipped).toEqual([{ subId: 1, reason: "provider not connected" }]);
    // Only the enumerator ran — no product re-validate.
    expect(sql).toHaveBeenCalledTimes(1);
    expect(createCheckout).not.toHaveBeenCalled();
  });
});
