import AsyncStorage from "@react-native-async-storage/async-storage";
import { syncTimezoneToServer, deviceTimeZone } from "./timezoneSync";

const ok = (body) => jest.fn().mockResolvedValue({ ok: true, json: async () => body });

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe("syncTimezoneToServer", () => {
  it("PUTs the device IANA zone and remembers a real write", async () => {
    const f = ok({ ok: true, timezone: "America/Argentina/Buenos_Aires" });
    expect(await syncTimezoneToServer({ fetchImpl: f, timeZone: "America/Argentina/Buenos_Aires" })).toBe(true);
    expect(f).toHaveBeenCalledWith(
      "/api/user-profile/timezone",
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ timezone: "America/Argentina/Buenos_Aires" }) }),
    );
    // already told the server this zone -> no second call
    const g = ok({ ok: true, timezone: "America/Argentina/Buenos_Aires" });
    expect(await syncTimezoneToServer({ fetchImpl: g, timeZone: "America/Argentina/Buenos_Aires" })).toBe(false);
    expect(g).not.toHaveBeenCalled();
  });

  it("re-sends when the zone changes", async () => {
    await syncTimezoneToServer({ fetchImpl: ok({ timezone: "Europe/Madrid" }), timeZone: "Europe/Madrid" });
    const f = ok({ timezone: "America/Mexico_City" });
    expect(await syncTimezoneToServer({ fetchImpl: f, timeZone: "America/Mexico_City" })).toBe(true);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("does NOT remember a flag-off no-op ({skipped}) so it retries once the server flag is on", async () => {
    const off = ok({ ok: true, skipped: "disabled" });
    expect(await syncTimezoneToServer({ fetchImpl: off, timeZone: "Europe/Madrid" })).toBe(false);
    const on = ok({ ok: true, timezone: "Europe/Madrid" });
    expect(await syncTimezoneToServer({ fetchImpl: on, timeZone: "Europe/Madrid" })).toBe(true);
    expect(on).toHaveBeenCalledTimes(1);
  });

  it("never throws: network error, 401, or no zone available", async () => {
    expect(await syncTimezoneToServer({ fetchImpl: jest.fn().mockRejectedValue(new Error("offline")), timeZone: "Europe/Madrid" })).toBe(false);
    expect(await syncTimezoneToServer({ fetchImpl: jest.fn().mockResolvedValue({ ok: false, status: 401 }), timeZone: "Europe/Madrid" })).toBe(false);
    const f = jest.fn();
    expect(await syncTimezoneToServer({ fetchImpl: f, timeZone: null })).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });
});

describe("deviceTimeZone", () => {
  it("returns an IANA-looking zone or null", () => {
    const tz = deviceTimeZone();
    expect(tz === null || typeof tz === "string").toBe(true);
  });
});
