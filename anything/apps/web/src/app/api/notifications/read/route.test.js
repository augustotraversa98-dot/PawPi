import { describe, it, expect, vi, beforeEach } from "vitest";

// POST /api/notifications/read — mark the caller's notifications read (ticket 2.26).
// auth() + sql mocked; resolveUserId runs for real (sql call #1 = profile lookup).

import { POST } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const PROFILE_ROW = { id: 7 };
const readReq = (body) =>
  new Request("http://localhost/api/notifications/read", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/notifications/read", () => {
  it("401 when unauthenticated", async () => {
    auth.mockResolvedValue(null);
    expect((await POST(readReq({ all: true }))).status).toBe(401);
  });

  it("400 when neither ids nor all is provided", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]); // resolveUserId
    const res = await POST(readReq({}));
    expect(res.status).toBe(400);
    expect(sql).toHaveBeenCalledTimes(1); // only the profile lookup
  });

  it("marks all read, scoped to the recipient", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([{ id: 1 }, { id: 2 }]); // updated rows
    const res = await POST(readReq({ all: true }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, updated: 2 });
    const [strings, ...values] = sql.mock.calls[1];
    const text = strings.join(" ");
    expect(text).toContain("UPDATE notifications");
    expect(text).toContain("recipient_user_id =");
    expect(values).toContain(7);
  });

  it("marks specific ids read", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([{ id: 9 }]); // one updated
    const res = await POST(readReq({ ids: [9] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, updated: 1 });
    const [strings, ...values] = sql.mock.calls[1];
    expect(strings.join(" ")).toContain("id = ANY(");
    expect(values).toContainEqual([9]);
  });
});
