import { describe, it, expect, vi, beforeEach } from "vitest";

// PATCH /api/providers/[id]/rx-fulfillment-orders/[orderId] — dispenser advances a fulfillment
// (ticket 2.71). 'fulfilled' runs through the fulfill_rx_order DEFINER (consumes a refill on the safe
// path); other statuses are a staff-scoped UPDATE.

import { PATCH } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { requireProviderCapability } from "@/app/api/utils/providerAuth";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/currentUser", () => ({ resolveUserId: vi.fn() }));
vi.mock("@/app/api/utils/providerAuth", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, requireProviderCapability: vi.fn() };
});

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const PARAMS = { params: { id: "100", orderId: "9" } };
const patch = (body) =>
  new Request("http://localhost/api/providers/100/rx-fulfillment-orders/9", {
    method: "PATCH",
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  resolveUserId.mockResolvedValue(7);
  requireProviderCapability.mockResolvedValue(undefined);
});

describe("PATCH rx-fulfillment-orders/[orderId]", () => {
  it("non-pharmacy provider → 403", async () => {
    auth.mockResolvedValue(SESSION);
    requireProviderCapability.mockRejectedValueOnce(
      Object.assign(new Error("Provider does not have the 'pharmacy' capability"), { status: 403 }),
    );
    expect((await PATCH(patch({ status: "accepted" }), PARAMS)).status).toBe(403);
  });

  it("invalid price → 400", async () => {
    auth.mockResolvedValue(SESSION);
    expect((await PATCH(patch({ price_cents: -5 }), PARAMS)).status).toBe(400);
  });

  it("accept + set price → 200 (staff-scoped UPDATE)", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ id: 9, status: "accepted", price_cents: 2000 }]);
    const res = await PATCH(patch({ status: "accepted", price_cents: 2000 }), PARAMS);
    expect(res.status).toBe(200);
    expect((await res.json()).order).toMatchObject({ status: "accepted", price_cents: 2000 });
    expect(sql.mock.calls[0][0].join(" ")).toContain("UPDATE rx_fulfillment_orders");
  });

  it("staff-scoped UPDATE that matches nothing → 404", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([]); // RLS scoped out
    expect((await PATCH(patch({ status: "preparing" }), PARAMS)).status).toBe(404);
  });

  it("fulfilled → DEFINER consumes a refill, returns 200", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([{ result: "fulfilled" }]) // fulfill_rx_order()
      .mockResolvedValueOnce([{ id: 9, status: "fulfilled" }]); // reload
    const res = await PATCH(patch({ status: "fulfilled" }), PARAMS);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result).toBe("fulfilled");
    expect(body.order).toMatchObject({ status: "fulfilled" });
    expect(sql.mock.calls[0][0].join(" ")).toContain("fulfill_rx_order");
  });

  it("fulfilled by a non-staff caller → 403 from the DEFINER", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ result: "forbidden" }]);
    expect((await PATCH(patch({ status: "fulfilled" }), PARAMS)).status).toBe(403);
  });

  it("fulfilled with no refills left → 409", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ result: "no_refills" }]);
    expect((await PATCH(patch({ status: "fulfilled" }), PARAMS)).status).toBe(409);
  });
});
