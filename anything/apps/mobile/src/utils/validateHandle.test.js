// Ticket 2.35 — the @handle rule that gates onboarding "Continue" / profile-edit "Save".
// Night run #2 PR B: uniqueness moved to the server (hooks/useHandleAvailability); this file
// covers the pure FORMAT rules and keeps parity with web/src/app/api/utils/petHandle.js.

import {
  handleFormatCode,
  validateHandleFormat,
  isHandleAcceptable,
  normalizeHandle,
  sanitizeHandleInput,
  RESERVED_HANDLES,
} from "./validateHandle";

// MUST stay identical to HANDLE_PARITY_CASES in web/src/app/api/utils/petHandle.test.js.
const HANDLE_PARITY_CASES = [
  ["", "empty"],
  ["   ", "empty"],
  ["@", "empty"],
  ["ab", "too_short"],
  ["abc", ""],
  ["a".repeat(20), ""],
  ["a".repeat(21), "too_long"],
  ["Luna", ""],
  ["@Luna", ""],
  ["  @@luna.paws  ", ""],
  ["my_dog.2", ""],
  ["_luna", "invalid_chars"],
  [".luna", "invalid_chars"],
  ["lu na", "invalid_chars"],
  ["lu-na", "invalid_chars"],
  ["lun\u00e1", "invalid_chars"],
  ["luna!", "invalid_chars"],
  ["admin", "reserved"],
  ["@PawPi", "reserved"],
  ["support", "reserved"],
];

describe("handle rules parity with the server", () => {
  it.each(HANDLE_PARITY_CASES)("%j -> %j", (input, code) => {
    expect(handleFormatCode(input)).toBe(code);
    expect(isHandleAcceptable(input)).toBe(code === "");
  });

  it("the reserved list is lowercase", () => {
    for (const w of RESERVED_HANDLES) expect(w).toBe(w.toLowerCase());
  });
});

describe("normalizeHandle / sanitizeHandleInput", () => {
  it("lowercases and strips a leading @ and whitespace", () => {
    expect(normalizeHandle("  @Rex_Daily  ")).toBe("rex_daily");
  });

  it("typing filter keeps only lowercase letters, numbers, _ and .", () => {
    expect(sanitizeHandleInput("Rex Daily!-1")).toBe("rexdaily1");
    expect(sanitizeHandleInput("a_b.c")).toBe("a_b.c");
  });
});

describe("validateHandleFormat (back-compat: '' when valid, reason code otherwise)", () => {
  it("accepts lowercase alphanumerics + underscore/dot of valid length", () => {
    expect(validateHandleFormat("rex_daily")).toBe("");
    expect(validateHandleFormat("biscuit.paws")).toBe("");
    expect(validateHandleFormat("dog123")).toBe("");
  });

  it("rejects an empty handle (the onboarding-skip case)", () => {
    expect(isHandleAcceptable("")).toBe(false);
  });
});
