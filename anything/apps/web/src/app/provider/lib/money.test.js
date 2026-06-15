import { describe, it, expect } from "vitest";
import {
  centsToCurrency,
  centsToInput,
  dollarsToCents,
  parseDurationMin,
} from "./money";

describe("centsToCurrency", () => {
  it("formats cents as a dollar string and em-dashes null", () => {
    expect(centsToCurrency(5000)).toBe("$50.00");
    expect(centsToCurrency(7550)).toBe("$75.50");
    expect(centsToCurrency(0)).toBe("$0.00");
    expect(centsToCurrency(null)).toBe("—");
    expect(centsToCurrency(undefined)).toBe("—");
  });
});

describe("centsToInput", () => {
  it("seeds an input string, blank for null", () => {
    expect(centsToInput(5000)).toBe("50.00");
    expect(centsToInput(null)).toBe("");
    expect(centsToInput(undefined)).toBe("");
  });
});

describe("dollarsToCents", () => {
  it("returns undefined cents for a blank input (field omitted)", () => {
    expect(dollarsToCents("")).toEqual({ cents: undefined });
    expect(dollarsToCents("   ")).toEqual({ cents: undefined });
  });

  it("converts a valid amount to non-negative integer cents", () => {
    expect(dollarsToCents("50")).toEqual({ cents: 5000 });
    expect(dollarsToCents("75.50")).toEqual({ cents: 7550 });
    expect(dollarsToCents("$12.34")).toEqual({ cents: 1234 });
    expect(dollarsToCents("0")).toEqual({ cents: 0 });
  });

  it("rejects non-numeric and negative amounts (mirrors the server)", () => {
    expect(dollarsToCents("abc").error).toBeTruthy();
    expect(dollarsToCents("-5").error).toBeTruthy();
  });
});

describe("parseDurationMin", () => {
  it("returns undefined for blank, the integer for a positive value", () => {
    expect(parseDurationMin("")).toEqual({ value: undefined });
    expect(parseDurationMin("30")).toEqual({ value: 30 });
  });

  it("rejects zero, negatives, and non-integers", () => {
    expect(parseDurationMin("0").error).toBeTruthy();
    expect(parseDurationMin("-1").error).toBeTruthy();
    expect(parseDurationMin("12.5").error).toBeTruthy();
    expect(parseDurationMin("abc").error).toBeTruthy();
  });
});
