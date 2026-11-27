import { formatMoney, numberToMoneyInput, parseMoneyToCents } from "./money";

test("ARS shows a bare $ with es-AR grouping, decimals hidden when whole", () => {
  expect(formatMoney(5000, "ARS")).toBe("$50");
  expect(formatMoney(150000, "ARS")).toBe("$1.500");
  expect(formatMoney(123456789, "ARS")).toBe("$1.234.567,89");
});

test("ARS keeps cents only when non-zero, using a comma decimal", () => {
  expect(formatMoney(150050, "ARS")).toBe("$1.500,50");
  expect(formatMoney(99, "ARS")).toBe("$0,99");
});

test("defaults to ARS when no currency is given (services carry no currency column)", () => {
  expect(formatMoney(3000)).toBe("$30");
  expect(formatMoney(3000, "ars")).toBe("$30");
});

test("a non-ARS currency keeps the ISO prefix so it is never mistaken for pesos", () => {
  expect(formatMoney(4900, "USD")).toBe("USD 49.00");
  expect(formatMoney(123456789, "USD")).toBe("USD 1,234,567.89");
});

test("returns null for missing amounts so callers can hide the price", () => {
  expect(formatMoney(null)).toBeNull();
  expect(formatMoney(undefined)).toBeNull();
  expect(formatMoney(NaN)).toBeNull();
});

// --- typed amounts -----------------------------------------------------------

// typed text → cents in es-AR and en-US; null = refused. Mirrors the web panel's table (app/provider/lib/money.test).
test.each([
  ["49,90", 4990, 4990],
  ["49.90", 4990, 4990],
  ["49,9", 4990, 4990],
  ["0,05", 5, 5],
  [",50", 50, 50],
  ["007", 700, 700],
  ["$ 49,90", 4990, 4990],
  ["  $49.90  ", 4990, 4990],
  ["$ 49,90", 4990, 4990],
  ["1.234,56", 123456, 123456],
  ["1,234.56", 123456, 123456],
  ["12.345.678,90", 1234567890, 1234567890],
  ["1.234.567", 123456700, 123456700],
  ["1,234,567", 123456700, 123456700],
  ["1.234", 123400, null],
  ["1,234", null, 123400],
  ["49,905", null, 4990500],
  ["49.905", 4990500, null],
  // the old integer limit is an ordinary price now; the limit is $999.999.999.999,99
  ["21474836,48", 2147483648, 2147483648],
  ["25.000.000", 2500000000, 2500000000],
  ["1.000.000.000,50", 100000000050, 100000000050],
  ["999999999999,99", 99999999999999, 99999999999999],
  ["1000000000000", null, null],
  ["49,9050", null, null],
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
  ["1.234,56,7", null, null],
  ["49 90", null, null],
  ["49,90 $", null, null],
  ["USD 49", null, null],
  ["$45 - $60", null, null],
  ["-49,90", null, null],
  ["1e3", null, null],
  ["free", null, null],
])("reads %j as es %s / en %s", (raw, es, en) => {
  for (const [lang, cents] of [["es", es], ["es-AR", es], ["en", en], ["en-US", en]]) {
    expect([lang, parseMoneyToCents(raw, lang)]).toEqual([
      lang,
      cents === null ? { invalid: true } : { cents },
    ]);
  }
});

test("blank is not an amount and not an error", () => {
  for (const raw of ["", "   ", null, undefined]) {
    expect(parseMoneyToCents(raw, "es")).toEqual({ cents: undefined });
  }
});

test("with no language to read, separators are the app's fallback (Spanish)", () => {
  expect(parseMoneyToCents("1.500")).toEqual({ cents: 150000 });
});

test("49,90 round-trips: typed, stored as 4990, read back with a comma", () => {
  const { cents } = parseMoneyToCents("49,90", "es");
  expect(cents).toBe(4990);
  expect(formatMoney(cents, "ARS")).toBe("$49,90");
});

test("an imported number is written with the viewer's separator and never turns into thousands", () => {
  expect(numberToMoneyInput(49.9, "es")).toBe("49,90");
  expect(numberToMoneyInput(49.9, "en")).toBe("49.90");
  for (const lang of ["es", "en"]) {
    expect(parseMoneyToCents(numberToMoneyInput(1.234, lang), lang)).toEqual({ invalid: true });
  }
});

// parseFloat("49,90") is 49: the bug this module exists to prevent.
test("no screen turns typed text into cents with parseFloat or Number", () => {
  const fs = require("fs");
  const path = require("path");
  const root = path.join(__dirname, "..");
  const walk = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      return /\.(js|jsx|ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name) ? [full] : [];
    });
  const files = walk(root);
  expect(files.length).toBeGreaterThan(200);
  const handParsed = /Math\.round\(\s*parseFloat\(|parseFloat\([^()]*(price|amount|fee|cents|premium|deposit)/i;
  expect(files.filter((file) => handParsed.test(fs.readFileSync(file, "utf8")))).toEqual([]);
});
