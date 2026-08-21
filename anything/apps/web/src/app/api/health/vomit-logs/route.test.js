import { describe, it, expect, vi, beforeEach } from "vitest";

// POST /api/health/vomit-logs — night-run finding H1: the create handler previously trusted the
// client-supplied petId with no ownership check. It now routes through resolvePetLogOwner (the same
// owner-OR-family gate the food/walk/poo-log routes use), anchoring the write to the pet's owner.

import { POST } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { resolvePetLogOwner } from "@/app/api/utils/petLogAccess";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/petLogAccess", () => ({ resolvePetLogOwner: vi.fn() }));

const SESSION = { user: { id: "auth-abc" }, expires: "9999999999" };
const post = (body) =>
  new Request("http://localhost/api/health/vomit-logs", {
    method: "POST",
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/health/vomit-logs — ownership gate", () => {
  it("anonymous → 401", async () => {
    auth.mockResolvedValue(undefined);
    expect((await POST(post({ petId: 5 }))).status).toBe(401);
  });

  it("cross-pet write (not owner, not family) → 403, no INSERT runs", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ id: 7 }]); // user_profiles lookup only
    resolvePetLogOwner.mockResolvedValue({
      error: "Pet not found or access denied",
      status: 403,
    });
    const res = await POST(post({ petId: 999, appearance: "foamy" }));
    expect(res.status).toBe(403);
    expect(resolvePetLogOwner).toHaveBeenCalledWith(7, 999);
    expect(sql).toHaveBeenCalledTimes(1);
  });

  it("owner write → 201, anchored to the resolved owner id", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([{ id: 7 }]) // user_profiles lookup
      .mockResolvedValueOnce([{ id: 1, pet_id: 5, owner_user_id: 7 }]); // INSERT RETURNING
    resolvePetLogOwner.mockResolvedValue({ ownerUserId: 7, isOwner: true });
    const res = await POST(post({ petId: 5, appearance: "foamy" }));
    expect(res.status).toBe(201);
    expect(resolvePetLogOwner).toHaveBeenCalledWith(7, 5);
  });
});
