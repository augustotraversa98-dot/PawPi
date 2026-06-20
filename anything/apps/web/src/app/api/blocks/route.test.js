import { describe, it, expect, vi, beforeEach } from "vitest";

// /api/blocks — user→user blocking (Guideline 1.2, T2).

import { GET, POST } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { resolveUserId } from "@/app/api/utils/currentUser";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/currentUser", () => ({ resolveUserId: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const post = (body) =>
  new Request("http://localhost/api/blocks", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  resolveUserId.mockResolvedValue(7);
});

describe("POST /api/blocks", () => {
  it("anonymous → 401", async () => {
    auth.mockResolvedValue(undefined);
    expect((await POST(post({ blocked_user_id: 9 }))).status).toBe(401);
  });

  it("invalid blocked_user_id → 400", async () => {
    auth.mockResolvedValue(SESSION);
    expect((await POST(post({ blocked_user_id: 0 }))).status).toBe(400);
  });

  it("blocking yourself → 400", async () => {
    auth.mockResolvedValue(SESSION);
    expect((await POST(post({ blocked_user_id: 7 }))).status).toBe(400);
  });

  it("new block → 201 (blocker = caller)", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([]); // no live block
    sql.mockResolvedValueOnce([{ id: 1, blocker_user_id: 7, blocked_user_id: 9 }]);
    const res = await POST(post({ blocked_user_id: 9 }));
    expect(res.status).toBe(201);
    expect((await res.json()).block).toMatchObject({ blocker_user_id: 7, blocked_user_id: 9 });
    expect(sql.mock.calls[1][0].join(" ")).toContain("INSERT INTO user_blocks");
  });

  it("re-block of a live pair is idempotent → 200 already_blocked", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ id: 1, blocker_user_id: 7, blocked_user_id: 9 }]);
    const res = await POST(post({ blocked_user_id: 9 }));
    expect(res.status).toBe(200);
    expect((await res.json()).already_blocked).toBe(true);
  });
});

describe("GET /api/blocks", () => {
  it("lists the caller's live blocks → 200", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ id: 1, blocked_user_id: 9, blocked_username: "bob" }]);
    const res = await GET(new Request("http://localhost/api/blocks"));
    expect(res.status).toBe(200);
    expect((await res.json()).blocks).toHaveLength(1);
    expect(sql.mock.calls[0][0].join(" ")).toContain("FROM user_blocks");
  });
});
