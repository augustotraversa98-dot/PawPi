import { describe, it, expect, vi, beforeEach } from "vitest";

// GET /api/providers/[id]/pets/[petId]/record — provider reads the shared medical
// record (Ticket 8). assertCareAccess is the ONLY gate; it is mocked so it can
// resolve a grant or throw CareAccessError. `auth` and `sql` are mocked at the
// module boundary; resolveUserId runs for real against mocked sql, so sql call 1
// is the profile lookup, then (assertCareAccess mocked) sql 2/3/4 are the medical
// profile, vet notes, and vaccinations reads.

import { GET } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { assertCareAccess } from "@/app/api/utils/careAccess";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
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
const PARAMS = { params: { id: "100", petId: "55" } };

const reqUrl = "http://localhost/api/providers/100/pets/55/record";
const allQueryText = () =>
  sql.mock.calls.map((c) => (c?.[0] ?? []).join(" ")).join(" | ");

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/providers/[id]/pets/[petId]/record", () => {
  it("401 when unauthenticated", async () => {
    auth.mockResolvedValue(null);
    const res = await GET(new Request(reqUrl), PARAMS);
    expect(res.status).toBe(401);
    expect(assertCareAccess).not.toHaveBeenCalled();
  });

  it("grant resolves → returns medical profile + notes + vaccinations", async () => {
    auth.mockResolvedValue(SESSION);
    const PROFILE = { pet_id: 55, microchip_id: "abc" };
    const NOTES = [{ id: 1, note: "seen today" }];
    const VAX = [{ id: 9, name: "Rabies" }];
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // resolveUserId
      .mockResolvedValueOnce([PROFILE]) // pet_medical_profiles
      .mockResolvedValueOnce(NOTES) // vet_notes
      .mockResolvedValueOnce(VAX); // pet_vaccinations
    assertCareAccess.mockResolvedValue({ id: 555, scopes: ["medical_read"] });

    const res = await GET(new Request(reqUrl), PARAMS);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      medical_profile: PROFILE,
      notes: NOTES,
      vaccinations: VAX,
    });

    // Gated with the read scope/action against this pet+provider.
    expect(assertCareAccess).toHaveBeenCalledWith(
      "55",
      "100",
      "medical_read",
      expect.objectContaining({
        staffUserId: 7,
        action: "read",
        resource: "medical_record",
      }),
    );
    // The route must NOT itself write an audit row — that's the helper's job.
    expect(allQueryText()).not.toContain("care_access_audit");
  });

  it("empty medical profile → medical_profile is null", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([]) // no profile
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    assertCareAccess.mockResolvedValue({ id: 555 });

    const res = await GET(new Request(reqUrl), PARAMS);
    const body = await res.json();
    expect(body.medical_profile).toBeNull();
  });

  it("assertCareAccess throws CareAccessError → 403, no record reads", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]); // resolveUserId only
    const { CareAccessError } = await import("@/app/api/utils/careAccess");
    assertCareAccess.mockRejectedValue(new CareAccessError("denied"));

    const res = await GET(new Request(reqUrl), PARAMS);
    expect(res.status).toBe(403);
    // Only the profile lookup ran; no medical reads after the gate threw.
    expect(sql).toHaveBeenCalledTimes(1);
  });
});
