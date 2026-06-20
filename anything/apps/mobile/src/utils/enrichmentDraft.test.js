import {
  priceToCents,
  durationToMin,
  toServiceRows,
  rowToServiceBody,
} from "./enrichmentDraft";

// Pure mapping of the enrichment draft (ticket 2.83) → editable rows → services CRUD bodies.

describe("priceToCents", () => {
  it("parses currency strings and numbers; blank/garbage → null (no fake data)", () => {
    expect(priceToCents("$45.50")).toBe(4550);
    expect(priceToCents("45,50")).toBe(4550);
    expect(priceToCents(20)).toBe(2000);
    expect(priceToCents("")).toBeNull();
    expect(priceToCents("free")).toBeNull();
    expect(priceToCents(null)).toBeNull();
  });
});

describe("durationToMin", () => {
  it("extracts the first positive integer; else null", () => {
    expect(durationToMin("60")).toBe(60);
    expect(durationToMin("60 min")).toBe(60);
    expect(durationToMin("about 90 minutes")).toBe(90);
    expect(durationToMin("")).toBeNull();
    expect(durationToMin("n/a")).toBeNull();
  });
});

describe("toServiceRows", () => {
  it("drops nameless candidates and keeps editable strings, selected by default", () => {
    const rows = toServiceRows([
      { name: "Bath", price: "$20", duration: 30, description: "warm" },
      { name: "  ", price: "5" }, // nameless → dropped
      { price: "9" }, // no name → dropped
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: "Bath",
      price: "$20",
      duration: "30",
      description: "warm",
      selected: true,
    });
  });
});

describe("rowToServiceBody", () => {
  it("maps an edited row to the services POST body", () => {
    expect(
      rowToServiceBody({ name: " Bath ", price: "$20", duration: "30 min", description: " " }),
    ).toEqual({ name: "Bath", description: undefined, price_cents: 2000, duration_min: 30 });
  });
});
