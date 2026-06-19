import { describe, it, expect, vi, beforeEach } from "vitest";

// GET /api/transport-trips — the OWNER's pet-taxi trips (ticket 2.52). RLS owner_select scopes the
// rows; an optional ?petId= narrows to one pet.

import { GET } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { resolveUserId } from "@/app/api/utils/currentUser";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/currentUser", () => ({ resolveUserId: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const req = (qs = "") => new Request(`http://localhost/api/transport-trips${qs}`);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  resolveUserId.mockResolvedValue(7);
});

describe("GET /api/transport-trips", () => {
  it("anonymous → 401", async () => {
    auth.mockResolvedValue(undefined);
    expect((await GET(req())).status).toBe(401);
  });

  it("no profile yet → 404", async () => {
    auth.mockResolvedValue(SESSION);
    resolveUserId.mockResolvedValueOnce(null);
    expect((await GET(req())).status).toBe(404);
  });

  it("owner-scoped list (no filter) → 200", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ id: 1, status: "requested" }]);
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect((await res.json()).trips).toHaveLength(1);
    const q = sql.mock.calls[0][0].join(" ");
    expect(q).toContain("t.owner_user_id =");
    expect(q).not.toContain("t.pet_id =");
  });

  it("?petId= narrows to one pet → 200", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([]);
    const res = await GET(req("?petId=5"));
    expect(res.status).toBe(200);
    const q = sql.mock.calls[0][0].join(" ");
    expect(q).toContain("t.owner_user_id =");
    expect(q).toContain("t.pet_id =");
  });

  it("DB failure → 500", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockRejectedValueOnce(new Error("boom"));
    expect((await GET(req())).status).toBe(500);
  });
});
