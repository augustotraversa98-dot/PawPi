import { describe, it, expect } from "vitest";
import { usernameBaseFor, publicOwnerName } from "./ownerDisplay";

describe("usernameBaseFor", () => {
  it("slugs a real name", () => {
    expect(usernameBaseFor("María José Pérez")).toBe("mariajoseperez");
  });
  it("falls back to a random neutral handle when there is no usable name", () => {
    for (const v of [undefined, null, "", "  ", "!!"]) {
      expect(usernameBaseFor(v)).toMatch(/^pawpi_[a-z0-9]{1,6}$/);
    }
  });
  it("cannot be derived from an e-mail (no e-mail parameter; an e-mail passed as a name is slugged without the domain separator)", () => {
    expect(usernameBaseFor.length).toBe(1);
    expect(usernameBaseFor("jane+demo@example.com")).not.toContain("@");
    expect(usernameBaseFor("jane+demo@example.com")).not.toContain("+");
  });
});

describe("publicOwnerName", () => {
  it("returns the real display name", () => {
    expect(publicOwnerName({ full_name: "  Jane Doe ", username: "jane+demo" })).toBe("Jane Doe");
  });
  it("never falls back to the username (which may be e-mail derived)", () => {
    expect(publicOwnerName({ full_name: null, username: "augusto+demo2" })).toBeNull();
    expect(publicOwnerName({ full_name: "   ", username: "qa-core-1" })).toBeNull();
    expect(publicOwnerName(undefined)).toBeNull();
  });
});
