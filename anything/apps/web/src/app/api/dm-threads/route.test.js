import { describe, it, expect, vi, beforeEach } from "vitest";

// GET/POST /api/dm-threads — owner↔owner DM threads (ticket 2.27). List my threads;
// start/reuse a thread (idempotent per normalized pair). auth() + sql mocked;
// resolveUserId runs for real (sql call #1 = profile lookup [{id}]).

import { GET, POST } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const PROFILE_ROW = { id: 7 };
const getReq = () => new Request("http://localhost/api/dm-threads");
const postReq = (body) =>
  new Request("http://localhost/api/dm-threads", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
const queryTextOf = (i) => (sql.mock.calls[i]?.[0] ?? []).join(" ");
const valuesOf = (i) => sql.mock.calls[i]?.slice(1) ?? [];

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/dm-threads", () => {
  it("401 when unauthenticated", async () => {
    auth.mockResolvedValue(null);
    expect((await GET(getReq())).status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  it("lists my threads, scoped to me", async () => {
    auth.mockResolvedValue(SESSION);
    const THREADS = [{ id: 1, other_user_id: 9, other_name: "Jane", unread_count: 2 }];
    sql.mockResolvedValueOnce([PROFILE_ROW]).mockResolvedValueOnce(THREADS);
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ threads: THREADS });
    const text = queryTextOf(1);
    expect(text).toContain("FROM dm_threads");
    expect(text).toContain("user_a_id =");
    expect(valuesOf(1)).toContain(7);
  });
});

describe("POST /api/dm-threads", () => {
  it("400 when otherUserId missing", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]);
    expect((await POST(postReq({}), {})).status).toBe(400);
  });

  it("400 when starting a thread with yourself", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]);
    expect((await POST(postReq({ otherUserId: 7 }))).status).toBe(400);
  });

  it("404 when the other user does not exist", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]).mockResolvedValueOnce([]); // other missing
    expect((await POST(postReq({ otherUserId: 9 }))).status).toBe(404);
  });

  it("reuses an existing pair thread (idempotent), normalized least/greatest", async () => {
    auth.mockResolvedValue(SESSION);
    const EXISTING = { id: 5, user_a_id: 7, user_b_id: 9 };
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // me = 7
      .mockResolvedValueOnce([{ id: 9 }]) // other exists
      .mockResolvedValueOnce([EXISTING]); // existing pair thread
    const res = await POST(postReq({ otherUserId: 9 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ thread: EXISTING, reused: true });
    // The pair lookup is normalized a<b → (7, 9).
    const values = valuesOf(2);
    expect(values).toContain(7);
    expect(values).toContain(9);
    // No INSERT happened.
    expect(sql.mock.calls.length).toBe(3);
  });

  it("creates a new thread when none exists (normalized pair)", async () => {
    auth.mockResolvedValue(SESSION);
    const CREATED = { id: 6, user_a_id: 3, user_b_id: 7 };
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // me = 7
      .mockResolvedValueOnce([{ id: 3 }]) // other exists
      .mockResolvedValueOnce([]) // no existing thread
      .mockResolvedValueOnce([CREATED]); // INSERT
    const res = await POST(postReq({ otherUserId: 3 }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ thread: CREATED, reused: false });
    // INSERT stores least=3, greatest=7.
    const values = valuesOf(3);
    expect(values).toContain(3);
    expect(values).toContain(7);
  });
});
