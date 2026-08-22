import { describe, it, expect, vi, beforeEach } from "vitest";

// DELETE /api/health/weight-logs?id= — owner removes their own weight entry (ticket 2.78; completes
// the previously no-op delete button). Owner-scoped; a non-owner deletes ZERO → 404.

import { DELETE, POST } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { resolvePetLogOwner } from "@/app/api/utils/petLogAccess";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/petLogAccess", () => ({ resolvePetLogOwner: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const req = (qs) => new Request(`http://localhost/api/health/weight-logs?${qs}`, { method: "DELETE" });
const post = (body) =>
  new Request("http://localhost/api/health/weight-logs", {
    method: "POST",
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("DELETE /api/health/weight-logs", () => {
  it("anonymous → 401", async () => {
    auth.mockResolvedValue(undefined);
    expect((await DELETE(req("id=5"))).status).toBe(401);
  });

  it("missing id → 400", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ id: 7 }]); // profile
    expect((await DELETE(req(""))).status).toBe(400);
  });

  it("not the owner's entry → 404", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([{ id: 7 }]) // profile
      .mockResolvedValueOnce([]); // delete returns nothing
    expect((await DELETE(req("id=5"))).status).toBe(404);
  });

  it("owner's entry → 200 owner-scoped delete", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([{ id: 7 }]) // profile
      .mockResolvedValueOnce([{ id: 5 }]); // deleted
    const res = await DELETE(req("id=5"));
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    expect(sql.mock.calls[1][0].join(" ")).toContain("DELETE FROM health_weight_logs");
    expect(sql.mock.calls[1][0].join(" ")).toContain("owner_user_id =");
  });
});

// POST ownership gate — night-run finding H1: the create handler previously trusted the
// client-supplied petId with no ownership check. It now routes through resolvePetLogOwner
// (the same owner-OR-family gate the food/walk/poo-log routes use).
describe("POST /api/health/weight-logs — ownership gate", () => {
  it("anonymous → 401", async () => {
    auth.mockResolvedValue(undefined);
    expect((await POST(post({ petId: 5, weight: 12.3 }))).status).toBe(401);
  });

  it("cross-pet write (not owner, not family) → 403, no INSERT runs", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ id: 7 }]); // user_profiles lookup only
    resolvePetLogOwner.mockResolvedValue({
      error: "Pet not found or access denied",
      status: 403,
    });
    const res = await POST(post({ petId: 999, weight: 12.3 }));
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
    const res = await POST(post({ petId: 5, weight: 12.3 }));
    expect(res.status).toBe(201);
    expect(resolvePetLogOwner).toHaveBeenCalledWith(7, 5);
  });
});
