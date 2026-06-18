import { describe, it, expect, vi, beforeEach } from "vitest";

// GET /api/providers/[id]/sales — provider-scoped Sales/payouts/reconciliation READ (ticket 2.69).
// Any active staff may view; non-staff → 403. Read-only — no money is mutated. Totals/commission/
// net math is asserted on a fixture; refunds reduce net; ranges/scoping handled by SQL (mocked).

import { GET } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { requireProviderRole } from "@/app/api/utils/providerAuth";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/currentUser", () => ({ resolveUserId: vi.fn() }));
vi.mock("@/app/api/utils/providerAuth", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, requireProviderRole: vi.fn() };
});

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const PARAMS = { params: { id: "5" } };
const req = () => new Request("http://localhost/api/providers/5/sales");

// The route runs 6 queries in order: totals, by_month, currency, ledger, payouts, payout_totals.
function mockSales({
  totals = {
    gross_cents: 10000,
    commission_cents: 1000,
    refunds_cents: 2000,
    approved_count: 3,
  },
  byMonth = [{ month: "2026-06", gross_cents: 10000, commission_cents: 1000 }],
  currency = [{ currency: "ARS", n: 3 }],
  ledger = [
    {
      id: 1,
      created_at: "2026-06-10",
      type: "booking",
      order_id: 11,
      status: "approved",
      gross_cents: 8000,
      commission_cents: 800,
      rail: "mercadopago",
      counterpart: "Ana",
    },
    {
      id: 2,
      created_at: "2026-06-11",
      type: "product",
      order_id: 12,
      status: "refunded",
      gross_cents: 2000,
      commission_cents: 200,
      rail: "binance",
      counterpart: "Beto",
    },
  ],
  payouts = [
    { id: 9, created_at: "2026-06-12", amount_cents: 5000, status: "paid", rail: "binance", external_id: "x1" },
  ],
  payoutTotals = { paid_out_cents: 5000, pending_payout_cents: 0 },
} = {}) {
  sql
    .mockResolvedValueOnce([totals])
    .mockResolvedValueOnce(byMonth)
    .mockResolvedValueOnce(currency)
    .mockResolvedValueOnce(ledger)
    .mockResolvedValueOnce(payouts)
    .mockResolvedValueOnce([payoutTotals]);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  resolveUserId.mockResolvedValue(7);
  requireProviderRole.mockResolvedValue({ role: "admin", status: "active" });
});

describe("GET /api/providers/[id]/sales", () => {
  it("anonymous → 401", async () => {
    auth.mockResolvedValue(undefined);
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(401);
  });

  it("no user profile → 404", async () => {
    auth.mockResolvedValue(SESSION);
    resolveUserId.mockResolvedValueOnce(null);
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(404);
  });

  it("non-staff (other provider) → 403, no money read", async () => {
    auth.mockResolvedValue(SESSION);
    requireProviderRole.mockRejectedValueOnce(
      Object.assign(new Error("Not authorized for this provider"), { status: 403 }),
    );
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(403);
    expect(sql).not.toHaveBeenCalled();
  });

  it("active staff → 200 with revenue/ledger/payouts/reconciliation", async () => {
    auth.mockResolvedValue(SESSION);
    mockSales();
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(200);
    const body = await res.json();

    // net = gross(10000) − commission(1000) − refunds(2000) = 7000
    expect(body.revenue).toMatchObject({
      gross_cents: 10000,
      commission_cents: 1000,
      refunds_cents: 2000,
      net_cents: 7000,
    });
    expect(body.currency).toBe("ARS");

    // ledger net: approved row = gross − commission; refunded row = negative gross
    expect(body.ledger[0].net_cents).toBe(7200); // 8000 − 800
    expect(body.ledger[1].net_cents).toBe(-2000); // refund

    // payouts + reconciliation: 5000 paid out of 7000 net → 2000 unreconciled
    expect(body.payouts.paid_out_cents).toBe(5000);
    expect(body.reconciliation).toMatchObject({
      net_captured_cents: 7000,
      paid_out_cents: 5000,
      pending_payout_cents: 0,
      unreconciled_cents: 2000,
    });
  });

  it("empty account → zeroed totals + empty lists", async () => {
    auth.mockResolvedValue(SESSION);
    mockSales({
      totals: { gross_cents: 0, commission_cents: 0, refunds_cents: 0, approved_count: 0 },
      byMonth: [],
      currency: [],
      ledger: [],
      payouts: [],
      payoutTotals: { paid_out_cents: 0, pending_payout_cents: 0 },
    });
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.revenue.net_cents).toBe(0);
    expect(body.ledger).toEqual([]);
    expect(body.payouts.rows).toEqual([]);
    expect(body.currency).toBe("ARS"); // default when no orders
    expect(body.reconciliation.unreconciled_cents).toBe(0);
  });

  it("queries are scoped to the provider's money tables", async () => {
    auth.mockResolvedValue(SESSION);
    mockSales();
    await GET(req(), PARAMS);
    const fired = sql.mock.calls.map((c) => c[0].join(" "));
    expect(fired[0]).toContain("FROM payments");
    expect(fired[0]).toContain("JOIN orders");
    expect(fired[4]).toContain("FROM payouts");
  });
});
