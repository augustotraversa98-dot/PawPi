import { describe, it, expect, vi, beforeEach } from "vitest";

// POST /api/providers/[id]/sitting-visits — the assigned SITTER logs a per-visit update
// (Ticket 2.9). Provider-context route: gates capability('sitter') → pet exists → (optional
// booking belongs to provider+pet) → assertCareAccess('health_logs_write') → insert the
// visit assigned to the caller. `auth`, `sql`, the provider/care-access utils are mocked at
// the module boundary; resolveUserId runs for real.

import { POST } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { requireProviderCapability } from "@/app/api/utils/providerAuth";
import { assertCareAccess } from "@/app/api/utils/careAccess";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/providerAuth", async () => {
  const actual = await vi.importActual("@/app/api/utils/providerAuth");
  return { ...actual, requireProviderCapability: vi.fn() };
});
vi.mock("@/app/api/utils/careAccess", async () => {
  const actual = await vi.importActual("@/app/api/utils/careAccess");
  return { ...actual, assertCareAccess: vi.fn() };
});

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const PROFILE_ROW = { id: 7, auth_user_id: 42 };
const PARAMS = { params: { id: "100" } }; // provider id

const postReq = (body) =>
  new Request("http://localhost/api/providers/100/sitting-visits", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });

const allQueryText = () =>
  sql.mock.calls.map((c) => (c?.[0] ?? []).join(" ")).join(" | ");

const okBody = {
  pet_id: 55,
  notes: "Fed + walked, very happy",
  photo_urls: ["https://cdn/x.jpg"],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  requireProviderCapability.mockResolvedValue(true);
  assertCareAccess.mockResolvedValue({ id: 1 });
});

describe("POST /api/providers/[id]/sitting-visits (sitter logs a visit)", () => {
  it("401 when unauthenticated", async () => {
    auth.mockResolvedValue(null);
    const res = await POST(postReq(okBody), PARAMS);
    expect(res.status).toBe(401);
  });

  it("403 when the provider lacks the 'sitter' capability (the gate)", async () => {
    auth.mockResolvedValue(SESSION);
    const { ProviderAuthError } = await vi.importActual(
      "@/app/api/utils/providerAuth",
    );
    requireProviderCapability.mockRejectedValue(
      new ProviderAuthError("Provider does not have the required capability"),
    );
    sql.mockResolvedValueOnce([PROFILE_ROW]); // resolveUserId
    const res = await POST(postReq(okBody), PARAMS);
    expect(res.status).toBe(403);
    expect(allQueryText()).not.toContain("INSERT INTO sitting_visits");
  });

  it("400 when pet_id is missing", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]); // resolveUserId
    const res = await POST(postReq({ notes: "no pet" }), PARAMS);
    expect(res.status).toBe(400);
    expect(allQueryText()).not.toContain("INSERT INTO sitting_visits");
  });

  it("404 when the pet does not exist", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // resolveUserId
      .mockResolvedValueOnce([]); // pet lookup → none
    const res = await POST(postReq(okBody), PARAMS);
    expect(res.status).toBe(404);
    expect(allQueryText()).not.toContain("INSERT INTO sitting_visits");
  });

  it("403 when assertCareAccess denies (no grant)", async () => {
    auth.mockResolvedValue(SESSION);
    const { CareAccessError } = await vi.importActual(
      "@/app/api/utils/careAccess",
    );
    assertCareAccess.mockRejectedValue(
      new CareAccessError("No active care-access grant for the required scope"),
    );
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // resolveUserId
      .mockResolvedValueOnce([{ id: 55, owner_user_id: 9 }]); // pet lookup
    const res = await POST(postReq(okBody), PARAMS);
    expect(res.status).toBe(403);
    expect(allQueryText()).not.toContain("INSERT INTO sitting_visits");
  });

  it("201 logs the visit (owner derived from the pet, assigned to the caller)", async () => {
    auth.mockResolvedValue(SESSION);
    const CREATED = { id: 1, status: "completed", owner_user_id: 9, staff_user_id: 7 };
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // resolveUserId
      .mockResolvedValueOnce([{ id: 55, owner_user_id: 9 }]) // pet lookup
      .mockResolvedValueOnce([CREATED]); // INSERT
    const res = await POST(postReq(okBody), PARAMS);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.visit).toEqual(CREATED);
    expect(allQueryText()).toContain("INSERT INTO sitting_visits");
    // The pet-data gate ran before the insert.
    expect(assertCareAccess).toHaveBeenCalledWith(
      55,
      "100",
      "health_logs_write",
      expect.objectContaining({ staffUserId: 7, action: "write" }),
    );
  });

  it("400 when a linked booking does not belong to this provider+pet", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // resolveUserId
      .mockResolvedValueOnce([{ id: 55, owner_user_id: 9 }]) // pet lookup
      .mockResolvedValueOnce([]); // booking lookup → none
    const res = await POST(postReq({ ...okBody, booking_id: 999 }), PARAMS);
    expect(res.status).toBe(400);
    expect(allQueryText()).not.toContain("INSERT INTO sitting_visits");
  });
});
