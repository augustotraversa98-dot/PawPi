import { describe, it, expect, vi, beforeEach } from "vitest";

// POST /api/providers/[id]/pets/[petId]/walk-sessions — a walker CHECKS IN (Ticket 2.7).
// Gates in order: requireProviderCapability(provider,'walker') →
// assertCareAccess('health_logs_write') → insert walk_sessions (in_progress, assigned to
// the caller). Both gate helpers are mocked; `auth` + `sql` are mocked at the module
// boundary; resolveUserId runs for real so sql call 1 is the profile lookup, then the
// pet-owner derivation, then the session INSERT.

import { POST } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { requireProviderCapability } from "@/app/api/utils/providerAuth";
import { assertCareAccess } from "@/app/api/utils/careAccess";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/providerAuth", () => {
  class ProviderAuthError extends Error {
    constructor(message) {
      super(message);
      this.name = "ProviderAuthError";
      this.status = 403;
    }
  }
  return { requireProviderCapability: vi.fn(), ProviderAuthError };
});
vi.mock("@/app/api/utils/careAccess", () => {
  class CareAccessError extends Error {
    constructor(message) {
      super(message);
      this.name = "CareAccessError";
      this.status = 403;
    }
  }
  return { assertCareAccess: vi.fn(), CareAccessError };
});

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const PROFILE_ROW = { id: 7, auth_user_id: 42 };
const PET_OWNER_ROW = { owner_user_id: 3 };
const PARAMS = { params: { id: "100", petId: "55" } };

const postReq = (body) =>
  new Request("http://localhost/api/providers/100/pets/55/walk-sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });

const allQueryText = () =>
  sql.mock.calls.map((c) => (c?.[0] ?? []).join(" ")).join(" | ");

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  requireProviderCapability.mockResolvedValue(undefined);
  assertCareAccess.mockResolvedValue({ id: 555 });
});

describe("POST /api/providers/[id]/pets/[petId]/walk-sessions (check in)", () => {
  it("401 when unauthenticated", async () => {
    auth.mockResolvedValue(null);
    const res = await POST(postReq({}), PARAMS);
    expect(res.status).toBe(401);
    expect(requireProviderCapability).not.toHaveBeenCalled();
  });

  it("a NON-walker provider → 403 from the capability gate, no pet data touched", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]); // resolveUserId
    const { ProviderAuthError } = await import("@/app/api/utils/providerAuth");
    requireProviderCapability.mockRejectedValue(
      new ProviderAuthError("Provider does not have the 'walker' capability"),
    );

    const res = await POST(postReq({}), PARAMS);
    expect(res.status).toBe(403);
    expect(requireProviderCapability).toHaveBeenCalledWith("100", "walker");
    expect(assertCareAccess).not.toHaveBeenCalled();
    expect(sql).toHaveBeenCalledTimes(1); // only the profile lookup
  });

  it("assertCareAccess throws → 403, nothing inserted", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]);
    const { CareAccessError } = await import("@/app/api/utils/careAccess");
    assertCareAccess.mockRejectedValue(new CareAccessError("denied"));

    const res = await POST(postReq({}), PARAMS);
    expect(res.status).toBe(403);
    expect(allQueryText()).not.toContain("INSERT INTO walk_sessions");
  });

  it("checks in: creates an in_progress session assigned to the caller", async () => {
    auth.mockResolvedValue(SESSION);
    const CREATED = {
      id: 1,
      status: "in_progress",
      staff_user_id: 7,
      owner_user_id: 3,
    };
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // resolveUserId
      .mockResolvedValueOnce([PET_OWNER_ROW]) // pet owner derivation
      .mockResolvedValueOnce([CREATED]); // walk_sessions insert

    const res = await POST(postReq({}), PARAMS);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.session).toEqual(CREATED);

    expect(assertCareAccess).toHaveBeenCalledWith(
      "55",
      "100",
      "health_logs_write",
      expect.objectContaining({ action: "write", resource: "walk_sessions" }),
    );

    const text = allQueryText();
    expect(text).toContain("INSERT INTO walk_sessions");
    expect(text).toContain("'in_progress'");
  });

  it("rejects a booking that is not this provider's booking for this pet", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // resolveUserId
      .mockResolvedValueOnce([PET_OWNER_ROW]) // pet owner
      .mockResolvedValueOnce([]); // booking lookup → none

    const res = await POST(postReq({ booking_id: 999 }), PARAMS);
    expect(res.status).toBe(400);
    expect(allQueryText()).not.toContain("INSERT INTO walk_sessions");
  });
});
