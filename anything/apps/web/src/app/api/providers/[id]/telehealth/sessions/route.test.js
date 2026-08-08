import { describe, it, expect, vi, beforeEach } from "vitest";

// POST /api/providers/[id]/telehealth/sessions — the assigned vet creates/ensures the consult
// session (ticket 2.18). Gates: requireProviderCapability('telehealth') → booking belongs to
// the provider → RLS INSERT. requireProviderCapability is mocked; auth + sql mocked at the
// boundary; resolveUserId runs for real, so sql call 1 is the profile lookup.

import { POST } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { requireProviderCapability } from "@/app/api/utils/providerAuth";

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

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const PARAMS = { params: { id: "100" } };
const req = (body) =>
  new Request("http://localhost/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  auth.mockResolvedValue(SESSION);
  requireProviderCapability.mockResolvedValue(undefined);
  sql.mockResolvedValueOnce([{ id: 7 }]); // resolveUserId profile lookup
});

describe("POST telehealth/sessions", () => {
  it("a provider WITHOUT the telehealth capability → 403", async () => {
    // Use the mocked ProviderAuthError class so the route's `instanceof` check matches.
    const { ProviderAuthError } = await import("@/app/api/utils/providerAuth");
    requireProviderCapability.mockRejectedValue(
      new ProviderAuthError("Provider does not have the 'telehealth' capability"),
    );
    const res = await POST(req({ booking_id: 5 }), PARAMS);
    expect(res.status).toBe(403);
  });

  it("missing booking_id → 400", async () => {
    const res = await POST(req({}), PARAMS);
    expect(res.status).toBe(400);
  });

  it("a booking that isn't this provider's telehealth booking → 400", async () => {
    sql.mockResolvedValueOnce([]); // booking lookup → none
    const res = await POST(req({ booking_id: 5 }), PARAMS);
    expect(res.status).toBe(400);
  });

  it("falls back to a self-assigned INSERT (201) when no session exists yet", async () => {
    sql.mockResolvedValueOnce([{ id: 5, pet_id: 55 }]); // booking lookup
    sql.mockResolvedValueOnce([{ owner_user_id: 3 }]); // pet owner
    sql.mockResolvedValueOnce([{ id: null, staff_user_id: null }]); // claim → NULL composite (no session)
    sql.mockResolvedValueOnce([
      { id: 1, booking_id: 5, pet_id: 55, owner_user_id: 3, provider_id: 100, staff_user_id: 7, status: "scheduled" },
    ]); // fallback INSERT

    const res = await POST(req({ booking_id: 5 }), PARAMS);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.session).toMatchObject({ id: 1, staff_user_id: 7, status: "scheduled" });

    const claim = sql.mock.calls[3];
    expect(claim[0].join(" ")).toContain("app_claim_telehealth_session");
    const insert = sql.mock.calls[4];
    expect(insert[0].join(" ")).toContain("INSERT INTO telehealth_sessions");
    expect(insert).toEqual(expect.arrayContaining([5, 55, 3, "100", 7]));
  });

  it("CLAIM: returns the session assigned to me (200) without inserting a duplicate", async () => {
    // The definer claimed the unassigned booking-time session for me (staff_user_id = my id 7),
    // OR it was already mine (solo / re-join) — either way it comes back assigned to me.
    sql.mockResolvedValueOnce([{ id: 5, pet_id: 55 }]); // booking lookup
    sql.mockResolvedValueOnce([{ owner_user_id: 3 }]); // pet owner
    sql.mockResolvedValueOnce([
      { id: 9, booking_id: 5, staff_user_id: 7, status: "scheduled" },
    ]); // claim → mine

    const res = await POST(req({ booking_id: 5 }), PARAMS);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.session.id).toBe(9);
    // No INSERT ran — only profile + booking + pet + claim (4 calls).
    expect(sql).toHaveBeenCalledTimes(4);
  });

  it("409 when another vet already holds the consult", async () => {
    sql.mockResolvedValueOnce([{ id: 5, pet_id: 55 }]); // booking lookup
    sql.mockResolvedValueOnce([{ owner_user_id: 3 }]); // pet owner
    sql.mockResolvedValueOnce([
      { id: 9, booking_id: 5, staff_user_id: 8, status: "scheduled" },
    ]); // claim → assigned to a DIFFERENT vet (8 ≠ me 7)

    const res = await POST(req({ booking_id: 5 }), PARAMS);
    expect(res.status).toBe(409);
    // No INSERT ran — the loser never falls back.
    expect(sql).toHaveBeenCalledTimes(4);
  });
});
