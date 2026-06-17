import { describe, it, expect, vi, beforeEach } from "vitest";

// POST /api/dm-threads/[id]/read (ticket 2.27) — mark messages I received as read.
import { POST } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const PROFILE_ROW = { id: 7 };
const PARAMS = { params: { id: "5" } };
const req = () =>
  new Request("http://localhost/api/dm-threads/5/read", { method: "POST" });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

it("401 unauth", async () => {
  auth.mockResolvedValue(null);
  expect((await POST(req(), PARAMS)).status).toBe(401);
});

it("marks the OTHER side's messages read, scoped to me", async () => {
  auth.mockResolvedValue(SESSION);
  sql
    .mockResolvedValueOnce([PROFILE_ROW])
    .mockResolvedValueOnce([{ id: 1 }, { id: 2 }]);
  const res = await POST(req(), PARAMS);
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ updated: 2 });
  const text = (sql.mock.calls[1]?.[0] ?? []).join(" ");
  expect(text).toContain("UPDATE dm_messages");
  expect(text).toContain("sender_user_id <>");
  expect(sql.mock.calls[1].slice(1)).toContain(7);
});
