import { formatMoney } from "./money";

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
