import { describe, it, expect, vi, beforeEach } from "vitest";

// PATCH /api/rx-fulfillment-orders/[id] — the OWNER cancels a still-'requested' fulfillment, or links
// the paid 2.3 order (order_id). RLS owner_update pins them to requested|cancelled; a non-owner
// touches ZERO rows → 404.

import { PATCH } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { resolveUserId } from "@/app/api/utils/currentUser";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/currentUser", () => ({ resolveUserId: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const PARAMS = { params: { id: "9" } };
const patch = (body) =>
  new Request("http://localhost/api/rx-fulfillment-orders/9", {
    method: "PATCH",
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  resolveUserId.mockResolvedValue(7);
});

describe("PATCH /api/rx-fulfillment-orders/[id]", () => {
  it("anonymous → 401", async () => {
    auth.mockResolvedValue(undefined);
    expect((await PATCH(patch({ status: "cancelled" }), PARAMS)).status).toBe(401);
  });

  it("no profile yet → 404", async () => {
    auth.mockResolvedValue(SESSION);
    resolveUserId.mockResolvedValueOnce(null);
    expect((await PATCH(patch({ status: "cancelled" }), PARAMS)).status).toBe(404);
  });

  it("owner can only set status=cancelled → 400 on anything else", async () => {
    auth.mockResolvedValue(SESSION);
    const res = await PATCH(patch({ status: "fulfilled" }), PARAMS);
    expect(res.status).toBe(400);
    expect(sql).not.toHaveBeenCalled();
  });

  it("cancel an owned fulfillment → 200", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ id: 9, status: "cancelled" }]);
    const res = await PATCH(patch({ status: "cancelled" }), PARAMS);
    expect(res.status).toBe(200);
    expect((await res.json()).order).toMatchObject({ status: "cancelled" });
    const q = sql.mock.calls[0][0].join(" ");
    expect(q).toContain("UPDATE rx_fulfillment_orders");
    expect(q).toContain("owner_user_id =");
  });

  it("link a paid order (order_id only) → 200", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ id: 9, order_id: 555 }]);
    const res = await PATCH(patch({ order_id: 555 }), PARAMS);
    expect(res.status).toBe(200);
    expect((await res.json()).order).toMatchObject({ order_id: 555 });
  });

  it("non-owner → ZERO rows → 404", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([]);
    expect((await PATCH(patch({ status: "cancelled" }), PARAMS)).status).toBe(404);
  });

  it("RLS rejection → 400", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockRejectedValueOnce(new Error("new row violates row-level security policy"));
    expect((await PATCH(patch({ status: "cancelled" }), PARAMS)).status).toBe(400);
  });
});
