import { defineHardeningTests } from "./canonicalDateTime.hardening.shared";

describe("date-input hardening (America/Argentina/Buenos_Aires, UTC-3)", () => {
  it("runs in the pinned zone", () => {
    expect(new Date(2026, 0, 15).getTimezoneOffset()).toBe(180);
  });
  defineHardeningTests();
});
