import { describe, it, expect, vi, beforeEach } from "vitest";

// GET /api/discover — real popular profiles + recent moments (ticket 2.25).
// Public fields only; ranked by real signals. auth() + sql mocked.

import { GET } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const req = (qs = "") => new Request(`http://localhost/api/discover${qs}`);
const allText = () =>
  sql.mock.calls.map((c) => (c?.[0] ?? []).join(" ")).join(" | ");

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/discover", () => {
  it("401 when unauthenticated", async () => {
    auth.mockResolvedValue(null);
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  it("returns profiles + moments ranked by real signals, public fields only", async () => {
    auth.mockResolvedValue(SESSION);
    const PROFILES = [{ id: 1, name: "Rex", followers: 5, paws: 10 }];
    const MOMENTS = [{ id: 3, pet_id: 1, image_url: "x", caption: "hi" }];
    sql
      .mockResolvedValueOnce(PROFILES)
      .mockResolvedValueOnce(MOMENTS)
      .mockResolvedValueOnce([{ id: 42, local_today: "2026-08-12" }]) // daily gate — profile
      .mockResolvedValueOnce([{ "?column?": 1 }]); // daily gate — posted today

    const res = await GET(req("?limit=12"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ profiles: PROFILES, moments: MOMENTS });

    const text = allText();
    // Profiles ranked by a real signal (followers/paws), from pet_follows/post_paws.
    expect(text).toContain("pet_follows");
    expect(text).toContain("post_paws");
    expect(text).toContain("ORDER BY followers DESC");
    // Moments come from real posts.
    expect(text).toContain("FROM posts");
    // No medical leakage (owner_user_id is only a JOIN key, never projected).
    expect(text).not.toContain("health_");
    expect(text).not.toContain("care_access");
    expect(text).not.toContain("weight");
  });

  it("redacts other owners' moments until the viewer has posted today; own moments stay", async () => {
    auth.mockResolvedValue(SESSION);
    const MOMENTS = [
      { id: 3, pet_id: 1, user_id: 7, image_url: "https://cdn/other.jpg", caption: "secret", pet_name: "Rex" },
      { id: 4, pet_id: 2, user_id: 42, image_url: "https://cdn/mine.jpg", caption: "mine", pet_name: "Mango" },
    ];
    sql
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(MOMENTS)
      .mockResolvedValueOnce([{ id: 42, local_today: "2026-08-12" }])
      .mockResolvedValueOnce([]); // nothing posted today

    const { moments } = await (await GET(req())).json();
    expect(moments[0]).toMatchObject({ id: 3, pet_name: "Rex", locked: true, image_url: null, caption: null });
    expect(JSON.stringify(moments[0])).not.toContain("other.jpg");
    expect(moments[1]).toMatchObject({ id: 4, image_url: "https://cdn/mine.jpg", caption: "mine" });
    expect(moments[1].locked).toBeUndefined();
  });
});
