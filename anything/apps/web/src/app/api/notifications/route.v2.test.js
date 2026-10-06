import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// GET /api/notifications — notifications v2: the unread count (so the app's bell badge counts DB notifications),
// present only while NOTIF_V2_ENABLED is on.

import { GET } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/requestContext", () => ({
  withRequestContext: (fn) => fn,
  withSavepoint: (fn) => fn(),
}));

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const ROWS = [{ id: 3, type: "booking_confirmed", read_at: null }];
const text = (c) => c[0].join(" ");

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  delete process.env.NOTIF_V2_ENABLED;
  auth.mockResolvedValue(SESSION);
});
afterEach(() => {
  delete process.env.NOTIF_V2_ENABLED;
});

describe("GET /api/notifications — unread_count", () => {
  it("flag OFF: response is exactly {notifications} and no count query runs", async () => {
    sql.mockResolvedValueOnce([{ id: 7 }]).mockResolvedValueOnce(ROWS);
    const body = await (await GET(new Request("http://localhost/api/notifications"))).json();
    expect(body).toEqual({ notifications: ROWS });
    expect(sql).toHaveBeenCalledTimes(2);
  });

  it("flag ON: adds unread_count for the caller's own unread rows", async () => {
    process.env.NOTIF_V2_ENABLED = "1";
    sql.mockResolvedValueOnce([{ id: 7 }]).mockResolvedValueOnce(ROWS).mockResolvedValueOnce([{ n: 4 }]);
    const body = await (await GET(new Request("http://localhost/api/notifications"))).json();
    expect(body).toEqual({ notifications: ROWS, unread_count: 4 });
    const count = sql.mock.calls[2];
    expect(text(count)).toContain("read_at IS NULL");
    expect(count.slice(1)).toEqual([7]); // scoped to the caller's profile id
  });

  it("flag ON but the count fails: the list is still returned, no unread_count", async () => {
    process.env.NOTIF_V2_ENABLED = "1";
    sql.mockResolvedValueOnce([{ id: 7 }]).mockResolvedValueOnce(ROWS).mockRejectedValueOnce(new Error("db"));
    const res = await GET(new Request("http://localhost/api/notifications"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ notifications: ROWS });
  });
});
