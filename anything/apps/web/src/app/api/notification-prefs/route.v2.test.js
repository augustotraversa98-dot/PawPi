import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// /api/notification-prefs — owner (pet-owner) categories under notifications v2. Hidden while the flag is off.

import { GET, PUT } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));

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

describe("GET — owner_prefs", () => {
  it("flag OFF: payload is exactly as before (no owner_prefs key — the app hides the controls)", async () => {
    sql.mockResolvedValueOnce([{ id: 7 }]);
    sql.mockResolvedValueOnce([]);
    const json = await (await GET()).json();
    expect(Object.keys(json)).toEqual(["prefs"]);
  });

  it("flag ON: every promotional category (win-back email, digest push, win-back push) is OFF by default → explicit opt-in", async () => {
    process.env.NOTIF_V2_ENABLED = "true";
    sql.mockResolvedValueOnce([{ id: 7 }]);
    sql.mockResolvedValueOnce([]);
    const json = await (await GET()).json();
    expect(json.owner_prefs).toEqual({ winback_email: false, weekly_digest_push: false, winback_push: false });
  });

  it("flag ON: reflects a stored opt-in", async () => {
    process.env.NOTIF_V2_ENABLED = "true";
    sql.mockResolvedValueOnce([{ id: 7 }]);
    sql.mockResolvedValueOnce([{ category: "winback_email", enabled: true }]);
    expect((await (await GET()).json()).owner_prefs).toEqual({ winback_email: true, weekly_digest_push: false, winback_push: false });
  });

  it("flag ON, no profile yet: still defaults OFF", async () => {
    process.env.NOTIF_V2_ENABLED = "true";
    sql.mockResolvedValueOnce([]);
    expect((await (await GET()).json()).owner_prefs).toEqual({ winback_email: false, weekly_digest_push: false, winback_push: false });
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
