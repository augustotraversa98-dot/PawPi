import { describe, it, expect, vi, beforeEach } from "vitest";

// GET /api/providers/[id]/pets/[petId]/vaccine-check — the CONSENT-GATED vaccine check
// (Ticket 2.8). Gates in order: requireProviderCapability(provider,'daycare') →
// assertCareAccess('medical_read') → read pet_vaccinations + compute pass/fail. The crux:
// WITHOUT a medical_read grant the route 403s ("needs consent") and reads NO vaccinations.

import { GET } from "./route";
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
const PARAMS = { params: { id: "100", petId: "55" } };

const getReq = () =>
  new Request("http://localhost/api/providers/100/pets/55/vaccine-check");

const allQueryText = () =>
  sql.mock.calls.map((c) => (c?.[0] ?? []).join(" ")).join(" | ");

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  requireProviderCapability.mockResolvedValue(undefined);
  assertCareAccess.mockResolvedValue({ id: 555 });
});

describe("GET /api/providers/[id]/pets/[petId]/vaccine-check (consent-gated)", () => {
  it("401 when unauthenticated", async () => {
    auth.mockResolvedValue(null);
    const res = await GET(getReq(), PARAMS);
    expect(res.status).toBe(401);
    expect(requireProviderCapability).not.toHaveBeenCalled();
  });

  it("a NON-daycare provider → 403, NO vaccinations read", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]); // resolveUserId
    const { ProviderAuthError } = await import("@/app/api/utils/providerAuth");
    requireProviderCapability.mockRejectedValue(
      new ProviderAuthError("Provider does not have the 'daycare' capability"),
    );

    const res = await GET(getReq(), PARAMS);
    expect(res.status).toBe(403);
    expect(requireProviderCapability).toHaveBeenCalledWith("100", "daycare");
    expect(assertCareAccess).not.toHaveBeenCalled();
    expect(allQueryText()).not.toContain("FROM pet_vaccinations");
  });

  it("WITHOUT a medical_read grant → 403 needs_consent, NO vaccinations read (the DO-NOT)", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]); // resolveUserId
    const { CareAccessError } = await import("@/app/api/utils/careAccess");
    assertCareAccess.mockRejectedValue(
      new CareAccessError("No active care-access grant for the required scope"),
    );

    const res = await GET(getReq(), PARAMS);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.needs_consent).toBe(true);
    // medical_read is the scope required — NOT health_logs_write.
    expect(assertCareAccess).toHaveBeenCalledWith(
      "55",
      "100",
      "medical_read",
      expect.objectContaining({ action: "read" }),
    );
    expect(allQueryText()).not.toContain("FROM pet_vaccinations");
  });

  it("WITH the grant: computes pass/fail + missing from pet_vaccinations", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // resolveUserId
      .mockResolvedValueOnce([
        { name: "rabies", display: "Rabies" },
        { name: "dhpp", display: "DHPP" },
      ]) // requirements
      .mockResolvedValueOnce([
        { id: 1, name: "Rabies", date_given: null, expires_on: null },
      ]); // the pet's vaccinations (DHPP missing)

    const res = await GET(getReq(), PARAMS);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.passed).toBe(false);
    expect(json.missing).toEqual(["DHPP"]);
    expect(allQueryText()).toContain("FROM pet_vaccinations");
  });

  it("no requirements → passes with an empty list (read still gated)", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // resolveUserId
      .mockResolvedValueOnce([]); // no requirements

    const res = await GET(getReq(), PARAMS);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.passed).toBe(true);
    expect(json.required).toEqual([]);
    // assertCareAccess STILL ran before we short-circuited (consent is always required).
    expect(assertCareAccess).toHaveBeenCalled();
  });
});
