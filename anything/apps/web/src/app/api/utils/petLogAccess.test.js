import { describe, it, expect, vi, beforeEach } from "vitest";

// FF2 — the owner-OR-family write gate for health/walk logs. Owner is the anchor; a family
// caregiver's write anchors to the pet's owner; a Viewer/stranger is rejected 403.

import { resolvePetLogOwner } from "./petLogAccess";
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
    expect(await resolvePetLogOwner(7, 5)).toEqual({ ownerUserId: 7, isOwner: true });
  });

  it("family caregiver → anchors to the pet's actual owner", async () => {
    sql.mockResolvedValueOnce([]); // not owner
    sql.mockResolvedValueOnce([{ ok: true }]); // app_user_has_pet_family
    sql.mockResolvedValueOnce([{ owner_user_id: 3 }]); // pet's real owner
    expect(await resolvePetLogOwner(9, 5)).toEqual({ ownerUserId: 3, isOwner: false });
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
});
