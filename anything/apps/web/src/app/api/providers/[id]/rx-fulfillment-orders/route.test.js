import { describe, it, expect, vi, beforeEach } from "vitest";

// GET /api/providers/[id]/rx-fulfillment-orders — the dispenser's queue (ticket 2.71). Capability-
// gated to `pharmacy`; RLS scopes to active staff of this provider.

import { GET } from "./route";
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
const PARAMS = { params: { id: "100" } };
const req = () => new Request("http://localhost/api/providers/100/rx-fulfillment-orders");

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  resolveUserId.mockResolvedValue(7);
  requireProviderCapability.mockResolvedValue(undefined);
});

describe("GET providers/[id]/rx-fulfillment-orders", () => {
  it("anonymous → 401", async () => {
    auth.mockResolvedValue(undefined);
    expect((await GET(req(), PARAMS)).status).toBe(401);
  });

  it("non-pharmacy provider → 403", async () => {
    auth.mockResolvedValue(SESSION);
    requireProviderCapability.mockRejectedValueOnce(
      Object.assign(new Error("Provider does not have the 'pharmacy' capability"), { status: 403 }),
    );
    expect((await GET(req(), PARAMS)).status).toBe(403);
  });

  it("pharmacy staff → 200 with the queue", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ id: 1, status: "requested", drug_name: "Amoxicillin" }]);
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(200);
    expect((await res.json()).orders).toHaveLength(1);
    expect(sql.mock.calls[0][0].join(" ")).toContain("FROM rx_fulfillment_orders");
  });
});
