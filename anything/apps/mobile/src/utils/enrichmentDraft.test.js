import {
  priceToCents,
  hasInvalidPrice,
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

describe("prices in the viewer's separators", () => {
  it("reads thousands instead of cutting them off", () => {
    expect(priceToCents("1.500", "es")).toBe(150000);
    expect(priceToCents("1.234,56", "es")).toBe(123456);
    expect(priceToCents("1,234.56", "en")).toBe(123456);
  });

  it("flags a selected, named row whose price has no single reading", () => {
    const row = { name: "Bath", price: "$45 - $60", selected: true };
    expect(hasInvalidPrice(row, "es")).toBe(true);
    expect(priceToCents(row.price, "es")).toBeNull();
    expect(hasInvalidPrice({ ...row, selected: false }, "es")).toBe(false);
    expect(hasInvalidPrice({ ...row, name: " " }, "es")).toBe(false);
    expect(hasInvalidPrice({ ...row, price: "" }, "es")).toBe(false);
  });

  it("writes a spreadsheet number with the viewer's separator", () => {
    const [row] = toServiceRows([{ name: "Bath", price: 49.9 }], "es");
    expect(row.price).toBe("49,90");
    expect(rowToServiceBody(row, "es").price_cents).toBe(4990);
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
