import { describe, it, expect, vi, beforeEach } from "vitest";

// POST /api/providers/[id]/pets/[petId]/notes — provider writes a vet note
// (Ticket 8). assertCareAccess is the ONLY gate and is mocked (resolve/throw).
// `auth` + `sql` mocked at the module boundary; resolveUserId runs for real, so
// sql call 1 is the profile lookup, then (assert mocked) sql 2 is the pet-owner
// derivation, [sql 3 is the name lookup when vet_name omitted], and the last sql
// call is the INSERT.

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
  new Request("http://localhost/api/providers/100/pets/55/notes", {
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

describe("POST /api/providers/[id]/pets/[petId]/notes", () => {
  it("401 when unauthenticated", async () => {
    auth.mockResolvedValue(null);
    const res = await POST(postReq({ note: "hi" }), PARAMS);
    expect(res.status).toBe(401);
    expect(assertCareAccess).not.toHaveBeenCalled();
  });

  it("missing note → 400 (before the gate)", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]);
    const res = await POST(postReq({ note_date: "2026-06-15" }), PARAMS);
    expect(res.status).toBe(400);
    expect(assertCareAccess).not.toHaveBeenCalled();
  });

  it("writes vet_notes with owner derived from pet + note_date defaulted to today", async () => {
    auth.mockResolvedValue(SESSION);
    const INSERTED = { id: 1, note: "Looks healthy", owner_user_id: 3 };
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // resolveUserId
      .mockResolvedValueOnce([PET_OWNER_ROW]) // pet owner
      .mockResolvedValueOnce([{ provider_name: "City Vets" }]) // name lookup (no vet_name)
      .mockResolvedValueOnce([INSERTED]); // insert
    assertCareAccess.mockResolvedValue({ id: 555 });

    const res = await POST(postReq({ note: "Looks healthy" }), PARAMS);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ note: INSERTED });

    // Gated with the write scope/action.
    expect(assertCareAccess).toHaveBeenCalledWith(
      "55",
      "100",
      "medical_write",
      expect.objectContaining({ action: "write", resource: "vet_notes" }),
    );

    const text = lastQueryText();
    expect(text).toContain("INSERT INTO vet_notes");
    const values = lastValues();
    expect(values).toContain(3); // owner_user_id derived from the pet
    expect(values).toContain("Looks healthy"); // note
    // note_date defaulted to a canonical YYYY-MM-DD.
    expect(values.some((v) => /^\d{4}-\d{2}-\d{2}$/.test(v))).toBe(true);
    // The route does not write an audit row itself.
    expect(allQueryText()).not.toContain("care_access_audit");
  });

  it("explicit vet_name skips the name lookup", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // resolveUserId
      .mockResolvedValueOnce([PET_OWNER_ROW]) // pet owner
      .mockResolvedValueOnce([{ id: 1, vet_name: "Dr. Who" }]); // insert (no name lookup)
    assertCareAccess.mockResolvedValue({ id: 555 });

    const res = await POST(
      postReq({ note: "n", vet_name: "Dr. Who", note_date: "2026-06-01" }),
      PARAMS,
    );
    expect(res.status).toBe(201);
    // profile + pet-owner + insert = 3 calls; no name lookup.
    expect(sql).toHaveBeenCalledTimes(3);
    expect(lastValues()).toContain("Dr. Who");
    expect(lastValues()).toContain("2026-06-01");
  });

  it("assertCareAccess throws → 403, nothing inserted", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]);
    const { CareAccessError } = await import("@/app/api/utils/careAccess");
    assertCareAccess.mockRejectedValue(new CareAccessError("denied"));

    const res = await POST(postReq({ note: "hi" }), PARAMS);
    expect(res.status).toBe(403);
    expect(sql).toHaveBeenCalledTimes(1); // only the profile lookup
  });
});
