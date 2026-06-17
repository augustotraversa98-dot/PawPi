import { describe, it, expect, vi, beforeEach } from "vitest";

// POST /api/providers/[id]/training-progress — the TRAINER logs per-pet progress
// (Ticket 2.10). Provider-context route: gates capability('trainer') → resolves the pet
// (from progress_id or from session+pet_id) → assertCareAccess('health_logs_write') →
// insert/update. `auth`, `sql`, the provider/care-access utils are mocked at the module
// boundary; resolveUserId runs for real. Mirrors the sitting-visits route test.

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
  new Request("http://localhost/api/providers/100/training-progress", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });

const allQueryText = () =>
  sql.mock.calls.map((c) => (c?.[0] ?? []).join(" ")).join(" | ");

const okBody = {
  session_id: 200,
  pet_id: 55,
  progress_note: "Sit mastered",
  status: "completed",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  requireProviderCapability.mockResolvedValue(true);
  assertCareAccess.mockResolvedValue({ id: 1 });
});

describe("POST /api/providers/[id]/training-progress (trainer logs progress)", () => {
  it("401 when unauthenticated", async () => {
    auth.mockResolvedValue(null);
    const res = await POST(postReq(okBody), PARAMS);
    expect(res.status).toBe(401);
  });

  it("403 when the provider lacks the 'trainer' capability (the gate)", async () => {
    auth.mockResolvedValue(SESSION);
    const { ProviderAuthError } = await vi.importActual(
      "@/app/api/utils/providerAuth",
    );
    requireProviderCapability.mockRejectedValue(
      new ProviderAuthError("Provider does not have the 'trainer' capability"),
    );
    sql.mockResolvedValueOnce([PROFILE_ROW]); // resolveUserId
    const res = await POST(postReq(okBody), PARAMS);
    expect(res.status).toBe(403);
    expect(allQueryText()).not.toContain("INSERT INTO training_progress");
  });

  it("400 when neither progress_id nor (session_id + pet_id) is given", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]); // resolveUserId
    const res = await POST(postReq({ progress_note: "no target" }), PARAMS);
    expect(res.status).toBe(400);
    expect(allQueryText()).not.toContain("INSERT INTO training_progress");
  });

  it("404 when the session does not belong to the provider", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // resolveUserId
      .mockResolvedValueOnce([]); // session lookup → none
    const res = await POST(postReq(okBody), PARAMS);
    expect(res.status).toBe(404);
    expect(allQueryText()).not.toContain("INSERT INTO training_progress");
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
      .mockResolvedValueOnce([{ id: 200 }]) // session lookup
      .mockResolvedValueOnce([{ id: 55, owner_user_id: 9 }]); // pet lookup
    const res = await POST(postReq(okBody), PARAMS);
    expect(res.status).toBe(403);
    expect(allQueryText()).not.toContain("INSERT INTO training_progress");
  });

  it("201 logs progress (owner derived from the pet, gated by capability + grant)", async () => {
    auth.mockResolvedValue(SESSION);
    const CREATED = { id: 1, status: "completed", owner_user_id: 9, pet_id: 55 };
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // resolveUserId
      .mockResolvedValueOnce([{ id: 200 }]) // session lookup
      .mockResolvedValueOnce([{ id: 55, owner_user_id: 9 }]) // pet lookup
      .mockResolvedValueOnce([CREATED]); // INSERT
    const res = await POST(postReq(okBody), PARAMS);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.progress).toEqual(CREATED);
    expect(allQueryText()).toContain("INSERT INTO training_progress");
    expect(assertCareAccess).toHaveBeenCalledWith(
      55,
      "100",
      "health_logs_write",
      expect.objectContaining({ staffUserId: 7, action: "write" }),
    );
  });

  it("updates an existing progress row by progress_id (resolves pet from the row)", async () => {
    auth.mockResolvedValue(SESSION);
    const UPDATED = { id: 33, progress_note: "Updated", pet_id: 55 };
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // resolveUserId
      .mockResolvedValueOnce([{ id: 33, pet_id: 55, provider_id: 100 }]) // existing row
      .mockResolvedValueOnce([UPDATED]); // UPDATE
    const res = await POST(
      postReq({ progress_id: 33, progress_note: "Updated", attended: true }),
      PARAMS,
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.progress).toEqual(UPDATED);
    expect(allQueryText()).toContain("UPDATE training_progress");
    expect(assertCareAccess).toHaveBeenCalledWith(
      55,
      "100",
      "health_logs_write",
      expect.objectContaining({ staffUserId: 7 }),
    );
  });
});
