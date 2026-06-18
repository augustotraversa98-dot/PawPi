import { describe, it, expect, vi, beforeEach } from "vitest";

// /api/rx-fulfillment-orders — OWNER side of Rx fulfillment (ticket 2.71). Create only on an owned,
// active, refillable Rx with a `pharmacy`-capable dispenser; RLS is the backstop.

import { GET, POST } from "./route";
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
const post = (body) =>
  new Request("http://localhost/api/rx-fulfillment-orders", {
    method: "POST",
    body: JSON.stringify(body),
  });
const goodBody = {
  prescription_id: 3,
  provider_id: 100,
  method: "delivery",
  delivery_address: "123 St",
  delivery_lat: 40.7,
  delivery_lng: -74,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  resolveUserId.mockResolvedValue(7);
  requireProviderCapability.mockResolvedValue(undefined);
});

describe("POST /api/rx-fulfillment-orders", () => {
  it("anonymous → 401", async () => {
    auth.mockResolvedValue(undefined);
    expect((await POST(post(goodBody))).status).toBe(401);
  });

  it("missing prescription_id/provider_id → 400", async () => {
    auth.mockResolvedValue(SESSION);
    expect((await POST(post({ method: "pickup" }))).status).toBe(400);
  });

  it("delivery without an address → 400", async () => {
    auth.mockResolvedValue(SESSION);
    const res = await POST(post({ prescription_id: 3, provider_id: 100, method: "delivery" }));
    expect(res.status).toBe(400);
  });

  it("dispenser lacks the pharmacy capability → 403", async () => {
    auth.mockResolvedValue(SESSION);
    requireProviderCapability.mockRejectedValueOnce(
      Object.assign(new Error("Provider does not have the 'pharmacy' capability"), { status: 403 }),
    );
    expect((await POST(post(goodBody))).status).toBe(403);
  });

  it("prescription not owned/found → 404", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([]); // rx lookup empty
    expect((await POST(post(goodBody))).status).toBe(404);
  });

  it("RLS rejects a non-fulfillable Rx → 400", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([{ pet_id: 5 }]) // rx lookup ok
      .mockRejectedValueOnce(new Error("new row violates row-level security policy"));
    const res = await POST(post(goodBody));
    expect(res.status).toBe(400);
  });

  it("owned active refillable Rx → 201 creates the fulfillment", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([{ pet_id: 5 }])
      .mockResolvedValueOnce([{ id: 1, status: "requested", method: "delivery", is_refill: true }]);
    const res = await POST(post(goodBody));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.order).toMatchObject({ status: "requested", is_refill: true });
    expect(sql.mock.calls[1][0].join(" ")).toContain("INSERT INTO rx_fulfillment_orders");
  });
});

describe("GET /api/rx-fulfillment-orders", () => {
  it("owner-scoped list → 200", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ id: 1, status: "requested" }]);
    const res = await GET(new Request("http://localhost/api/rx-fulfillment-orders?petId=5"));
    expect(res.status).toBe(200);
    expect((await res.json()).orders).toHaveLength(1);
    expect(sql.mock.calls[0][0].join(" ")).toContain("f.owner_user_id =");
  });
});
