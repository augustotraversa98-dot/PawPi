import { describe, it, expect, vi, beforeEach } from "vitest";

// /api/posts/owner-posted-today — the Feed's lock. It shares its query with the
// pet-profile / history gates via utils/dailyMomentsGate.js, so this pins that the
// Feed-facing contract is unchanged by that extraction.

import { GET } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/requestContext", () => ({ withRequestContext: (fn) => fn }));

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const req = () => new Request("http://localhost/api/posts/owner-posted-today");

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/posts/owner-posted-today", () => {
  it("401 unauthenticated, no DB access", async () => {
    auth.mockResolvedValue(null);
    expect((await GET(req())).status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  it("404 when the caller has no user_profiles row", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([]);
    expect((await GET(req())).status).toBe(404);
  });

  it("true when any owned pet posted today; scoped on user_profiles.id + owner-local day", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([{ id: 7, local_today: "2026-06-10" }])
      .mockResolvedValueOnce([{ "?column?": 1 }]);
    const body = await (await GET(req())).json();
    expect(body).toEqual({ hasPostedToday: true, todayDate: "2026-06-10" });
    expect(sql.mock.calls[0].slice(1)).toEqual([42]); // auth id → profile
    expect(sql.mock.calls[1].slice(1)).toEqual([7, "2026-06-10"]); // profile id, never the auth id
  });

  it("false when nothing posted today", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([{ id: 7, local_today: "2026-06-10" }])
      .mockResolvedValueOnce([]);
    expect((await (await GET(req())).json()).hasPostedToday).toBe(false);
  });
});
