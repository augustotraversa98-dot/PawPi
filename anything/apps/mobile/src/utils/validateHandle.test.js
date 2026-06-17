// Ticket 2.35 — the @handle rule that gates onboarding "Continue".

import {
  validateHandleFormat,
  handleErrorMessage,
  isHandleAcceptable,
  normalizeHandle,
  TAKEN_HANDLES,
} from "./validateHandle";

describe("normalizeHandle", () => {
  it("lowercases and strips a leading @ and whitespace", () => {
    expect(normalizeHandle("  @Rex_Daily  ")).toBe("rex_daily");
  });
});

describe("validateHandleFormat", () => {
  it("accepts lowercase alphanumerics + underscore/dot of valid length", () => {
    expect(validateHandleFormat("rex_daily")).toBe("");
    expect(validateHandleFormat("biscuit.paws")).toBe("");
    expect(validateHandleFormat("dog123")).toBe("");
  });

  it("rejects empty / too short", () => {
    expect(validateHandleFormat("")).not.toBe("");
    expect(validateHandleFormat("ab")).not.toBe("");
  });

  it("rejects too long", () => {
    expect(validateHandleFormat("a".repeat(21))).not.toBe("");
  });

  it("rejects illegal characters and bad leading char", () => {
    expect(validateHandleFormat("Rex Daily")).not.toBe(""); // space + uppercase pre-normalize → space illegal
    expect(validateHandleFormat("_leading")).not.toBe(""); // must start alphanumeric
    expect(validateHandleFormat("has!bang")).not.toBe("");
  });

  it("normalizes a leading @ before validating", () => {
    expect(validateHandleFormat("@buddy_dog")).toBe("");
  });
});

describe("handleErrorMessage / isHandleAcceptable (format + uniqueness)", () => {
  it("acceptable when format ok and not taken", () => {
    expect(handleErrorMessage("rex_the_dog")).toBe("");
    expect(isHandleAcceptable("rex_the_dog")).toBe(true);
  });

  it("rejects a taken handle even with valid format", () => {
    expect(TAKEN_HANDLES).toContain("buddy");
    expect(handleErrorMessage("buddy")).toMatch(/taken/i);
    expect(isHandleAcceptable("buddy")).toBe(false);
  });

  it("blocks an empty handle (the onboarding-skip case)", () => {
    expect(isHandleAcceptable("")).toBe(false);
  });
});
