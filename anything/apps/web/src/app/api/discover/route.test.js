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
    sql.mockResolvedValueOnce(PROFILES).mockResolvedValueOnce(MOMENTS);

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
});
