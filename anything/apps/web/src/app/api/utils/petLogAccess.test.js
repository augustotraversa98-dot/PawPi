import { describe, it, expect, vi, beforeEach } from "vitest";

// FF2 — the owner-OR-family write gate for health/walk logs. Owner is the anchor; a family
// caregiver's write anchors to the pet's owner; a Viewer/stranger is rejected 403.

import { resolvePetLogOwner, policyExists } from "./petLogAccess";
import sql from "@/app/api/utils/sql";

vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/requestContext", () => ({ withSavepoint: (fn) => fn() }));

beforeEach(() => vi.clearAllMocks());

describe("resolvePetLogOwner", () => {
  it("null caller → 404", async () => {
    expect(await resolvePetLogOwner(null, 5)).toEqual({ error: "User profile not found", status: 404 });
  });

  it("missing petId → 400", async () => {
    expect(await resolvePetLogOwner(7, undefined)).toEqual({ error: "petId is required", status: 400 });
  });

  it("owner → anchors to the caller", async () => {
    sql.mockResolvedValueOnce([{ owner_user_id: 7 }]); // owner fast-path hit
    expect(await resolvePetLogOwner(7, 5)).toEqual({ ownerUserId: 7, isOwner: true, role: "owner" });
  });

  it("family caregiver → anchors to the pet's actual owner", async () => {
    sql.mockResolvedValueOnce([]); // not owner
    sql.mockResolvedValueOnce([{ ok: true }]); // app_user_has_pet_family
    sql.mockResolvedValueOnce([{ owner_user_id: 3 }]); // pet's real owner
    expect(await resolvePetLogOwner(9, 5)).toEqual({ ownerUserId: 3, isOwner: false, role: "family" });
  });

  it("Viewer / stranger (no family grant) → 403", async () => {
    sql.mockResolvedValueOnce([]); // not owner
    sql.mockResolvedValueOnce([{ ok: false }]); // not family
    expect(await resolvePetLogOwner(9, 5)).toEqual({ error: "Pet not found or access denied", status: 403 });
  });

  it("pre-0049 (missing app_user_has_pet_family) → not a caregiver → 403", async () => {
    sql.mockResolvedValueOnce([]); // not owner
    sql.mockRejectedValueOnce({ code: "42883" }); // function absent
    expect(await resolvePetLogOwner(9, 5)).toEqual({ error: "Pet not found or access denied", status: 403 });
  });

  it("caregiver (allowCaregiver) is admitted with role 'caregiver' only when the 0139 insert policy exists", async () => {
    sql.mockResolvedValueOnce([]); // not owner
    sql.mockResolvedValueOnce([{ ok: true, fam: false }]); // any-access yes, family no
    sql.mockResolvedValueOnce([{ "?column?": 1 }]); // pg_policies: <table>_caregiver_insert present
    sql.mockResolvedValueOnce([{ owner_user_id: 3 }]);
    expect(await resolvePetLogOwner(9, 5, { allowCaregiver: true, logTable: "health_food_logs" })).toEqual({
      ownerUserId: 3,
      isOwner: false,
      role: "caregiver",
    });
  });

  it("caregiver + policy missing -> friendly 403 caregiver_logging_unavailable", async () => {
    sql.mockResolvedValueOnce([]);
    sql.mockResolvedValueOnce([{ ok: true, fam: false }]);
    sql.mockResolvedValueOnce([]); // policy absent
    const r = await resolvePetLogOwner(9, 5, { allowCaregiver: true, logTable: "health_food_logs" });
    expect(r).toMatchObject({ status: 403, code: "caregiver_logging_unavailable" });
  });

  it("family + familyPolicy present -> admitted with role 'family'; absent -> friendly 403 family_write_unavailable", async () => {
    const fp = { table: "pet_vaccinations", policy: "pet_vaccinations_family_all" };
    sql.mockResolvedValueOnce([]); // not owner
    sql.mockResolvedValueOnce([{ ok: true }]); // family
    sql.mockResolvedValueOnce([{ "?column?": 1 }]); // policy present
    sql.mockResolvedValueOnce([{ owner_user_id: 3 }]);
    expect(await resolvePetLogOwner(9, 5, { familyPolicy: fp })).toEqual({ ownerUserId: 3, isOwner: false, role: "family" });

    sql.mockResolvedValueOnce([]);
    sql.mockResolvedValueOnce([{ ok: true }]);
    sql.mockResolvedValueOnce([]); // policy absent (migration not applied)
    expect(await resolvePetLogOwner(9, 5, { familyPolicy: fp })).toMatchObject({ status: 403, code: "family_write_unavailable" });
  });

  it("the OWNER never pays for the probe (one query, familyPolicy ignored)", async () => {
    sql.mockResolvedValueOnce([{ owner_user_id: 7 }]);
    await resolvePetLogOwner(7, 5, { familyPolicy: { table: "pet_vaccinations", policy: "x" } });
    expect(sql).toHaveBeenCalledTimes(1);
  });

  it("policyExists reads pg_policies", async () => {
    sql.mockResolvedValueOnce([{ "?column?": 1 }]);
    expect(await policyExists("t", "p")).toBe(true);
    sql.mockResolvedValueOnce([]);
    expect(await policyExists("t", "p")).toBe(false);
  });
});
