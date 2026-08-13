import { describe, it, expect, vi, beforeEach } from "vitest";

// PATCH/DELETE /api/providers/[id]/walk-packages/[packageId] — update / soft-delete one walk
// package (Ticket B2). owner|admin + 'walker' capability. Scoped by id AND provider_id (cross-
// provider → 404). Non-integer packageId → 404 before SQL. auth/sql/providerAuth mocked.

import { PATCH, DELETE } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import {
  requireProviderCapability,
  requireProviderRole,
  ProviderAuthError,
} from "@/app/api/utils/providerAuth";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/providerAuth", () => {
  class MockProviderAuthError extends Error {
    constructor(message) {
      super(message);
      this.name = "ProviderAuthError";
      this.status = 403;
    }
  }
  return {
    requireProviderCapability: vi.fn(),
    requireProviderRole: vi.fn(),
    ProviderAuthError: MockProviderAuthError,
  };
});

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const PROFILE_ROW = { id: 7, auth_user_id: 42 };
const PARAMS = { params: { id: "100", packageId: "9" } };

const patchReq = (body) =>
  new Request("http://localhost/api/providers/100/walk-packages/9", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
const delReq = () =>
  new Request("http://localhost/api/providers/100/walk-packages/9", { method: "DELETE" });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  requireProviderCapability.mockResolvedValue(undefined);
  requireProviderRole.mockResolvedValue({ role: "owner" });
});

describe("PATCH walk-package", () => {
  it("404 (before SQL) for a non-integer packageId", async () => {
    auth.mockResolvedValue(SESSION);
    const res = await PATCH(patchReq({ price_cents: 1 }), { params: { id: "100", packageId: "reorder" } });
    expect(res.status).toBe(404);
    expect(sql).not.toHaveBeenCalled();
  });

  it("400 for a non-positive walks_count", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]);
    const res = await PATCH(patchReq({ walks_count: 0 }), PARAMS);
    expect(res.status).toBe(400);
  });

  it("updates price; scoped by id AND provider_id", async () => {
    auth.mockResolvedValue(SESSION);
    const UPDATED = { id: 9, provider_id: 100, price_cents: 120000, active: true };
    sql.mockResolvedValueOnce([PROFILE_ROW]).mockResolvedValueOnce([UPDATED]);
    const res = await PATCH(patchReq({ price_cents: 120000 }), PARAMS);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ package: UPDATED });
    const text = sql.mock.calls[1][0].join(" ");
    expect(text).toContain("id = ");
    expect(text).toContain("provider_id = ");
  });

  it("404 when no row matches (cross-provider / unknown)", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]).mockResolvedValueOnce([]);
    const res = await PATCH(patchReq({ price_cents: 1 }), PARAMS);
    expect(res.status).toBe(404);
  });
});

describe("DELETE walk-package (soft delete)", () => {
  it("404 (before SQL) for a non-integer packageId", async () => {
    auth.mockResolvedValue(SESSION);
    const res = await DELETE(delReq(), { params: { id: "100", packageId: "reorder" } });
    expect(res.status).toBe(404);
    expect(sql).not.toHaveBeenCalled();
  });

  it("sets active=false (soft delete), scoped, returns the row", async () => {
    auth.mockResolvedValue(SESSION);
    const ROW = { id: 9, provider_id: 100, active: false };
    sql.mockResolvedValueOnce([PROFILE_ROW]).mockResolvedValueOnce([ROW]);
    const res = await DELETE(delReq(), PARAMS);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ package: ROW });
    expect(sql.mock.calls[1][0].join(" ")).toContain("active = false");
  });

  it("403 for a non-walker provider (capability gate)", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]);
    requireProviderCapability.mockRejectedValue(new ProviderAuthError("no walker"));
    const res = await DELETE(delReq(), PARAMS);
    expect(res.status).toBe(403);
  });
});
