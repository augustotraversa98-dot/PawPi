import { describe, it, expect, vi, beforeEach } from "vitest";

// GET /api/places — PawPi-owned places directory (0075). Auth-gated read of the places table with
// optional q (ILIKE) / category / neighborhood filters and lat/lng distance sort. `sql` is mocked at
// the module boundary so the real query builder + JS distance sort run against canned rows.

import { GET } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const url = (q = "") => new Request(`http://localhost/api/places?${q}`);
const lastQueryText = () => (sql.mock.calls.at(-1)?.[0] ?? []).join(" ");
const lastValues = () => sql.mock.calls.at(-1)?.slice(1) ?? [];

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/places", () => {
  it("401 when unauthenticated", async () => {
    auth.mockResolvedValue(null);
    const res = await GET(url("q=cafe"));
    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  it("reads published places and passes q / category / neighborhood filters", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ id: "curated-x", name: "Cafe X", category: "cafe" }]);
    const res = await GET(url("q=caf&category=cafe&neighborhood=San%20Isidro"));
    expect(res.status).toBe(200);
    expect((await res.json()).places).toHaveLength(1);
    const text = lastQueryText();
    expect(text).toContain("FROM places");
    expect(text).toContain("status = 'published'");
    expect(text).toContain("deleted_at IS NULL");
    expect(text).toContain("ILIKE");
    expect(text).toContain("category =");
    expect(text).toContain("neighborhood =");
    const values = lastValues();
    expect(values).toContain("%caf%");
    expect(values).toContain("cafe");
    expect(values).toContain("San Isidro");
  });

  it("with lat/lng: attaches distance_km and sorts nearest-first", async () => {
    auth.mockResolvedValue(SESSION);
    // Two rows; the SECOND is closer to the query point, so it must sort first.
    sql.mockResolvedValueOnce([
      { id: "far", name: "Far", lat: -34.60, lng: -58.45 },
      { id: "near", name: "Near", lat: -34.51, lng: -58.51 },
    ]);
    const res = await GET(url("lat=-34.51&lng=-58.51"));
    const { places } = await res.json();
    expect(places.map((p) => p.id)).toEqual(["near", "far"]);
    expect(places[0].distance_km).toBeCloseTo(0, 5);
    expect(places[1].distance_km).toBeGreaterThan(0);
  });

  it("coord-less rows sort last when geo is active", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([
      { id: "no-coords", name: "NoCoords", lat: null, lng: null },
      { id: "here", name: "Here", lat: -34.51, lng: -58.51 },
    ]);
    const { places } = await (await GET(url("lat=-34.51&lng=-58.51"))).json();
    expect(places.map((p) => p.id)).toEqual(["here", "no-coords"]);
    expect(places.at(-1).distance_km).toBeNull();
  });
});
