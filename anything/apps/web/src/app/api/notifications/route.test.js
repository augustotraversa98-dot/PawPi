import { describe, it, expect, vi, beforeEach } from "vitest";

// GET /api/notifications — the caller's own notifications, recipient-scoped (ticket
// 2.26). auth() + sql mocked; resolveUserId runs for real so sql call #1 is the
// user_profiles lookup ([{id}]).

import { GET } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const PROFILE_ROW = { id: 7 };
const req = (qs = "") => new Request(`http://localhost/api/notifications${qs}`);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/notifications", () => {
  it("401 when unauthenticated", async () => {
    auth.mockResolvedValue(null);
    expect((await GET(req())).status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  it("returns the caller's notifications, recipient-scoped", async () => {
    auth.mockResolvedValue(SESSION);
    const ROWS = [
      { id: 3, type: "paw", subject_ref: "5", body: "pawed your post", read_at: null },
    ];
    sql.mockResolvedValueOnce([PROFILE_ROW]).mockResolvedValueOnce(ROWS);

    const res = await GET(req());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ notifications: ROWS });
    // The list query is scoped to the resolved recipient id (7).
    const [strings, ...values] = sql.mock.calls[1];
    const text = strings.join(" ");
    expect(text).toContain("FROM notifications");
    expect(text).toContain("recipient_user_id =");
    expect(values).toContain(7);
  });
});
