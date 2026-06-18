import { describe, it, expect, vi, beforeEach } from "vitest";

// /api/forum/vote — idempotent vote via the forum_vote() DEFINER helper (ticket 2.44).

import { POST } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/requestContext", () => ({
  withRequestContext: (fn) => fn,
}));

const SESSION = { user: { id: 99 }, expires: "9999999999" };

function mockSql(score = 3) {
  sql.mockImplementation((strings) => {
    const q = Array.isArray(strings) ? strings.join(" ") : "";
    if (q.includes("FROM user_profiles WHERE auth_user_id")) return Promise.resolve([{ id: 7 }]);
    if (q.includes("forum_vote(")) return Promise.resolve([{ score }]);
    return Promise.resolve([]);
  });
}

const req = (body) =>
  new Request("http://localhost/api/forum/vote", {
    method: "POST",
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

it("401 unauthenticated", async () => {
  auth.mockResolvedValue(null);
  expect((await POST(req({ targetType: "thread", targetId: 1, value: 1 }))).status).toBe(401);
});

it("upvotes a thread and returns the recomputed score", async () => {
  auth.mockResolvedValue(SESSION);
  mockSql(3);
  const res = await POST(req({ targetType: "thread", targetId: 5, value: 1 }));
  expect(res.status).toBe(200);
  const data = await res.json();
  expect(data.score).toBe(3);
  expect(data.myVote).toBe(1);
  const text = sql.mock.calls.map((c) => (c?.[0] ?? []).join(" ")).join(" | ");
  expect(text).toContain("forum_vote(");
});

it("clearing a vote (value 0) returns myVote null", async () => {
  auth.mockResolvedValue(SESSION);
  mockSql(0);
  const res = await POST(req({ targetType: "comment", targetId: 9, value: 0 }));
  expect(res.status).toBe(200);
  const data = await res.json();
  expect(data.myVote).toBeNull();
});

it("rejects an invalid target type", async () => {
  auth.mockResolvedValue(SESSION);
  mockSql();
  expect((await POST(req({ targetType: "pet", targetId: 1, value: 1 }))).status).toBe(400);
});

it("rejects an out-of-range value", async () => {
  auth.mockResolvedValue(SESSION);
  mockSql();
  expect((await POST(req({ targetType: "thread", targetId: 1, value: 5 }))).status).toBe(400);
});
