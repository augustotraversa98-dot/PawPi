import {
  getOwnerNotificationPrefs,
  setOwnerCategoryEnabled,
  getQuietHours,
  setQuietHours,
  formatHour,
} from "./ownerNotificationPrefs";

const json = (body, ok = true) => jest.fn().mockResolvedValue({ ok, json: async () => body });
const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
});

describe("getOwnerNotificationPrefs", () => {
  it("returns the owner prefs when the server offers them", async () => {
    global.fetch = json({ prefs: {}, owner_prefs: { winback_email: false } });
    expect(await getOwnerNotificationPrefs()).toEqual({ winback_email: false });
  });
  it("null when the key is absent (server flag off), empty, a failure or offline", async () => {
    global.fetch = json({ prefs: {} });
    expect(await getOwnerNotificationPrefs()).toBeNull();
    global.fetch = json({ owner_prefs: {} });
    expect(await getOwnerNotificationPrefs()).toBeNull();
    global.fetch = json({}, false);
    expect(await getOwnerNotificationPrefs()).toBeNull();
    global.fetch = jest.fn().mockRejectedValue(new Error("offline"));
    expect(await getOwnerNotificationPrefs()).toBeNull();
  });
});

describe("setOwnerCategoryEnabled", () => {
  it("PUTs {category, enabled} and reports success", async () => {
    global.fetch = json({ pref: {} });
    expect(await setOwnerCategoryEnabled("owner_bookings", false)).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/notification-prefs",
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ category: "owner_bookings", enabled: false }) }),
    );
  });
  it("false on a refusal or network error, never throws", async () => {
    global.fetch = json({}, false);
    expect(await setOwnerCategoryEnabled("x", true)).toBe(false);
    global.fetch = jest.fn().mockRejectedValue(new Error("offline"));
    expect(await setOwnerCategoryEnabled("x", true)).toBe(false);
  });
});

describe("quiet hours", () => {
  it("getQuietHours: the saved window, or null while the server flag is off / on error", async () => {
    global.fetch = json({ enabled: true, start: 22, end: 8 });
    expect(await getQuietHours()).toEqual({ enabled: true, start: 22, end: 8 });
    global.fetch = json({ skipped: "disabled" });
    expect(await getQuietHours()).toBeNull();
    global.fetch = json({}, false);
    expect(await getQuietHours()).toBeNull();
    global.fetch = jest.fn().mockRejectedValue(new Error("offline"));
    expect(await getQuietHours()).toBeNull();
  });
  it("setQuietHours: PUTs the partial change and returns the saved window; null on failure", async () => {
    global.fetch = json({ enabled: false, start: 22, end: 8 });
    expect(await setQuietHours({ enabled: false })).toEqual({ enabled: false, start: 22, end: 8 });
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/notification-prefs/quiet-hours",
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ enabled: false }) }),
    );
    global.fetch = json({}, false);
    expect(await setQuietHours({ start: 1 })).toBeNull();
  });
  it("formatHour is a 24-hour clock", () => {
    expect(formatHour(8)).toBe("08:00");
    expect(formatHour(22)).toBe("22:00");
    expect(formatHour(24)).toBe("00:00");
    expect(formatHour(-1)).toBe("23:00");
  });
});
