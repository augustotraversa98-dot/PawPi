// BX4 + BN2 — the server-backed business notification prefs client catalog + helper.

import {
  BUSINESS_NOTIF_CATEGORIES,
  BUSINESS_NOTIF_INFO_CATEGORIES,
  CHANNEL_GROUP,
  categoryDefaultEnabled,
  getBusinessNotificationPrefs,
  setBusinessCategoryEnabled,
} from "./businessNotificationPrefs";

beforeEach(() => {
  global.fetch = jest.fn();
});

describe("catalog shape", () => {
  it("toggleable = push + optional; info = in-app-only", () => {
    const keys = BUSINESS_NOTIF_CATEGORIES.map((c) => c.key);
    expect(keys).toContain("walk_requests"); // push
    expect(keys).toContain("biz_review"); // optional
    expect(keys).not.toContain("biz_follow"); // in-app-only → info list
    expect(BUSINESS_NOTIF_INFO_CATEGORIES.map((c) => c.key)).toEqual([
      "biz_post_engagement",
      "biz_follow",
    ]);
  });
  it("categoryDefaultEnabled: push → true, optional → false", () => {
    expect(categoryDefaultEnabled("biz_booking")).toBe(true);
    expect(categoryDefaultEnabled("biz_review")).toBe(false);
  });
  it("every info category is in the IN-APP group", () => {
    for (const c of BUSINESS_NOTIF_INFO_CATEGORIES) expect(c.group).toBe(CHANNEL_GROUP.INAPP);
  });
});

describe("getBusinessNotificationPrefs", () => {
  it("merges the server prefs over per-category defaults", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ prefs: { walk_requests: false } }),
    });
    const prefs = await getBusinessNotificationPrefs();
    expect(prefs.walk_requests).toBe(false); // from server
    expect(prefs.biz_booking).toBe(true); // push default
    expect(prefs.biz_review).toBe(false); // optional default
    expect(global.fetch).toHaveBeenCalledWith("/api/notification-prefs");
  });

  it("fail-open on a non-ok response (each category at its default)", async () => {
    global.fetch.mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    const prefs = await getBusinessNotificationPrefs();
    for (const c of BUSINESS_NOTIF_CATEGORIES) expect(prefs[c.key]).toBe(categoryDefaultEnabled(c.key));
  });

  it("fail-open when fetch throws (offline)", async () => {
    global.fetch.mockRejectedValueOnce(new Error("offline"));
    const prefs = await getBusinessNotificationPrefs();
    for (const c of BUSINESS_NOTIF_CATEGORIES) expect(prefs[c.key]).toBe(categoryDefaultEnabled(c.key));
  });
});

describe("setBusinessCategoryEnabled", () => {
  it("PUTs { category, enabled } and returns the merged map", async () => {
    // First call = the GET inside setBusinessCategoryEnabled; second = the PUT.
    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ prefs: { walk_requests: true } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ pref: { walk_requests: false } }) });

    const next = await setBusinessCategoryEnabled("walk_requests", false);
    expect(next.walk_requests).toBe(false);

    const putCall = global.fetch.mock.calls.find((c) => c[1]?.method === "PUT");
    expect(putCall[0]).toBe("/api/notification-prefs");
    expect(JSON.parse(putCall[1].body)).toEqual({ category: "walk_requests", enabled: false });
  });

  it("ignores an unknown category (no PUT)", async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ prefs: {} }) });
    await setBusinessCategoryEnabled("made_up", false);
    expect(global.fetch.mock.calls.some((c) => c[1]?.method === "PUT")).toBe(false);
  });
});
