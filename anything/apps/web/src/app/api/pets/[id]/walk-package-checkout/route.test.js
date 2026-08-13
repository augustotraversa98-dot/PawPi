import { describe, it, expect, vi, beforeEach } from "vitest";

// POST /api/pets/[id]/walk-package-checkout — the OWNER buys a prepaid walk package (Ticket B2).
// Owner-context: pet ownership → 'walker' capability gate → server-trusted package price → create
// a 'walk_package' order (source_ref='walk_package:<id>') → hand off to createCheckout. Credits are
// granted on PAID, never here. `auth`/`sql`/payments mocked.

import { POST } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { createCheckout } from "@/app/api/utils/payments";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/payments", () => ({ createCheckout: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const PROFILE_ROW = { id: 7, auth_user_id: 42 };
const PARAMS = { params: { id: "55" } }; // pet id

const postReq = (body) =>
  new Request("http://localhost/api/pets/55/walk-package-checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });

const allQueryText = () =>
  sql.mock.calls.map((c) => (c?.[0] ?? []).join(" ")).join(" | ");
const valuesOf = (callIndex) => sql.mock.calls[callIndex]?.slice(1) ?? [];

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/pets/[id]/walk-package-checkout", () => {
  it("401 when unauthenticated", async () => {
    auth.mockResolvedValue(null);
    const res = await POST(postReq({ provider_id: 100, walk_package_id: 1, rail: "binance" }), PARAMS);
    expect(res.status).toBe(401);
  });

  it("403 when the caller does not own the pet", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]).mockResolvedValueOnce([]); // ownership → none
    const res = await POST(postReq({ provider_id: 100, walk_package_id: 1, rail: "binance" }), PARAMS);
    expect(res.status).toBe(403);
  });

  it("400 for an invalid rail", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]).mockResolvedValueOnce([{ id: 55 }]); // owns pet
    const res = await POST(postReq({ provider_id: 100, walk_package_id: 1, rail: "paypal" }), PARAMS);
    expect(res.status).toBe(400);
  });

  it("400 when the provider does not offer walks (no capability)", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([{ id: 55 }]) // owns pet
      .mockResolvedValueOnce([]); // capability → none
    const res = await POST(postReq({ provider_id: 100, walk_package_id: 1, rail: "binance" }), PARAMS);
    expect(res.status).toBe(400);
  });

  it("404 when the package is not active / not this provider's", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([{ id: 55 }]) // owns pet
      .mockResolvedValueOnce([{ x: 1 }]) // capability ok
      .mockResolvedValueOnce([]); // package lookup → none
    const res = await POST(postReq({ provider_id: 100, walk_package_id: 999, rail: "binance" }), PARAMS);
    expect(res.status).toBe(404);
  });

  it("creates a walk_package order with a server-trusted price + source_ref, then checks out", async () => {
    auth.mockResolvedValue(SESSION);
    const ORDER = { id: 500, kind: "walk_package", amount_cents: 90000, provider_id: 100 };
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([{ id: 55 }]) // owns pet
      .mockResolvedValueOnce([{ x: 1 }]) // capability ok
      .mockResolvedValueOnce([{ id: 3, walks_count: 10, price_cents: 90000, currency: "ARS" }]) // package
      .mockResolvedValueOnce([ORDER]); // INSERT order
    createCheckout.mockResolvedValue({
      payment: { id: 1 },
      checkoutUrl: "https://pay",
      deeplink: null,
      qrContent: null,
    });

    // The client tries to spoof a cheap price — ignored; the server uses the catalog price.
    const res = await POST(
      postReq({ provider_id: 100, walk_package_id: 3, rail: "binance", price_cents: 1 }),
      PARAMS,
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.order).toEqual(ORDER);
    expect(body.checkoutUrl).toBe("https://pay");

    // The INSERT (call 4) binds kind='walk_package' + the server price + the package source_ref.
    const insertText = sql.mock.calls[4][0].join(" ");
    expect(insertText).toContain("INSERT INTO orders");
    expect(insertText).toContain("'walk_package'"); // kind is an inline literal
    const insertValues = valuesOf(4);
    expect(insertValues).toContain("walk_package:3"); // source_ref (bound)
    expect(insertValues).toContain(90000); // catalog price, NOT the client's 1
    expect(insertValues).not.toContain(1);

    expect(createCheckout).toHaveBeenCalledWith(ORDER, expect.objectContaining({ rail: "binance" }));
  });

  it("degrades clean when walk_packages is absent → 404, no order", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([{ id: 55 }]) // owns pet
      .mockResolvedValueOnce([{ x: 1 }]) // capability ok
      .mockRejectedValueOnce(
        Object.assign(new Error('relation "walk_packages" does not exist'), { code: "42P01" }),
      );
    const res = await POST(postReq({ provider_id: 100, walk_package_id: 3, rail: "binance" }), PARAMS);
    expect(res.status).toBe(404);
    expect(allQueryText()).not.toContain("INSERT INTO orders");
    expect(createCheckout).not.toHaveBeenCalled();
  });
});
