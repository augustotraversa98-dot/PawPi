import { describe, it, expect, vi, beforeEach } from "vitest";

// GET /api/places/search — auth-gated proxy (ticket 2.73). Returns the degrade-clean signal from the
// places util untouched (configured:false) and never ships the key.

import { GET } from "./route";
import { auth } from "@/auth";
import { searchPlaces } from "@/app/api/utils/places";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/places", () => ({ searchPlaces: vi.fn() }));

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
  });

  it("missing coordinates → 400", async () => {
    auth.mockResolvedValue(SESSION);
    expect((await GET(url("category=park"))).status).toBe(400);
  });

  it("passes through the not-configured signal (200, no crash)", async () => {
    auth.mockResolvedValue(SESSION);
    searchPlaces.mockResolvedValue({ configured: false, places: [] });
    const res = await GET(url("lat=40.7&lng=-74&category=park"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ configured: false, places: [] });
  });

  it("returns normalized places when configured", async () => {
    auth.mockResolvedValue(SESSION);
    searchPlaces.mockResolvedValue({
      configured: true,
      places: [{ place_id: "p1", name: "Dog Park", category: "park" }],
    });
    const res = await GET(url("lat=40.7&lng=-74&category=park"));
    expect(res.status).toBe(200);
    expect((await res.json()).places).toHaveLength(1);
  });
});
