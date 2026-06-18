import { describe, it, expect, vi, beforeEach } from "vitest";

// PATCH /api/providers/[id]/transport-trips/[tripId] (ticket 2.52) — provider staff confirm /
// assign / advance / fare. RLS scopes the UPDATE to active staff (mocked sql here asserts plumbing).

import { PATCH } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { requireProviderCapability } from "@/app/api/utils/providerAuth";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/providerAuth", () => {
  class ProviderAuthError extends Error {
    constructor(m) {
      super(m);
      this.status = 403;
    }
  }
  return { requireProviderCapability: vi.fn(), ProviderAuthError };
});

const SESSION = { user: { id: 42 } };
const PARAMS = { params: { id: "100", tripId: "1" } };
const PROFILE = [{ id: 7 }];
const patch = (body) =>
  new Request("http://localhost/api/providers/100/transport-trips/1", {
    method: "PATCH",
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  requireProviderCapability.mockResolvedValue(undefined);
});

it("rejects an invalid status", async () => {
  auth.mockResolvedValue(SESSION);
  sql.mockResolvedValueOnce(PROFILE);
  expect((await PATCH(patch({ status: "teleported" }), PARAMS)).status).toBe(400);
});

it("rejects an assigned_staff_id that is not active staff of the provider", async () => {
  auth.mockResolvedValue(SESSION);
  sql.mockResolvedValueOnce(PROFILE).mockResolvedValueOnce([]); // staff check empty
  const res = await PATCH(patch({ assigned_staff_id: 99 }), PARAMS);
  expect(res.status).toBe(400);
});

it("confirms + advances status and mirrors the booking", async () => {
  auth.mockResolvedValue(SESSION);
  sql
    .mockResolvedValueOnce(PROFILE) // resolveUserId
    .mockResolvedValueOnce([{ id: 1, status: "confirmed", booking_id: 900 }]) // trip update
    .mockResolvedValueOnce([{ id: 900 }]); // booking mirror update
  const res = await PATCH(patch({ status: "confirmed" }), PARAMS);
  expect(res.status).toBe(200);
  const allText = sql.mock.calls.map((c) => c[0].join(" ")).join(" | ");
  expect(allText).toContain("UPDATE transport_trips");
  expect(allText).toContain("UPDATE vet_appointments"); // booking kept in step
});

it("404 when the UPDATE matches no row (non-staff caller)", async () => {
  auth.mockResolvedValue(SESSION);
  sql.mockResolvedValueOnce(PROFILE).mockResolvedValueOnce([]); // RLS → zero rows
  const res = await PATCH(patch({ status: "confirmed" }), PARAMS);
  expect(res.status).toBe(404);
});
