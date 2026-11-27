import { describe, it, expect } from "vitest";
import {
  centsToCurrency,
  centsToInput,
  dollarsToCents,
  importedPriceToInput,
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

// parseFloat("49,90") is 49: the bug this module exists to prevent.
describe("provider panel money parsing", () => {
  const sources = import.meta.glob(["../**/*.{js,jsx}", "!../**/*.test.{js,jsx}"], {
    eager: true,
    query: "?raw",
    import: "default",
  });

  it("never reads a typed value with parseFloat", () => {
    expect(Object.keys(sources).length).toBeGreaterThan(40);
    const offenders = Object.entries(sources)
      .filter(([, code]) => /parseFloat\(/.test(code.replace(/\/\/.*$/gm, "")))
      .map(([file]) => file);
    expect(offenders).toEqual([]);
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

  // typed text → cents in es-AR and en-US; null = refused with an error.
  it.each([
    ["49,90", 4990, 4990],
    ["49.90", 4990, 4990],
    ["49,9", 4990, 4990],
    ["49.9", 4990, 4990],
    ["0,05", 5, 5],
    [",50", 50, 50],
    [".5", 50, 50],
    ["007", 700, 700],
    ["$ 49,90", 4990, 4990],
    ["  $49.90  ", 4990, 4990],
    ["$\u00a049,90", 4990, 4990],
    ["1.234,56", 123456, 123456],
    ["1,234.56", 123456, 123456],
    ["1.234,5", 123450, 123450],
    ["12.345.678,90", 1234567890, 1234567890],
    ["1.234.567", 123456700, 123456700],
    ["1,234,567", 123456700, 123456700],
    ["1.234", 123400, null],
    ["1,234", null, 123400],
    ["12.500", 1250000, null],
    ["12,500", null, 1250000],
    ["1234,56", 123456, 123456],
    ["19.99", 1999, 1999],
    // the old integer limit is an ordinary price now; the limit is $999.999.999.999,99
    ["21474836,48", 2147483648, 2147483648],
    ["25.000.000", 2500000000, 2500000000],
    ["1.000.000.000,50", 100000000050, 100000000050],
    ["999999999999,99", 99999999999999, 99999999999999],
    ["1000000000000", null, null],
    ["99999999999999999999", null, null],
    ["49,905", null, 4990500],
    ["49.905", 4990500, null],
    ["49.9050", null, null],
    ["1234.567", null, null],
    ["0.500", null, null],
    ["0,500", null, null],
    ["49,", null, null],
    ["49.", null, null],
    [",", null, null],
    ["$", null, null],
    ["1,2,3", null, null],
    ["1.23.456", null, null],
    ["1,23.45", null, null],
    ["1.234,567", null, null],
    ["1.234,", null, null],
    ["1.234,56,7", null, null],
    ["49,,90", null, null],
    ["49 90", null, null],
    ["1 234,56", null, null],
    ["49,90 $", null, null],
    ["$$49", null, null],
    ["USD 49", null, null],
    ["49,90 aprox", null, null],
    ["-49,90", null, null],
    ["+49", null, null],
    ["1e3", null, null],
    ["0x10", null, null],
    ["NaN", null, null],
    ["Infinity", null, null],
  ])("reads %j as es %s / en %s", (raw, es, en) => {
    for (const [lang, cents] of [["es", es], ["en", en]]) {
      const result = dollarsToCents(raw, lang);
      if (cents === null) {
        expect(result.error, lang).toBeTruthy();
        expect(result, lang).not.toHaveProperty("cents");
      } else {
        expect(result, lang).toEqual({ cents });
      }
    }
  });

  it("words the refusal in the viewer's language", () => {
    expect(dollarsToCents("abc", "es").error).toBe(
      "Ingresá un importe válido (por ejemplo, 12,50 o 1.250,00)",
    );
    expect(dollarsToCents("abc", "en").error).toBe("Enter a valid amount (e.g. 12.50 or 1,250.00)");
  });

  it("gets back every stored amount it wrote, in either language", () => {
    for (const cents of [0, 5, 99, 100, 1999, 4990, 123456, 100000000]) {
      for (const from of ["es", "en"]) {
        for (const to of ["es", "en"]) {
          expect(dollarsToCents(centsToInput(cents, from), to)).toEqual({ cents });
        }
      }
    }
  });
});

describe("49,90 read back", () => {
  it("shows with a comma in Spanish and a point in English", () => {
    expect(centsToCurrency(4990, "es")).toMatch(/^\$\s49,90$/);
    expect(centsToCurrency(4990, "en")).toBe("$49.90");
    expect(centsToInput(4990, "es")).toBe("49,90");
    expect(centsToInput(4990, "en")).toBe("49.90");
  });
});

describe("importedPriceToInput", () => {
  it("keeps file text and writes spreadsheet numbers with the viewer's separator", () => {
    expect(importedPriceToInput("$ 1.234,56", "es")).toBe("$ 1.234,56");
    expect(importedPriceToInput(undefined, "es")).toBe("");
    expect(importedPriceToInput(49.9, "es")).toBe("49,90");
    expect(importedPriceToInput(49.9, "en")).toBe("49.90");
    expect(importedPriceToInput(49.900000000000006, "es")).toBe("49,90");
    expect(importedPriceToInput(1500, "es")).toBe("1500,00");
  });

  it("never lets a number with three decimals turn into thousands", () => {
    for (const lang of ["es", "en"]) {
      expect(dollarsToCents(importedPriceToInput(1.234, lang), lang).error).toBeTruthy();
    }
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
