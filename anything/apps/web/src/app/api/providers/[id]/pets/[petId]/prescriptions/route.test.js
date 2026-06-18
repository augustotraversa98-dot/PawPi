import { describe, it, expect, vi, beforeEach } from "vitest";

// POST /api/providers/[id]/pets/[petId]/prescriptions — a vet issues an Rx (ticket 2.53). Gates:
// requireProviderCapability('vet') → assertCareAccess('medical_write') → INSERT. Owner never writes.

import { POST, GET } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { requireProviderCapability } from "@/app/api/utils/providerAuth";
import { assertCareAccess } from "@/app/api/utils/careAccess";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/providerAuth", () => {
  class ProviderAuthError extends Error {
    constructor(m) { super(m); this.status = 403; }
  }
  return { requireProviderCapability: vi.fn(), ProviderAuthError };
});
vi.mock("@/app/api/utils/careAccess", () => {
  class CareAccessError extends Error {
    constructor(m) { super(m); this.status = 403; }
  }
  return { assertCareAccess: vi.fn(), CareAccessError };
});

const SESSION = { user: { id: 42 } };
const PARAMS = { params: { id: "10", petId: "5" } };
const PROFILE = [{ id: 7 }];
const post = (body) =>
  new Request("http://localhost/api/providers/10/pets/5/prescriptions", {
    method: "POST", body: JSON.stringify(body),
  });
const good = { drug_name: "Amoxicillin", dose: "250mg", frequency: "BID", refills_authorized: 2 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  requireProviderCapability.mockResolvedValue(undefined);
  assertCareAccess.mockResolvedValue({ id: 1 });
});

it("401 unauthenticated", async () => {
  auth.mockResolvedValue(null);
  expect((await POST(post(good), PARAMS)).status).toBe(401);
});

it("a non-vet provider → 403 from the capability gate, no pet data touched", async () => {
  auth.mockResolvedValue(SESSION);
  sql.mockResolvedValueOnce(PROFILE);
  const { ProviderAuthError } = await import("@/app/api/utils/providerAuth");
  requireProviderCapability.mockRejectedValue(new ProviderAuthError("no vet"));
  const res = await POST(post(good), PARAMS);
  expect(res.status).toBe(403);
  expect(assertCareAccess).not.toHaveBeenCalled();
});

it("400 when drug_name/dose/frequency missing", async () => {
  auth.mockResolvedValue(SESSION);
  sql.mockResolvedValueOnce(PROFILE);
  expect((await POST(post({ dose: "x", frequency: "y" }), PARAMS)).status).toBe(400);
});

it("denied care access → 403, nothing inserted", async () => {
  auth.mockResolvedValue(SESSION);
  sql.mockResolvedValueOnce(PROFILE);
  const { CareAccessError } = await import("@/app/api/utils/careAccess");
  assertCareAccess.mockRejectedValue(new CareAccessError("denied"));
  const res = await POST(post(good), PARAMS);
  expect(res.status).toBe(403);
  const text = sql.mock.calls.map((c) => c[0].join(" ")).join(" | ");
  expect(text).not.toContain("INSERT INTO prescriptions");
});

it("issues the Rx (201) with medical_write gating + refills seeded from authorized", async () => {
  auth.mockResolvedValue(SESSION);
  sql
    .mockResolvedValueOnce(PROFILE) // resolveUserId
    .mockResolvedValueOnce([{ owner_user_id: 3 }]) // pet owner
    .mockResolvedValueOnce([{ id: 88 }]) // issuing staff row
    .mockResolvedValueOnce([{ id: 1, drug_name: "Amoxicillin", refills_remaining: 2 }]); // insert
  const res = await POST(post(good), PARAMS);
  expect(res.status).toBe(201);
  expect((await res.json()).prescription.drug_name).toBe("Amoxicillin");
  expect(assertCareAccess).toHaveBeenCalledWith(
    "5", "10", "medical_write", expect.objectContaining({ resource: "prescriptions" }),
  );
  expect(sql.mock.calls.map((c) => c[0].join(" ")).join(" | ")).toContain("INSERT INTO prescriptions");
});

it("GET lists the provider's prescriptions for the pet", async () => {
  auth.mockResolvedValue(SESSION);
  sql.mockResolvedValueOnce(PROFILE).mockResolvedValueOnce([{ id: 1 }]);
  const res = await GET(new Request("http://localhost/api/providers/10/pets/5/prescriptions"), PARAMS);
  expect(res.status).toBe(200);
  expect((await res.json()).prescriptions).toHaveLength(1);
});
