import { describe, it, expect, vi, beforeEach } from "vitest";

// /api/posts/history — a pet's daily-post history for Memories (ticket 2.49).

import { GET } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/requestContext", () => ({ withRequestContext: (fn) => fn }));

const SESSION = { user: { id: 99 }, expires: "9999999999" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

it("401 unauthenticated", async () => {
  auth.mockResolvedValue(null);
  expect((await GET(new Request("http://localhost/api/posts/history?petId=1"))).status).toBe(401);
});

it("400 without a valid petId", async () => {
  auth.mockResolvedValue(SESSION);
  expect((await GET(new Request("http://localhost/api/posts/history"))).status).toBe(400);
});

it("returns daily posts with normalized YYYY-MM-DD dates", async () => {
  auth.mockResolvedValue(SESSION);
  sql.mockResolvedValue([
    { id: 1, image_url: "a.png", caption: "hi", post_date: new Date("2025-06-18T00:00:00Z") },
    { id: 2, image_url: "b.png", caption: null, post_date: "2024-06-18" },
  ]);
  const res = await GET(new Request("http://localhost/api/posts/history?petId=5"));
  expect(res.status).toBe(200);
  const data = await res.json();
  expect(data.posts[0].post_date).toBe("2025-06-18");
  expect(data.posts[1].post_date).toBe("2024-06-18");
  const text = sql.mock.calls.map((c) => (c?.[0] ?? []).join(" ")).join(" | ");
  expect(text).toContain("is_daily_update = true");
  expect(text).toContain("pet_id =");
});
