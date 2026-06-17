import { describe, it, expect, vi, beforeEach } from "vitest";

// GET/POST /api/dm-threads/[id]/messages (ticket 2.27). RLS scopes to participants;
// a non-participant insert raises 42501 → 403. auth() + sql mocked; resolveUserId
// runs for real (sql #1 = profile).

import { GET, POST } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const PROFILE_ROW = { id: 7 };
const PARAMS = { params: { id: "5" } };
const getReq = () =>
  new Request("http://localhost/api/dm-threads/5/messages");
const postReq = (body) =>
  new Request("http://localhost/api/dm-threads/5/messages", {
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

describe("GET messages", () => {
  it("401 unauth", async () => {
    auth.mockResolvedValue(null);
    expect((await GET(getReq(), PARAMS)).status).toBe(401);
  });

  it("returns messages + hasMore", async () => {
    auth.mockResolvedValue(SESSION);
    const MSGS = [{ id: 2, body: "hi" }];
    sql.mockResolvedValueOnce([PROFILE_ROW]).mockResolvedValueOnce(MSGS);
    const res = await GET(getReq(), PARAMS);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ messages: MSGS, hasMore: false });
    expect(queryTextOf(1)).toContain("FROM dm_messages");
  });
});

describe("POST message", () => {
  it("400 when neither text nor image", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]);
    const res = await POST(postReq({ body: "   " }), PARAMS);
    expect(res.status).toBe(400);
    expect(sql).toHaveBeenCalledTimes(1);
  });

  it("sends a message as the caller and bumps the thread", async () => {
    auth.mockResolvedValue(SESSION);
    const CREATED = { id: 9, thread_id: 5, sender_user_id: 7, body: "hi" };
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // resolveUserId
      .mockResolvedValueOnce([CREATED]) // INSERT
      .mockResolvedValueOnce([]); // bump last_message_at
    const res = await POST(postReq({ body: "hi" }), PARAMS);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ message: CREATED });
    expect(queryTextOf(1)).toContain("INSERT INTO dm_messages");
    expect(valuesOf(1)).toContain(7); // sender = caller
    expect(queryTextOf(2)).toContain("UPDATE dm_threads");
  });

  it("403 when RLS rejects a non-participant (42501)", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockRejectedValueOnce(Object.assign(new Error("rls"), { code: "42501" }));
    const res = await POST(postReq({ body: "hi" }), PARAMS);
    expect(res.status).toBe(403);
  });
});
