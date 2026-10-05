import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/app/api/utils/requestContext", () => ({ withSavepoint: (fn) => fn() }));

import {
  isNotifV2Enabled,
  isMissingSchemaError,
  softV2,
  dailyPushCap,
  DEFAULT_DAILY_PUSH_CAP,
  __resetNotifV2SchemaStateForTests,
} from "./notifV2";

const saved = { ...process.env };
beforeEach(() => {
  delete process.env.NOTIF_V2_ENABLED;
  delete process.env.NOTIF_V2_DAILY_CAP;
  __resetNotifV2SchemaStateForTests();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  process.env = { ...saved };
  vi.restoreAllMocks();
});

describe("NOTIF_V2_ENABLED flag", () => {
  it("is OFF when absent, empty or not a truthy word", () => {
    expect(isNotifV2Enabled()).toBe(false);
    for (const v of ["", "0", "false", "off", "no", "disabled", "2", "tru"]) {
      process.env.NOTIF_V2_ENABLED = v;
      expect(isNotifV2Enabled(), `value ${JSON.stringify(v)}`).toBe(false);
    }
  });
  it("is ON for 1/true/on/yes/enabled (any case, trimmed)", () => {
    for (const v of ["1", "true", "TRUE", " On ", "yes", "enabled"]) {
      process.env.NOTIF_V2_ENABLED = v;
      expect(isNotifV2Enabled(), `value ${JSON.stringify(v)}`).toBe(true);
    }
  });
  it("is read on every call (flipping the variable takes effect without a reload)", () => {
    expect(isNotifV2Enabled()).toBe(false);
    process.env.NOTIF_V2_ENABLED = "true";
    expect(isNotifV2Enabled()).toBe(true);
    delete process.env.NOTIF_V2_ENABLED;
    expect(isNotifV2Enabled()).toBe(false);
  });
});

describe("softV2", () => {
  it("returns the value on success", async () => {
    expect(await softV2(async () => 5, 0)).toBe(5);
  });
  it("returns the fallback (never throws) on a DB error", async () => {
    expect(await softV2(async () => { throw new Error("boom"); }, "fb")).toBe("fb");
  });
  it("recognises missing-schema codes and then skips the query for a while", async () => {
    for (const code of ["42P01", "42883", "42703"]) expect(isMissingSchemaError({ code })).toBe(true);
    expect(isMissingSchemaError({ code: "23505" })).toBe(false);
    const fn = vi.fn().mockRejectedValue({ code: "42P01" });
    expect(await softV2(fn, null)).toBeNull();
    expect(await softV2(fn, null)).toBeNull();
    expect(fn).toHaveBeenCalledTimes(1); // second call short-circuited
    __resetNotifV2SchemaStateForTests();
    await softV2(fn, null);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe("dailyPushCap", () => {
  it("defaults, and accepts a sane override only", () => {
    expect(dailyPushCap()).toBe(DEFAULT_DAILY_PUSH_CAP);
    process.env.NOTIF_V2_DAILY_CAP = "5";
    expect(dailyPushCap()).toBe(5);
    for (const bad of ["0", "-1", "abc", "999", "2.5x"]) {
      process.env.NOTIF_V2_DAILY_CAP = bad;
      expect(dailyPushCap(), bad).toBe(bad === "2.5x" ? 2 : DEFAULT_DAILY_PUSH_CAP);
    }
  });
});
