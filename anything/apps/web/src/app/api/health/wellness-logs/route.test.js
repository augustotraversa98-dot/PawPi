import { describe, it, expect, vi, beforeEach } from "vitest";

// POST /api/health/wellness-logs — night-run finding H1: the create handler previously trusted the
// client-supplied petId with no ownership check. It now routes through resolvePetLogOwner (the same
// owner-OR-family gate the food/walk/poo-log routes use), anchoring the write to the pet's owner.

import { POST, GET } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { resolvePetLogOwner } from "@/app/api/utils/petLogAccess";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/petLogAccess", () => ({ resolvePetLogOwner: vi.fn() }));

const SESSION = { user: { id: "auth-abc" }, expires: "9999999999" };
const post = (body) =>
  new Request("http://localhost/api/health/wellness-logs", {
    method: "POST",
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/health/wellness-logs — ownership gate", () => {
  it("anonymous → 401", async () => {
    auth.mockResolvedValue(undefined);
    expect((await POST(post({ petId: 5, checkType: "general" }))).status).toBe(401);
  });

  it("cross-pet write (not owner, not family) → 403, no INSERT runs", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ id: 7 }]); // user_profiles lookup only
    resolvePetLogOwner.mockResolvedValue({
      error: "Pet not found or access denied",
      status: 403,
    });
    const res = await POST(post({ petId: 999, checkType: "general" }));
    expect(res.status).toBe(403);
    expect(resolvePetLogOwner).toHaveBeenCalledWith(7, 999);
    expect(sql).toHaveBeenCalledTimes(1);
  });

  it("owner write → 200, anchored to the resolved owner id", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([{ id: 7 }]) // user_profiles lookup
      .mockResolvedValueOnce([{ id: 1, pet_id: 5, owner_user_id: 7 }]); // INSERT RETURNING
    resolvePetLogOwner.mockResolvedValue({ ownerUserId: 7, isOwner: true });
    const res = await POST(post({ petId: 5, checkType: "general" }));
    expect(res.status).toBe(200);
    expect(resolvePetLogOwner).toHaveBeenCalledWith(7, 5);
  });
});

describe("GET /api/health/wellness-logs — ?since bound (AUDIT A-30)", () => {
  const get = (qs) =>
    new Request(`http://localhost/api/health/wellness-logs?${qs}`);

  const allTemplates = () =>
    sql.mock.calls.map((c) => (c[0] ?? []).join(" ")).join(" || ");
  const allArgs = () =>
    JSON.stringify(sql.mock.calls.flatMap((c) => c.slice(1)));

  it("applies the since lower bound when provided", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValue([{ id: 7 }]); // profile + fragment + logs all return harmlessly
    await GET(get("petId=5&since=2026-08-01"));
    expect(allTemplates()).toContain("logged_at >=");
    expect(allArgs()).toContain("2026-08-01");
  });

  it("omits the bound when since is absent (no regression)", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValue([{ id: 7 }]);
    await GET(get("petId=5"));
    expect(allTemplates()).not.toContain("logged_at >=");
  });
});
