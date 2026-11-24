import { defineHardeningTests } from "./canonicalDateTime.hardening.shared";

describe("date-input hardening (Europe/Rome, UTC+1/+2)", () => {
  it("runs in the pinned zone", () => {
    expect(new Date(2026, 0, 15).getTimezoneOffset()).toBe(-60);
  });
  defineHardeningTests();
});
