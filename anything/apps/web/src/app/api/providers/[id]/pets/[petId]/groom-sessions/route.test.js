import { describe, it, expect, vi, beforeEach } from "vitest";

// POST /api/providers/[id]/pets/[petId]/groom-sessions — a groomer logs a session
// (Ticket 2.6). Gates in order: requireProviderCapability(provider,'groomer') →
// assertCareAccess('health_logs_write') → insert groom_sessions (+ a health_general_checks
// coat/skin note in OWNER context). Both gate helpers are mocked; `auth` + `sql` are
// mocked at the module boundary; resolveUserId runs for real so sql call 1 is the profile
// lookup, then the pet-owner derivation, the session INSERT, and (when a note is given)
// the health_general_checks INSERT.

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
  new Request("http://localhost/api/providers/100/pets/55/groom-sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const allQueryText = () =>
  sql.mock.calls.map((c) => (c?.[0] ?? []).join(" ")).join(" | ");

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  requireProviderCapability.mockResolvedValue(undefined);
  assertCareAccess.mockResolvedValue({ id: 555 });
});

describe("POST /api/providers/[id]/pets/[petId]/groom-sessions", () => {
  it("401 when unauthenticated", async () => {
    auth.mockResolvedValue(null);
    const res = await POST(postReq({ coat_skin_notes: "ok" }), PARAMS);
    expect(res.status).toBe(401);
    expect(requireProviderCapability).not.toHaveBeenCalled();
  });

  it("a NON-groomer provider → 403 from the capability gate, no pet data touched", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]); // resolveUserId
    const { ProviderAuthError } = await import("@/app/api/utils/providerAuth");
    requireProviderCapability.mockRejectedValue(
      new ProviderAuthError("Provider does not have the 'groomer' capability"),
    );

    const res = await POST(postReq({ coat_skin_notes: "ok" }), PARAMS);
    expect(res.status).toBe(403);
    expect(requireProviderCapability).toHaveBeenCalledWith("100", "groomer");
    expect(assertCareAccess).not.toHaveBeenCalled();
    expect(sql).toHaveBeenCalledTimes(1); // only the profile lookup
  });

  it("an empty session (no photos, no notes) → 400 before the care gate", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]);
    const res = await POST(postReq({}), PARAMS);
    expect(res.status).toBe(400);
    expect(assertCareAccess).not.toHaveBeenCalled();
  });

  it("assertCareAccess throws → 403, nothing inserted", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]);
    const { CareAccessError } = await import("@/app/api/utils/careAccess");
    assertCareAccess.mockRejectedValue(new CareAccessError("denied"));

    const res = await POST(postReq({ coat_skin_notes: "ok" }), PARAMS);
    expect(res.status).toBe(403);
    expect(allQueryText()).not.toContain("INSERT INTO groom_sessions");
  });

  it("logs the session AND routes the coat/skin note into health_general_checks", async () => {
    auth.mockResolvedValue(SESSION);
    const SESSION_ROW = { id: 1, before_urls: ["b.jpg"], owner_user_id: 3 };
    const HEALTH_ROW = { id: 9, skin_fur_status: "shiny" };
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // resolveUserId
      .mockResolvedValueOnce([PET_OWNER_ROW]) // pet owner derivation
      .mockResolvedValueOnce([SESSION_ROW]) // groom_sessions insert
      .mockResolvedValueOnce([HEALTH_ROW]); // health_general_checks insert

    const res = await POST(
      postReq({
        before_urls: ["b.jpg"],
        after_urls: ["a.jpg"],
        coat_skin_notes: "shiny",
        products_used: "oatmeal shampoo",
      }),
      PARAMS,
    );

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.session).toEqual(SESSION_ROW);
    expect(json.healthLog).toEqual(HEALTH_ROW);

    // Gated with the grooming scope + resource.
    expect(assertCareAccess).toHaveBeenCalledWith(
      "55",
      "100",
      "health_logs_write",
      expect.objectContaining({ action: "write", resource: "groom_sessions" }),
    );

    const text = allQueryText();
    expect(text).toContain("INSERT INTO groom_sessions");
    // The coat/skin note flows into the EXISTING health-log table (no parallel write).
    expect(text).toContain("INSERT INTO health_general_checks");
  });

  it("a photo-only session writes NO health log (no empty health rows)", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // resolveUserId
      .mockResolvedValueOnce([PET_OWNER_ROW]) // pet owner
      .mockResolvedValueOnce([{ id: 1 }]); // groom_sessions insert (no health insert)

    const res = await POST(postReq({ after_urls: ["a.jpg"] }), PARAMS);
    expect(res.status).toBe(201);
    expect((await res.json()).healthLog).toBeNull();
    expect(allQueryText()).not.toContain("INSERT INTO health_general_checks");
  });
});
