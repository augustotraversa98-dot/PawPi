import { describe, it, expect, vi, beforeEach } from "vitest";

// PATCH /api/insurance-policies/[id] — the OWNER cancels, or activates after paying (ticket 2.72).
// Activation runs ONLY through activate_insurance_policy (DEFINER), which verifies an APPROVED 2.3
// payment — the owner can never self-activate via a raw status write. A non-owner touches ZERO → 404.

import { PATCH } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { resolveUserId } from "@/app/api/utils/currentUser";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/currentUser", () => ({ resolveUserId: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const PARAMS = { params: { id: "3" } };
const patch = (body) =>
  new Request("http://localhost/api/insurance-policies/3", {
    method: "PATCH",
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  resolveUserId.mockResolvedValue(7);
});

describe("PATCH /api/insurance-policies/[id]", () => {
  it("anonymous → 401", async () => {
    auth.mockResolvedValue(undefined);
    expect((await PATCH(patch({ action: "cancel" }), PARAMS)).status).toBe(401);
  });

  it("no profile yet → 404", async () => {
    auth.mockResolvedValue(SESSION);
    resolveUserId.mockResolvedValueOnce(null);
    expect((await PATCH(patch({ action: "cancel" }), PARAMS)).status).toBe(404);
  });

  it("unknown action → 400", async () => {
    auth.mockResolvedValue(SESSION);
    expect((await PATCH(patch({ action: "frobnicate" }), PARAMS)).status).toBe(400);
  });

  describe("activate", () => {
    it("missing payment_id → 400", async () => {
      auth.mockResolvedValue(SESSION);
      const res = await PATCH(patch({ action: "activate" }), PARAMS);
      expect(res.status).toBe(400);
      expect(sql).not.toHaveBeenCalled();
    });

    it("not owned → 404 (never calls the DEFINER)", async () => {
      auth.mockResolvedValue(SESSION);
      sql.mockResolvedValueOnce([]); // ownership check empty
      const res = await PATCH(patch({ action: "activate", payment_id: 55 }), PARAMS);
      expect(res.status).toBe(404);
      expect(sql).toHaveBeenCalledTimes(1);
    });

    it("DEFINER returns 'active' → 200 with the policy", async () => {
      auth.mockResolvedValue(SESSION);
      sql
        .mockResolvedValueOnce([{ id: 3 }]) // owns
        .mockResolvedValueOnce([{ result: "active" }]) // DEFINER
        .mockResolvedValueOnce([{ id: 3, status: "active" }]); // re-read
      const res = await PATCH(patch({ action: "activate", payment_id: 55 }), PARAMS);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.result).toBe("active");
      expect(body.policy).toMatchObject({ status: "active" });
      expect(sql.mock.calls[1][0].join(" ")).toContain("activate_insurance_policy");
    });

    it("DEFINER 'forbidden' → 403", async () => {
      auth.mockResolvedValue(SESSION);
      sql
        .mockResolvedValueOnce([{ id: 3 }])
        .mockResolvedValueOnce([{ result: "forbidden" }]);
      expect((await PATCH(patch({ action: "activate", payment_id: 55 }), PARAMS)).status).toBe(403);
    });

    it("DEFINER 'not_found' → 404", async () => {
      auth.mockResolvedValue(SESSION);
      sql
        .mockResolvedValueOnce([{ id: 3 }])
        .mockResolvedValueOnce([{ result: "not_found" }]);
      expect((await PATCH(patch({ action: "activate", payment_id: 55 }), PARAMS)).status).toBe(404);
    });

    it("DEFINER any other result (e.g. payment not approved) → 409", async () => {
      auth.mockResolvedValue(SESSION);
      sql
        .mockResolvedValueOnce([{ id: 3 }])
        .mockResolvedValueOnce([{ result: "payment_not_approved" }]);
      expect((await PATCH(patch({ action: "activate", payment_id: 55 }), PARAMS)).status).toBe(409);
    });
  });

  describe("cancel", () => {
    it("owned policy → 200", async () => {
      auth.mockResolvedValue(SESSION);
      sql.mockResolvedValueOnce([{ id: 3, status: "cancelled" }]);
      const res = await PATCH(patch({ action: "cancel" }), PARAMS);
      expect(res.status).toBe(200);
      expect((await res.json()).policy).toMatchObject({ status: "cancelled" });
      expect(sql.mock.calls[0][0].join(" ")).toContain("status = 'cancelled'");
    });

    it("non-owner → ZERO rows → 404", async () => {
      auth.mockResolvedValue(SESSION);
      sql.mockResolvedValueOnce([]);
      expect((await PATCH(patch({ action: "cancel" }), PARAMS)).status).toBe(404);
    });
  });

  it("RLS rejection → 400", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockRejectedValueOnce(new Error("new row violates row-level security policy"));
    expect((await PATCH(patch({ action: "cancel" }), PARAMS)).status).toBe(400);
  });
});
