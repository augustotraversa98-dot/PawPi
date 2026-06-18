import { describe, it, expect, vi, beforeEach } from "vitest";

// PATCH /api/providers/[id]/insurance-policies/[policyId] — insurer issues/advances a policy
// (ticket 2.72). Capability-gated; a plain UPDATE to 'active' is refused (activation = safe path).

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
const PARAMS = { params: { id: "10", policyId: "9" } };
const patch = (body) =>
  new Request("http://localhost/api/providers/10/insurance-policies/9", {
    method: "PATCH",
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  resolveUserId.mockResolvedValue(7);
  requireProviderCapability.mockResolvedValue(undefined);
});

describe("PATCH insurance-policies/[policyId]", () => {
  it("non-insurance provider → 403", async () => {
    auth.mockResolvedValue(SESSION);
    requireProviderCapability.mockRejectedValueOnce(
      Object.assign(new Error("Provider does not have the 'insurance' capability"), { status: 403 }),
    );
    expect((await PATCH(patch({ premium_cents: 5000 }), PARAMS)).status).toBe(403);
  });

  it("setting status=active is rejected (payment-driven only) → 400", async () => {
    auth.mockResolvedValue(SESSION);
    expect((await PATCH(patch({ status: "active" }), PARAMS)).status).toBe(400);
  });

  it("invalid premium → 400", async () => {
    auth.mockResolvedValue(SESSION);
    expect((await PATCH(patch({ premium_cents: -1 }), PARAMS)).status).toBe(400);
  });

  it("issue number + premium + advance → 200", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([
      { id: 9, policy_number: "POL-9", premium_cents: 5000, status: "payment_pending" },
    ]);
    const res = await PATCH(
      patch({ policy_number: "POL-9", premium_cents: 5000, billing_period: "monthly", status: "payment_pending" }),
      PARAMS,
    );
    expect(res.status).toBe(200);
    expect((await res.json()).policy).toMatchObject({ policy_number: "POL-9", status: "payment_pending" });
    expect(sql.mock.calls[0][0].join(" ")).toContain("UPDATE insurance_policies");
  });

  it("scoped-out (non-staff) update → 404", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([]);
    expect((await PATCH(patch({ status: "lapsed" }), PARAMS)).status).toBe(404);
  });
});
