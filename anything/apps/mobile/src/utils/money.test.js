import { formatMoney } from "./money";

test("prefixes the ISO code so the currency is never ambiguous", () => {
  expect(formatMoney(5000, "ARS")).toBe("ARS 50.00");
  expect(formatMoney(4900, "USD")).toBe("USD 49.00");
});

test("defaults to ARS when no currency is given (services carry no currency column)", () => {
  expect(formatMoney(3000)).toBe("ARS 30.00");
});

test("groups thousands", () => {
  expect(formatMoney(123456789, "ARS")).toBe("ARS 1,234,567.89");
});

test("returns null for missing amounts so callers can hide the price", () => {
  expect(formatMoney(null)).toBeNull();
  expect(formatMoney(undefined)).toBeNull();
  expect(formatMoney(NaN)).toBeNull();
});

test("normalizes lowercase currency codes", () => {
  expect(formatMoney(1000, "ars")).toBe("ARS 10.00");
});
