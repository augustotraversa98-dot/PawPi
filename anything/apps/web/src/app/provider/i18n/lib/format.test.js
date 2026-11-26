import { describe, it, expect } from "vitest";
import {
  fill,
  formatDate,
  formatDateTime,
  formatMoney,
  formatMonth,
  formatNumber,
  formatTime,
  plural,
} from "./format";
import { providerTypeName, roleName, sectionName } from "./labels";

describe("fill and plural", () => {
  it("inserts values as text", () => {
    expect(fill("Hola {name}, {name}", { name: "$& {x}" })).toBe("Hola $& {x}, $& {x}");
    expect(fill("{a}-{b}", { a: 0 })).toBe("0-");
  });

  it("picks the form for the count", () => {
    const forms = { one: "{count} reseña", other: "{count} reseñas" };
    expect(plural(forms, 1, "es")).toBe("1 reseña");
    expect(plural(forms, 0, "es")).toBe("0 reseñas");
    expect(plural(forms, 1000000, "es")).toBe("1000000 reseñas");
    expect(plural({ one: "{count} review", other: "{count} reviews" }, 2, "en")).toBe("2 reviews");
  });
});

describe("numbers and money", () => {
  it("uses es-AR separators in Spanish", () => {
    expect(formatNumber(1234567.5, "es")).toBe("1.234.567,5");
    expect(formatNumber(1234567.5, "en")).toBe("1,234,567.5");
    expect(formatMoney(125000, "ARS", "es")).toBe("ARS 1.250,00");
    expect(formatMoney(125000, null, "en")).toBe("ARS 1,250.00");
  });
});

describe("dates and times", () => {
  it("writes a calendar day without shifting it", () => {
    expect(formatDate("2026-07-01", "es")).toBe("01/07/2026");
    expect(formatDate("2026-07-01", "en")).toBe("2026-07-01");
    expect(formatDate("2026-07-01", "es", { day: "numeric", month: "long" })).toBe("1 de julio");
    expect(formatDate("2026-07-01", "en", { day: "numeric", month: "long" })).toBe("1 July");
    expect(formatDate("", "es")).toBe("");
    expect(formatDate("not a date", "es")).toBe("");
  });

  it("reads an instant in the zone asked for, on a 24 h clock", () => {
    const zone = { timeZone: "America/Argentina/Buenos_Aires" };
    expect(formatDateTime("2026-07-02T01:30:00Z", "es", zone)).toBe("01/07/2026 · 22:30");
    expect(formatTime("2026-07-01T03:05:00Z", zone)).toBe("00:05");
    expect(formatTime("9:05:00")).toBe("09:05");
    expect(formatDateTime(null, "es")).toBe("");
  });

  it("writes a month", () => {
    expect(formatMonth("2026-07", "es")).toBe("07/2026");
    expect(formatMonth("2026-07", "en")).toBe("2026-07");
  });
});

describe("names of stored values", () => {
  it("translates the known ones and shows others as stored", () => {
    expect(providerTypeName("vet", "es")).toBe("Veterinaria");
    expect(providerTypeName("vet", "en")).toBe("vet");
    expect(providerTypeName("aquarium", "es")).toBe("aquarium");
    expect(providerTypeName("constructor", "es")).toBe("constructor");
    expect(roleName(undefined, "es")).toBeUndefined();
    expect(sectionName("Walking & Sitting", "es")).toBe("Paseos y cuidado");
  });
});
