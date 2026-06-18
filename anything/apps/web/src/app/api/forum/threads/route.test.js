import { describe, it, expect, vi, beforeEach } from "vitest";

// /api/forum/threads — list (sort/category) + create (ticket 2.44). auth() + sql mocked.

import { GET, POST } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/requestContext", () => ({
  withRequestContext: (fn) => fn,
}));

const SESSION = { user: { id: 99 }, expires: "9999999999" };

// Content-aware mock: resolveUserId → profile; forum_threads → rows; fragments → [].
function mockSql({ profile = [{ id: 7 }], threads = [], insert = [{ id: 1 }] } = {}) {
  sql.mockImplementation((strings) => {
    const q = Array.isArray(strings) ? strings.join(" ") : "";
    if (q.includes("FROM user_profiles WHERE auth_user_id")) return Promise.resolve(profile);
    if (q.includes("INSERT INTO forum_threads")) return Promise.resolve(insert);
    if (q.includes("FROM forum_threads")) return Promise.resolve(threads);
    return Promise.resolve([]);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/forum/threads", () => {
  it("401 unauthenticated", async () => {
    auth.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/forum/threads"));
    expect(res.status).toBe(401);
  });

  it("lists live threads with author + comment_count + my_vote", async () => {
    auth.mockResolvedValue(SESSION);
    mockSql({ threads: [{ id: 5, title: "Hi", comment_count: 2, my_vote: 1 }] });
    const res = await GET(
      new Request("http://localhost/api/forum/threads?sort=top&category=Health"),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.threads[0].id).toBe(5);
    expect(data.sort).toBe("top");
    const text = sql.mock.calls.map((c) => (c?.[0] ?? []).join(" ")).join(" | ");
    expect(text).toContain("FROM forum_threads");
    expect(text).toContain("deleted_at IS NULL");
    expect(text).toContain("comment_count");
  });
});

describe("POST /api/forum/threads", () => {
  it("creates a thread for the author", async () => {
    auth.mockResolvedValue(SESSION);
    mockSql({ insert: [{ id: 10, title: "My Q", author_user_id: 7 }] });
    const res = await POST(
      new Request("http://localhost/api/forum/threads", {
        method: "POST",
        body: JSON.stringify({ title: "My Q", category: "Food", body: "text" }),
      }),
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.thread.id).toBe(10);
    const text = sql.mock.calls.map((c) => (c?.[0] ?? []).join(" ")).join(" | ");
    expect(text).toContain("INSERT INTO forum_threads");
  });

  it("400 when the title is blank", async () => {
    auth.mockResolvedValue(SESSION);
    mockSql();
    const res = await POST(
      new Request("http://localhost/api/forum/threads", {
        method: "POST",
        body: JSON.stringify({ title: "   " }),
      }),
    );
    expect(res.status).toBe(400);
  });
});
