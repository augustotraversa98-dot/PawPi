import { describe, it, expect } from "vitest";

// subscriptionCadence (ticket 2.17) — the cadence advance helper. Day cadences add exact
// UTC days; month cadences add UTC months (incl. month rollover); unknown plan / bad date throw.

import { nextChargeAt, ALLOWED_PLANS } from "./subscriptionCadence";

describe("nextChargeAt", () => {
  it("weekly adds 7 days", () => {
    expect(nextChargeAt("2026-06-01T00:00:00.000Z", "weekly").toISOString()).toBe(
      "2026-06-08T00:00:00.000Z",
    );
  });

  it("biweekly adds 14 days", () => {
    expect(nextChargeAt("2026-06-01T00:00:00.000Z", "biweekly").toISOString()).toBe(
      "2026-06-15T00:00:00.000Z",
    );
  });

  it("monthly adds 1 month", () => {
    expect(nextChargeAt("2026-06-15T00:00:00.000Z", "monthly").toISOString()).toBe(
      "2026-07-15T00:00:00.000Z",
    );
  });

  it("quarterly adds 3 months", () => {
    expect(nextChargeAt("2026-01-15T00:00:00.000Z", "quarterly").toISOString()).toBe(
      "2026-04-15T00:00:00.000Z",
    );
  });

  it("monthly rolls a month overflow forward (Jan 31 → Mar 3, deterministic)", () => {
    // JS UTC month arithmetic rolls the overflow — accepted + deterministic.
    expect(nextChargeAt("2026-01-31T00:00:00.000Z", "monthly").toISOString()).toBe(
      "2026-03-03T00:00:00.000Z",
    );
  });

  it("crosses a year boundary (Dec → Jan)", () => {
    expect(nextChargeAt("2026-12-10T00:00:00.000Z", "monthly").toISOString()).toBe(
      "2027-01-10T00:00:00.000Z",
    );
  });

  it("throws on an unknown plan", () => {
    expect(() => nextChargeAt("2026-06-01T00:00:00.000Z", "yearly")).toThrow(/unknown plan/);
  });

  it("throws on an invalid date", () => {
    expect(() => nextChargeAt("not-a-date", "weekly")).toThrow(/invalid/);
  });

  it("exposes the canonical plan set", () => {
    expect(ALLOWED_PLANS).toEqual(["weekly", "biweekly", "monthly", "quarterly"]);
  });
});
