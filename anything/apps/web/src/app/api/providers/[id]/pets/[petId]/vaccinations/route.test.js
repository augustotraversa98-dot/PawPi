import { describe, it, expect, vi, beforeEach } from "vitest";

// POST /api/providers/[id]/pets/[petId]/vaccinations — provider writes a
// vaccination (Ticket 8). assertCareAccess is the ONLY gate and is mocked
// (resolve/throw). `auth` + `sql` mocked at the module boundary; resolveUserId
// runs for real, so sql call 1 is the profile lookup, then (assert mocked) sql 2
// is the pet-owner derivation and sql 3 is the INSERT.

import { POST } from "./route";
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
const PET_OWNER_ROW = { owner_user_id: 3 };
const PARAMS = { params: { id: "100", petId: "55" } };

const postReq = (body) =>
  new Request("http://localhost/api/providers/100/pets/55/vaccinations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const lastCall = () => sql.mock.calls[sql.mock.calls.length - 1];
const lastQueryText = () => (lastCall()?.[0] ?? []).join(" ");
const lastValues = () => lastCall()?.slice(1) ?? [];
const allQueryText = () =>
  sql.mock.calls.map((c) => (c?.[0] ?? []).join(" ")).join(" | ");

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/providers/[id]/pets/[petId]/vaccinations", () => {
  it("401 when unauthenticated", async () => {
    auth.mockResolvedValue(null);
    const res = await POST(postReq({ name: "Rabies" }), PARAMS);
    expect(res.status).toBe(401);
    expect(assertCareAccess).not.toHaveBeenCalled();
  });

  it("missing name → 400 (before the gate)", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]);
    const res = await POST(postReq({ lot: "X1" }), PARAMS);
    expect(res.status).toBe(400);
    expect(assertCareAccess).not.toHaveBeenCalled();
  });

  it("writes pet_vaccinations with administered_by_provider_id = :id and owner from pet", async () => {
    auth.mockResolvedValue(SESSION);
    const INSERTED = { id: 9, name: "Rabies", administered_by_provider_id: 100 };
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // resolveUserId
      .mockResolvedValueOnce([PET_OWNER_ROW]) // pet owner
      .mockResolvedValueOnce([INSERTED]); // insert
    assertCareAccess.mockResolvedValue({ id: 555 });

    const res = await POST(
      postReq({ name: "Rabies", date_given: "2026-06-15", lot: "X1" }),
      PARAMS,
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ vaccination: INSERTED });

    // Gated with the vaccinations write scope/action.
    expect(assertCareAccess).toHaveBeenCalledWith(
      "55",
      "100",
      "vaccinations_write",
      expect.objectContaining({ action: "write", resource: "pet_vaccinations" }),
    );

    const text = lastQueryText();
    expect(text).toContain("INSERT INTO pet_vaccinations");
    expect(text).toContain("administered_by_provider_id");
    const values = lastValues();
    expect(values).toContain("100"); // administered_by_provider_id = :id
    expect(values).toContain(3); // owner_user_id derived from the pet
    expect(values).toContain("Rabies");
    expect(allQueryText()).not.toContain("care_access_audit");
  });

  it("insufficient scope (helper throws) → 403, nothing inserted", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]);
    const { CareAccessError } = await import("@/app/api/utils/careAccess");
    assertCareAccess.mockRejectedValue(new CareAccessError("denied"));

    const res = await POST(postReq({ name: "Rabies" }), PARAMS);
    expect(res.status).toBe(403);
    expect(sql).toHaveBeenCalledTimes(1); // only the profile lookup
  });
});
