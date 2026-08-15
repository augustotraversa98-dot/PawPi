// BX4 — the server-backed business notification prefs client helper.

import {
  BUSINESS_NOTIF_CATEGORIES,
  getBusinessNotificationPrefs,
  setBusinessCategoryEnabled,
} from "./businessNotificationPrefs";

beforeEach(() => {
  global.fetch = jest.fn();
});

describe("getBusinessNotificationPrefs", () => {
  it("merges the server prefs over fail-open defaults", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ prefs: { walk_requests: false } }),
    });
    expect(await getBusinessNotificationPrefs()).toEqual({ walk_requests: false });
    expect(global.fetch).toHaveBeenCalledWith("/api/notification-prefs");
  });

  it("fail-open on a non-ok response (every category defaults enabled)", async () => {
    global.fetch.mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    const prefs = await getBusinessNotificationPrefs();
    for (const c of BUSINESS_NOTIF_CATEGORIES) expect(prefs[c.key]).toBe(true);
  });

  it("fail-open when fetch throws (offline)", async () => {
    global.fetch.mockRejectedValueOnce(new Error("offline"));
    const prefs = await getBusinessNotificationPrefs();
    for (const c of BUSINESS_NOTIF_CATEGORIES) expect(prefs[c.key]).toBe(true);
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
