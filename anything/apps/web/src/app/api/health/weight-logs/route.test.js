import { describe, it, expect, vi, beforeEach } from "vitest";

// DELETE /api/health/weight-logs?id= — owner removes their own weight entry (ticket 2.78; completes
// the previously no-op delete button). Owner-scoped; a non-owner deletes ZERO → 404.

import { DELETE } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const req = (qs) => new Request(`http://localhost/api/health/weight-logs?${qs}`, { method: "DELETE" });

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
