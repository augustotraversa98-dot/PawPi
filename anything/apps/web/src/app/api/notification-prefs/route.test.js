import { describe, it, expect, vi, beforeEach } from "vitest";

// /api/notification-prefs — server-side business notification preferences (BX4).

import { GET, PUT } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const put = (body) =>
  new Request("http://localhost/api/notification-prefs", {
    method: "PUT",
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/notification-prefs", () => {
  it("anonymous → 401", async () => {
    auth.mockResolvedValue(undefined);
    expect((await GET()).status).toBe(401);
  });

  it("reflects a stored disabled category; unstored ones fail-open to true", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ id: 7 }]); // resolveOwner
    sql.mockResolvedValueOnce([{ category: "walk_requests", enabled: false }]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).prefs).toEqual({ walk_requests: false });
  });

  it("no stored rows → every business category defaults to true", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ id: 7 }]); // resolveOwner
    sql.mockResolvedValueOnce([]); // no prefs
    const res = await GET();
    expect((await res.json()).prefs).toEqual({ walk_requests: true });
  });
});

describe("PUT /api/notification-prefs", () => {
  it("anonymous → 401", async () => {
    auth.mockResolvedValue(undefined);
    expect((await PUT(put({ category: "walk_requests", enabled: false }))).status).toBe(401);
  });

  it("unknown category → 400", async () => {
    auth.mockResolvedValue(SESSION);
    expect((await PUT(put({ category: "bookings_made_up", enabled: false }))).status).toBe(400);
  });

  it("non-boolean enabled → 400", async () => {
    auth.mockResolvedValue(SESSION);
    expect((await PUT(put({ category: "walk_requests", enabled: "no" }))).status).toBe(400);
  });

  it("valid toggle → upserts the caller's pref (200)", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ id: 7 }]); // resolveOwner
    sql.mockResolvedValueOnce([{ category: "walk_requests", enabled: false }]); // upsert RETURNING
    const res = await PUT(put({ category: "walk_requests", enabled: false }));
    expect(res.status).toBe(200);
    expect((await res.json()).pref).toEqual({ category: "walk_requests", enabled: false });
    expect(sql.mock.calls[1][0].join(" ")).toContain("INSERT INTO notification_prefs");
    expect(sql.mock.calls[1][0].join(" ")).toContain("ON CONFLICT");
  });
});
