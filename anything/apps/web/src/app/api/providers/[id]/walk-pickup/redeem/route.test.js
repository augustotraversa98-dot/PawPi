import { describe, it, expect, vi, beforeEach } from "vitest";

// POST /api/providers/[id]/walk-pickup/redeem — the walker scans the owner's QR (Ticket B3). Gates
// (capability + active staff) → token verify (bound to THIS provider) → app_redeem_walk_credit
// (atomic decrement + session insert). 409 no-credits; 401 bad token; 403 wrong provider; 404
// non-integer id; 404 degrade-clean (unmigrated — never a 5xx). auth/sql/providerAuth/token-util
// mocked.

import { POST } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import {
  requireProviderCapability,
  requireProviderRole,
  ProviderAuthError,
} from "@/app/api/utils/providerAuth";
import { verifyPickupToken } from "@/app/api/utils/walkPickupToken";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/walkPickupToken", () => ({ verifyPickupToken: vi.fn() }));
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
const okPayload = { owner_user_id: 3, pet_id: 5, provider_id: 100, exp: 9_999_999_999 };

const postReq = (body) =>
  new Request("http://localhost/api/providers/100/walk-pickup/redeem", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  requireProviderCapability.mockResolvedValue(undefined);
  requireProviderRole.mockResolvedValue({ role: "owner" });
});

describe("POST redeem", () => {
  it("404 (before SQL/gate) for a non-integer provider id", async () => {
    auth.mockResolvedValue(SESSION);
    const res = await POST(postReq({ token: "x" }), { params: { id: "abc" } });
    expect(res.status).toBe(404);
    expect(requireProviderCapability).not.toHaveBeenCalled();
  });

  it("403 for a non-walker provider (capability gate)", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]);
    requireProviderCapability.mockRejectedValue(new ProviderAuthError("no walker"));
    const res = await POST(postReq({ token: "x" }), PARAMS);
    expect(res.status).toBe(403);
  });

  it("401 for an invalid token", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]);
    verifyPickupToken.mockReturnValue(null);
    const res = await POST(postReq({ token: "bad" }), PARAMS);
    expect(res.status).toBe(401);
  });

  it("403 when the token is for a different provider", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]);
    verifyPickupToken.mockReturnValue({ ...okPayload, provider_id: 999 });
    const res = await POST(postReq({ token: "t" }), PARAMS);
    expect(res.status).toBe(403);
  });

  it("201 with session_id on a successful redeem; passes the pickup GPS", async () => {
    auth.mockResolvedValue(SESSION);
    verifyPickupToken.mockReturnValue(okPayload);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // resolveUserId
      .mockResolvedValueOnce([{ session_id: 777 }]); // app_redeem_walk_credit
    const res = await POST(postReq({ token: "t", lat: -34.6, lng: -58.4 }), PARAMS);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ session_id: 777 });
    const values = sql.mock.calls[1].slice(1);
    expect(values).toContain(-34.6);
    expect(values).toContain(-58.4);
    expect(sql.mock.calls[1][0].join(" ")).toContain("app_redeem_walk_credit");
  });

  it("409 no-credits when the helper returns null", async () => {
    auth.mockResolvedValue(SESSION);
    verifyPickupToken.mockReturnValue(okPayload);
    sql.mockResolvedValueOnce([PROFILE_ROW]).mockResolvedValueOnce([{ session_id: null }]);
    const res = await POST(postReq({ token: "t" }), PARAMS);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("no_credits");
  });

  it("404 degrade-clean when the helper is absent (unmigrated, never a 5xx)", async () => {
    auth.mockResolvedValue(SESSION);
    verifyPickupToken.mockReturnValue(okPayload);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockRejectedValueOnce(
        Object.assign(new Error("function app_redeem_walk_credit does not exist"), { code: "42883" }),
      );
    const res = await POST(postReq({ token: "t" }), PARAMS);
    expect(res.status).toBe(404);
  });
});
