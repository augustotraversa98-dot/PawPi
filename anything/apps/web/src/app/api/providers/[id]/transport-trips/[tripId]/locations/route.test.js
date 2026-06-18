import { describe, it, expect, vi, beforeEach } from "vitest";

// POST /api/providers/[id]/transport-trips/[tripId]/locations — the assigned driver posts a live
// GPS ping while the trip is en_route (ticket 2.70). Allowed ONLY for the assigned active driver,
// ONLY while en_route; everything else 400/403/404/409.

import { POST } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { requireProviderCapability } from "@/app/api/utils/providerAuth";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/currentUser", () => ({ resolveUserId: vi.fn() }));
vi.mock("@/app/api/utils/providerAuth", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, requireProviderCapability: vi.fn() };
});

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const PARAMS = { params: { id: "100", tripId: "7" } };
const post = (body) =>
  new Request("http://localhost/api/providers/100/transport-trips/7/locations", {
    method: "POST",
    body: JSON.stringify(body),
  });
const ping = { lat: 40.7, lng: -74 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  resolveUserId.mockResolvedValue(7);
  requireProviderCapability.mockResolvedValue(undefined);
});

describe("POST transport-trips/[tripId]/locations", () => {
  it("anonymous → 401", async () => {
    auth.mockResolvedValue(undefined);
    const res = await POST(post(ping), PARAMS);
    expect(res.status).toBe(401);
  });

  it("invalid coordinates → 400", async () => {
    auth.mockResolvedValue(SESSION);
    const res = await POST(post({ lat: 999, lng: 0 }), PARAMS);
    expect(res.status).toBe(400);
  });

  it("trip not found / not authorized → 404", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([]); // trip load
    const res = await POST(post(ping), PARAMS);
    expect(res.status).toBe(404);
  });

  it("trip not en_route → 409", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ id: 7, status: "confirmed", assigned_staff_id: 9 }]);
    const res = await POST(post(ping), PARAMS);
    expect(res.status).toBe(409);
  });

  it("caller is not the assigned driver → 403", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([{ id: 7, status: "en_route", assigned_staff_id: 9 }])
      .mockResolvedValueOnce([{ id: 8 }]); // caller's staff id ≠ 9
    const res = await POST(post(ping), PARAMS);
    expect(res.status).toBe(403);
  });

  it("caller has no active staff row → 403", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([{ id: 7, status: "en_route", assigned_staff_id: 9 }])
      .mockResolvedValueOnce([]); // not staff
    const res = await POST(post(ping), PARAMS);
    expect(res.status).toBe(403);
  });

  it("assigned driver while en_route → 201 inserts the ping", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([{ id: 7, status: "en_route", assigned_staff_id: 9 }])
      .mockResolvedValueOnce([{ id: 9 }]) // caller is staff 9 = assigned
      .mockResolvedValueOnce([
        { id: 1, trip_id: 7, lat: 40.7, lng: -74, recorded_at: "2026-06-19" },
      ]);
    const res = await POST(post(ping), PARAMS);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.location).toMatchObject({ trip_id: 7, lat: 40.7, lng: -74 });
    // the INSERT carries posted_by_staff_id = the caller's staff id
    expect(sql.mock.calls[2][0].join(" ")).toContain(
      "INSERT INTO transport_trip_locations",
    );
  });
});
