import { describe, it, expect, vi, beforeEach } from "vitest";

// GET /api/places/[placeId] — full detail for one place (ticket 2.73). Auth-gated; key-gated
// server-side via placeDetails(). Unconfigured → { configured: false, place: null } at HTTP 200.

import { GET } from "./route";
import { auth } from "@/auth";
import { placeDetails } from "@/app/api/utils/places";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/places", () => ({ placeDetails: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const PARAMS = { params: { placeId: "abc123" } };
const req = () => new Request("http://localhost/api/places/abc123");

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/places/[placeId]", () => {
  it("anonymous → 401 (never hits Google)", async () => {
    auth.mockResolvedValue(undefined);
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(401);
    expect(placeDetails).not.toHaveBeenCalled();
  });

  it("key unset → degrades clean { configured:false, place:null } at 200", async () => {
    auth.mockResolvedValue(SESSION);
    placeDetails.mockResolvedValueOnce({ configured: false, place: null });
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ configured: false, place: null });
  });

  it("configured → 200 with the place detail", async () => {
    auth.mockResolvedValue(SESSION);
    placeDetails.mockResolvedValueOnce({
      configured: true,
      place: { place_id: "abc123", name: "Dog Park", website: "x" },
    });
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(200);
    expect((await res.json()).place).toMatchObject({ place_id: "abc123" });
    expect(placeDetails).toHaveBeenCalledWith("abc123");
  });

  it("placeDetails throws → 500", async () => {
    auth.mockResolvedValue(SESSION);
    placeDetails.mockRejectedValueOnce(new Error("boom"));
    expect((await GET(req(), PARAMS)).status).toBe(500);
  });
});
