import { describe, it, expect, vi, beforeEach } from "vitest";

// GET /api/transport-trips/[tripId]/track — owner/staff live track (ticket 2.70). RLS scopes the
// trip + pings; a caller who can't see the trip gets 404 and never a ping.

import { GET } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { resolveUserId } from "@/app/api/utils/currentUser";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/currentUser", () => ({ resolveUserId: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const PARAMS = { params: { tripId: "7" } };
const req = () => new Request("http://localhost/api/transport-trips/7/track");

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  resolveUserId.mockResolvedValue(7);
});

describe("GET transport-trips/[tripId]/track", () => {
  it("anonymous → 401", async () => {
    auth.mockResolvedValue(undefined);
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(401);
  });

  it("trip not visible (RLS zero) → 404", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([]); // trip read returns nothing
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(404);
  });

  it("owner/staff → 200 with trip + ordered pings", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([
        {
          id: 7,
          status: "en_route",
          provider_id: 100,
          pet_id: 5,
          pickup_lat: 40.7,
          pickup_lng: -74,
          pickup_address: "Home",
          dropoff_lat: 40.8,
          dropoff_lng: -73.9,
          dropoff_address: "Vet",
        },
      ])
      .mockResolvedValueOnce([
        { id: 1, lat: 40.7, lng: -74, recorded_at: "2026-06-19T10:00:00Z" },
        { id: 2, lat: 40.75, lng: -73.95, recorded_at: "2026-06-19T10:01:00Z" },
      ]);
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.trip).toMatchObject({ id: 7, status: "en_route" });
    expect(body.locations).toHaveLength(2);
    expect(sql.mock.calls[1][0].join(" ")).toContain(
      "FROM transport_trip_locations",
    );
  });
});
