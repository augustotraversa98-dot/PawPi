import { describe, it, expect, vi, beforeEach } from "vitest";

// GET /api/places/search — the LEGACY nearby path, now served from the PawPi-owned places table
// (0075) instead of Google. `sql` is mocked at the module boundary. Keeps the mobile contract:
// requires lat/lng, returns { configured: true, places } with a place_id alias + distance sort.

import { GET } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const url = (q) => new Request(`http://localhost/api/places/search?${q}`);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/places/search", () => {
  it("anonymous → 401", async () => {
    auth.mockResolvedValue(undefined);
    expect((await GET(url("lat=1&lng=2"))).status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  it("missing coordinates → 400 (no query)", async () => {
    auth.mockResolvedValue(SESSION);
    const res = await GET(url("category=park"));
    expect(res.status).toBe(400);
    expect(sql).not.toHaveBeenCalled();
  });

  it("returns table places with configured:true, a place_id alias and nearest-first sort", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([
      { id: "far", name: "Far", category: "park", lat: -34.60, lng: -58.45 },
      { id: "near", name: "Near", category: "park", lat: -34.51, lng: -58.51 },
    ]);
    const res = await GET(url("lat=-34.51&lng=-58.51&category=park"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.configured).toBe(true);
    expect(body.category).toBe("park");
    expect(body.places.map((p) => p.id)).toEqual(["near", "far"]); // distance sorted
    expect(body.places[0].place_id).toBe("near"); // alias for the saved-places flow
    // category filter is bound
    expect(sql.mock.calls.at(-1)?.slice(1)).toContain("park");
  });
});
