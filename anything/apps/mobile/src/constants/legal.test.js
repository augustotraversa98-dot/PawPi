import { SUPPORT_EMAIL } from "./legal";

// Regression guard for a bug class that is invisible at runtime.
//
// SUPPORT_EMAIL is what Settings → "Contact us" opens a mailto: to, and it is the address Apple
// checks against the App Store Connect support contact. It used to default to support@pawpi.app —
// a domain PawPi does NOT own — so every message a user sent went nowhere: no delivery, no bounce
// back to them, and nothing for us to notice. The app looked completely fine.
//
// PawPi owns pawpi.info (and only pawpi.info). Anything here on another domain is broken by
// definition, so assert the domain rather than the exact local part — the mailbox may change,
// the domain may not.
describe("SUPPORT_EMAIL", () => {
  it("is a non-empty address, so Contact us is never a dead button", () => {
    expect(typeof SUPPORT_EMAIL).toBe("string");
    expect(SUPPORT_EMAIL.length).toBeGreaterThan(0);
    expect(SUPPORT_EMAIL).toContain("@");
  });

  it("is on pawpi.info — the domain we actually own", () => {
    expect(SUPPORT_EMAIL.toLowerCase().endsWith("@pawpi.info")).toBe(true);
  });

  it("is NOT on pawpi.app (we do not own it; mail there is unreachable)", () => {
    expect(SUPPORT_EMAIL.toLowerCase()).not.toContain("pawpi.app");
  });
});
