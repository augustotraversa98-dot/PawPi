import { describe, it, expect, vi, beforeEach } from "vitest";

// GET /api/adoption/listings (ticket 2.86) — owner-facing browse. Unit-level: auth gate; nearest-first
// sort when lat/lng given; featured/recent order otherwise. (The RLS-joined visibility + bounding-box
// filtering are proven in the integration test.)

import { GET } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: "9999" };
const req = (qs = "") => new Request(`http://localhost/api/adoption/listings${qs}`);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  auth.mockResolvedValue(SESSION);
});

describe("GET /api/adoption/listings", () => {
  it("401 when unauthenticated", async () => {
    auth.mockResolvedValue(null);
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it("no geo → returns rows in the query's featured/recent order", async () => {
    sql.mockResolvedValueOnce([{ id: 7 }]); // resolveUserId → the viewer's profile id
    sql.mockResolvedValueOnce([
      { id: 1, name: "Rex", is_featured: true, provider_lat: null, provider_lng: null },
      { id: 2, name: "Bella", is_featured: false, provider_lat: null, provider_lng: null },
    ]);
    const res = await GET(req());
    const data = await res.json();
    expect(data.sort).toBe("featured_recent");
    expect(data.listings.map((l) => l.id)).toEqual([1, 2]);
  });

  it("with lat/lng → sorts nearest-first by provider location", async () => {
    // NYC viewer. Bella (near, ~1km) should come before Rex (far, ~110km) regardless of input order.
    sql.mockResolvedValueOnce([{ id: 7 }]); // resolveUserId → the viewer's profile id
    sql.mockResolvedValueOnce([
      { id: 1, name: "Rex", is_featured: true, provider_lat: 41.7128, provider_lng: -74.006 },
      { id: 2, name: "Bella", is_featured: false, provider_lat: 40.72, provider_lng: -74.006 },
    ]);
    const res = await GET(req("?lat=40.7128&lng=-74.006"));
    const data = await res.json();
    expect(data.sort).toBe("nearest");
    expect(data.listings.map((l) => l.id)).toEqual([2, 1]);
    expect(data.listings[0].distance_km).toBeLessThan(data.listings[1].distance_km);
  });
});
