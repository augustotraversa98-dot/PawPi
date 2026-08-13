import { describe, it, expect, vi, beforeEach } from "vitest";

// GET/POST /api/providers/[id]/walk-packages — a walker's prepaid pack offerings (Ticket B2). GET
// lists all (active+inactive) for active staff; POST creates (owner|admin). Both gate on the
// 'walker' capability. Degrade-clean (missing table → []). auth/sql/providerAuth mocked.

import { GET, POST } from "./route";
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
    ALL_PROVIDER_ROLES: ["owner", "admin", "staff", "vet"],
  };
});

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const PROFILE_ROW = { id: 7, auth_user_id: 42 };
const PARAMS = { params: { id: "100" } };

const queryTextOf = (i) => (sql.mock.calls[i]?.[0] ?? []).join(" ");
const valuesOf = (i) => sql.mock.calls[i]?.slice(1) ?? [];
const getReq = () => new Request("http://localhost/api/providers/100/walk-packages");
const postReq = (body) =>
  new Request("http://localhost/api/providers/100/walk-packages", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/providers/[id]/walk-packages", () => {
  it("404 (before SQL) for a non-integer provider id", async () => {
    auth.mockResolvedValue(SESSION);
    const res = await GET(getReq(), { params: { id: "reorder" } });
    expect(res.status).toBe(404);
    expect(sql).not.toHaveBeenCalled();
  });

  it("403 for a non-walker provider (capability gate)", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]);
    requireProviderCapability.mockRejectedValue(new ProviderAuthError("no walker"));
    const res = await GET(getReq(), PARAMS);
    expect(res.status).toBe(403);
  });

  it("active staff → lists this walker's packages", async () => {
    auth.mockResolvedValue(SESSION);
    const PACKS = [{ id: 1, walks_count: 1, price_cents: 10000, active: true }];
    sql.mockResolvedValueOnce([PROFILE_ROW]).mockResolvedValueOnce(PACKS);
    requireProviderCapability.mockResolvedValue(undefined);
    requireProviderRole.mockResolvedValue({ role: "staff" });
    const res = await GET(getReq(), PARAMS);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ packages: PACKS });
  });

  it("degrades clean when the table is absent → []", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockRejectedValueOnce(
        Object.assign(new Error('relation "walk_packages" does not exist'), { code: "42P01" }),
      );
    requireProviderCapability.mockResolvedValue(undefined);
    requireProviderRole.mockResolvedValue({ role: "owner" });
    const res = await GET(getReq(), PARAMS);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ packages: [] });
  });
});

describe("POST /api/providers/[id]/walk-packages", () => {
  it("400 for a non-positive walks_count", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]);
    requireProviderCapability.mockResolvedValue(undefined);
    requireProviderRole.mockResolvedValue({ role: "owner" });
    const res = await POST(postReq({ walks_count: 0, price_cents: 100 }), PARAMS);
    expect(res.status).toBe(400);
    expect(sql).toHaveBeenCalledTimes(1); // profile lookup only, no insert
  });

  it("400 for a negative price_cents", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]);
    requireProviderCapability.mockResolvedValue(undefined);
    requireProviderRole.mockResolvedValue({ role: "owner" });
    const res = await POST(postReq({ walks_count: 10, price_cents: -1 }), PARAMS);
    expect(res.status).toBe(400);
  });

  it("owner creates a package; currency defaults ARS, active defaults true, scoped to provider", async () => {
    auth.mockResolvedValue(SESSION);
    const CREATED = { id: 9, provider_id: 100, walks_count: 10, price_cents: 90000, active: true };
    sql.mockResolvedValueOnce([PROFILE_ROW]).mockResolvedValueOnce([CREATED]);
    requireProviderCapability.mockResolvedValue(undefined);
    requireProviderRole.mockResolvedValue({ role: "owner" });
    const res = await POST(postReq({ walks_count: 10, price_cents: 90000 }), PARAMS);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ package: CREATED });
    expect(queryTextOf(1)).toContain("INSERT INTO walk_packages");
    const values = valuesOf(1);
    expect(values).toContain("100");
    expect(values).toContain("ARS");
    expect(values).toContain(true);
  });
});
