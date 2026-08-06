import { describe, it, expect, vi, beforeEach } from "vitest";

// GET /api/places/[placeId] — detail from the PawPi-owned catalog (0075), replacing the Google
// detail proxy. `sql` is mocked at the module boundary; the route delegates to getPlaceById.

import { GET } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const PARAMS = { params: { placeId: "curated-soffice-pasteleria-san-isidro" } };
const req = () => new Request("http://localhost/api/places/curated-soffice-pasteleria-san-isidro");

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/places/[placeId]", () => {
  it("401 when unauthenticated (no query)", async () => {
    auth.mockResolvedValue(null);
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  it("404 when the place is absent/hidden/deleted", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([]); // no published, non-deleted row
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(404);
    const text = (sql.mock.calls.at(-1)?.[0] ?? []).join(" ");
    expect(text).toContain("FROM places");
    expect(text).toContain("status = 'published'");
  });

  it("200 with the place row", async () => {
    auth.mockResolvedValue(SESSION);
    const PLACE = { id: "curated-soffice-pasteleria-san-isidro", name: "Soffice Pastelería", category: "bakery" };
    sql.mockResolvedValueOnce([PLACE]);
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ place: PLACE });
    expect(sql.mock.calls.at(-1)?.slice(1)).toContain("curated-soffice-pasteleria-san-isidro");
  });

  it("500 when the query throws", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockRejectedValueOnce(new Error("boom"));
    expect((await GET(req(), PARAMS)).status).toBe(500);
  });
});
