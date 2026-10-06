import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// /api/notification-prefs — owner (pet-owner) categories under notifications v2. Hidden while the flag is off.

import { GET, PUT } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/requestContext", () => ({
  withRequestContext: (fn) => fn,
  withSavepoint: (fn) => fn(),
}));

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const put = (body) =>
  new Request("http://localhost/api/notification-prefs", { method: "PUT", body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  delete process.env.NOTIF_V2_ENABLED;
  auth.mockResolvedValue(SESSION);
});
afterEach(() => {
  delete process.env.NOTIF_V2_ENABLED;
});

const DEFAULTS = {
  // transactional: ON
  owner_bookings: true,
  owner_adoption: true,
  owner_walk_requests: true,
  owner_lost_alerts: true,
  // promotional: OFF until the owner opts in
  weekly_digest_push: false,
  winback_push: false,
  winback_email: false,
};

describe("GET — owner_prefs + quiet_hours", () => {
  it("flag OFF: payload is exactly as before (no v2 keys — the app hides the controls)", async () => {
    sql.mockResolvedValueOnce([{ id: 7 }]);
    sql.mockResolvedValueOnce([]);
    const json = await (await GET()).json();
    expect(Object.keys(json)).toEqual(["prefs"]);
    expect(sql).toHaveBeenCalledTimes(2); // owner + prefs only: no notification_settings query
  });

  it("flag ON: transactional categories default ON, promotional (push + email) default OFF", async () => {
    process.env.NOTIF_V2_ENABLED = "true";
    sql.mockResolvedValueOnce([{ id: 7 }]);
    sql.mockResolvedValueOnce([]);
    sql.mockResolvedValueOnce([]); // notification_settings: no row
    const json = await (await GET()).json();
    expect(json.owner_prefs).toEqual(DEFAULTS);
    expect(json.quiet_hours).toEqual({ enabled: true, start: 22, end: 8 });
  });

  it("flag ON: reflects stored opt-ins / opt-outs and a stored quiet-hours row", async () => {
    process.env.NOTIF_V2_ENABLED = "true";
    sql.mockResolvedValueOnce([{ id: 7 }]);
    sql.mockResolvedValueOnce([
      { category: "winback_email", enabled: true },
      { category: "owner_bookings", enabled: false },
    ]);
    sql.mockResolvedValueOnce([{ quiet_hours_enabled: false, quiet_start: 23, quiet_end: 7 }]);
    const json = await (await GET()).json();
    expect(json.owner_prefs).toEqual({ ...DEFAULTS, winback_email: true, owner_bookings: false });
    expect(json.quiet_hours).toEqual({ enabled: false, start: 23, end: 7 });
  });

  it("flag ON, notification_settings missing (0132 not applied): still 200 with the default quiet hours", async () => {
    process.env.NOTIF_V2_ENABLED = "true";
    sql.mockResolvedValueOnce([{ id: 7 }]);
    sql.mockResolvedValueOnce([]);
    sql.mockRejectedValueOnce(Object.assign(new Error("missing"), { code: "42P01" }));
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).quiet_hours).toEqual({ enabled: true, start: 22, end: 8 });
  });

  it("flag ON, no profile yet: defaults, nothing queried beyond the lookup", async () => {
    process.env.NOTIF_V2_ENABLED = "true";
    sql.mockResolvedValueOnce([]);
    const json = await (await GET()).json();
    expect(json.owner_prefs).toEqual(DEFAULTS);
    expect(json.quiet_hours).toEqual({ enabled: true, start: 22, end: 8 });
  });
});

describe("PUT — owner categories", () => {
  it("flag OFF: an owner category is rejected exactly like any unknown category (400, nothing written)", async () => {
    const res = await PUT(put({ category: "winback_email", enabled: true }));
    expect(res.status).toBe(400);
    expect(sql).not.toHaveBeenCalled();
  });

  it("flag ON: upserts the caller's own opt-in", async () => {
    process.env.NOTIF_V2_ENABLED = "true";
    sql.mockResolvedValueOnce([{ id: 7 }]); // resolveOwner
    sql.mockResolvedValueOnce([{ category: "winback_email", enabled: true }]);
    const res = await PUT(put({ category: "winback_email", enabled: true }));
    expect(res.status).toBe(200);
    expect((await res.json()).pref).toEqual({ category: "winback_email", enabled: true });
    const upsert = sql.mock.calls[1];
    expect(upsert.slice(1)).toEqual([7, "winback_email", true]);
  });

  it("flag ON: unknown categories and non-booleans are still rejected", async () => {
    process.env.NOTIF_V2_ENABLED = "true";
    expect((await PUT(put({ category: "made_up", enabled: true }))).status).toBe(400);
    expect((await PUT(put({ category: "winback_email", enabled: "yes" }))).status).toBe(400);
    expect(sql).not.toHaveBeenCalled();
  });

  it("business categories keep working with the flag on", async () => {
    process.env.NOTIF_V2_ENABLED = "true";
    sql.mockResolvedValueOnce([{ id: 7 }]);
    sql.mockResolvedValueOnce([{ category: "biz_booking", enabled: false }]);
    expect((await PUT(put({ category: "biz_booking", enabled: false }))).status).toBe(200);
  });
});
