import { describe, it, expect, vi, beforeEach } from "vitest";

// /api/providers/[id]/transport-trips (ticket 2.52). POST = owner books (capability gate → pet
// ownership → booking + trip). GET = provider-staff inbox (RLS scopes rows). auth + sql +
// requireProviderCapability mocked; resolveUserId runs real (sql call 1 = profile lookup).

import { POST, GET } from "./route";
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

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const PARAMS = { params: { id: "100" } };
const PROFILE = [{ id: 7 }];
const post = (body) =>
  new Request("http://localhost/api/providers/100/transport-trips", {
    method: "POST",
    body: JSON.stringify(body),
  });
const goodBody = {
  petId: 5,
  scheduled_at: "2026-08-01T09:00:00.000Z",
  pickup_address: "Home",
  dropoff_address: "Vet",
  trip_type: "round_trip",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  requireProviderCapability.mockResolvedValue(undefined);
});

describe("POST transport-trips (owner books)", () => {
  it("401 when unauthenticated", async () => {
    auth.mockResolvedValue(null);
    expect((await POST(post(goodBody), PARAMS)).status).toBe(401);
  });

  it("a non-transport provider → 403 from the capability gate", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce(PROFILE);
    const { ProviderAuthError } = await import("@/app/api/utils/providerAuth");
    requireProviderCapability.mockRejectedValue(new ProviderAuthError("no transport"));
    const res = await POST(post(goodBody), PARAMS);
    expect(res.status).toBe(403);
    expect(requireProviderCapability).toHaveBeenCalledWith("100", "transport");
  });

  it("403 when the caller does not own the pet", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce(PROFILE).mockResolvedValueOnce([]); // pet not owned
    expect((await POST(post(goodBody), PARAMS)).status).toBe(403);
  });

  it("400 when pickup/dropoff are missing", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce(PROFILE);
    const res = await POST(post({ petId: 5, scheduled_at: "2026-08-01T09:00:00Z" }), PARAMS);
    expect(res.status).toBe(400);
  });

  it("creates the booking + the trip (201) with capability transport", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce(PROFILE) // resolveUserId
      .mockResolvedValueOnce([{ id: 5 }]) // pet owned
      .mockResolvedValueOnce([{ id: 100, name: "Taxi", status: "published" }]) // provider
      .mockResolvedValueOnce([{ id: 900 }]) // booking insert
      .mockResolvedValueOnce([{ id: 1, status: "requested", booking_id: 900 }]); // trip insert
    const res = await POST(post(goodBody), PARAMS);
    expect(res.status).toBe(201);
    expect((await res.json()).trip.status).toBe("requested");
    const allText = sql.mock.calls.map((c) => c[0].join(" ")).join(" | ");
    expect(allText).toContain("INSERT INTO vet_appointments");
    expect(allText).toContain("'transport'");
    expect(allText).toContain("INSERT INTO transport_trips");
  });
});

describe("GET transport-trips (provider inbox)", () => {
  it("lists the provider's trips (RLS scopes to staff)", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce(PROFILE).mockResolvedValueOnce([{ id: 1, status: "requested" }]);
    const res = await GET(new Request("http://localhost/api/providers/100/transport-trips"), PARAMS);
    expect(res.status).toBe(200);
    expect((await res.json()).trips).toHaveLength(1);
  });
});
