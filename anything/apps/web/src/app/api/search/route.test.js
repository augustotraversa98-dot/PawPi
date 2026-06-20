import { describe, it, expect, vi, beforeEach } from "vitest";

// GET /api/search?q= — real search across pets/owners/providers (ticket 2.25).
// Public fields only; providers are published-only. auth() + sql mocked.

import { GET } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const req = (q) =>
  new Request(`http://localhost/api/search${q != null ? `?q=${encodeURIComponent(q)}` : ""}`);
const allText = () =>
  sql.mock.calls.map((c) => (c?.[0] ?? []).join(" ")).join(" | ");

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/search", () => {
  it("401 when unauthenticated, no query", async () => {
    auth.mockResolvedValue(null);
    const res = await GET(req("rex"));
    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  it("a too-short query returns empty arrays without querying", async () => {
    auth.mockResolvedValue(SESSION);
    const res = await GET(req("a"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ pets: [], owners: [], providers: [] });
    expect(sql).not.toHaveBeenCalled();
  });

  it("returns pets/owners/providers and only public fields", async () => {
    auth.mockResolvedValue(SESSION);
    const PETS = [{ id: 1, name: "Rex", handle: "rex", avatar_url: null }];
    const OWNERS = [{ id: 7, username: "jane", full_name: "Jane" }];
    const PROVIDERS = [{ id: 9, slug: "happy", name: "Happy Paws" }];
    sql
      .mockResolvedValueOnce(PETS)
      .mockResolvedValueOnce(OWNERS)
      .mockResolvedValueOnce(PROVIDERS);

    const res = await GET(req("ha"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      pets: PETS,
      owners: OWNERS,
      providers: PROVIDERS,
    });

    const text = allText();
    // ILIKE matching on the intended columns.
    expect(text).toContain("ILIKE");
    expect(text).toContain("FROM pets");
    expect(text).toContain("FROM user_profiles");
    expect(text).toContain("FROM providers");
    // Providers are published-only.
    expect(text).toContain("status = 'published'");
    // Moderation (T3): blocked/banned authors filtered out of pets + owners results.
    expect(text).toContain("app_user_is_blocked");
    expect(text).toContain("banned_at");
    // No private/medical leakage: the pets PROJECTION (before FROM) excludes owner_user_id
    // (it now appears only in the moderation WHERE clause); no medical/auth columns anywhere.
    const petsSelect = (sql.mock.calls[0]?.[0] ?? []).join(" ").split("FROM pets")[0];
    expect(petsSelect).not.toContain("owner_user_id");
    expect(text).not.toContain("auth_user");
    expect(text).not.toContain("health_");
    expect(text).not.toContain("care_access");
  });
});
