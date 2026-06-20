import { describe, it, expect } from "vitest";
import {
  detectDocumentKind,
  rowsToCatalog,
  fetchDocumentCatalog,
} from "./document";

// The document enrichment adapter (ticket 2.82): extract a PDF/XLSX/CSV into a PROPOSED
// { services, products } catalog. Heavy parsers are mocked via injected extractors so this stays
// fast + deterministic. Proves: tabular rows → catalog (no LLM); PDF text → catalog via an injected
// LLM; missing LLM → only plain parsing (PDF yields nothing, no fake data); malformed → empty draft.

describe("detectDocumentKind", () => {
  it("classifies by extension then mime", () => {
    expect(detectDocumentKind({ filename: "menu.csv" })).toBe("csv");
    expect(detectDocumentKind({ filename: "prices.xlsx" })).toBe("xlsx");
    expect(detectDocumentKind({ filename: "list.PDF" })).toBe("pdf");
    expect(detectDocumentKind({ mimeType: "application/pdf" })).toBe("pdf");
    expect(detectDocumentKind({ filename: "notes.txt" })).toBe("unknown");
  });
});

describe("rowsToCatalog", () => {
  it("maps header aliases and splits service (has duration) vs product", () => {
    const { services, products } = rowsToCatalog([
      { Service: "Full groom", Price: "$45", Duration: "60", Notes: "incl. nails" },
      { Item: "Dog shampoo", Cost: "12" },
      { foo: "no name row" }, // dropped — no name
    ]);
    expect(services).toEqual([
      { name: "Full groom", price: "$45", duration: "60", description: "incl. nails" },
    ]);
    expect(products).toEqual([
      { name: "Dog shampoo", price: "12", description: undefined },
    ]);
  });
});

describe("fetchDocumentCatalog", () => {
  it("XLSX rows yield a proposed catalog (no LLM key needed)", async () => {
    const draft = await fetchDocumentCatalog(
      { filename: "prices.xlsx" },
      {
        extractors: {
          xlsx: async () => ({
            rows: [{ Service: "Bath", Price: "20", Duration: "30" }],
          }),
        },
      },
    );
    expect(draft.services).toEqual([
      { name: "Bath", price: "20", duration: "30", description: undefined },
    ]);
    expect(draft.products).toEqual([]);
  });

  it("PDF text yields a catalog when an LLM structurer is injected", async () => {
    const draft = await fetchDocumentCatalog(
      { filename: "menu.pdf" },
      {
        extractors: { pdf: async () => ({ text: "Grooming $40, Nail trim $10" }) },
        llm: async () => ({
          services: [{ name: "Grooming", price: "40" }],
          products: [{ name: "Nail trim", price: "10" }],
        }),
      },
    );
    expect(draft.services).toEqual([{ name: "Grooming", price: "40" }]);
    expect(draft.products).toEqual([{ name: "Nail trim", price: "10" }]);
  });

  it("PDF text with NO LLM proposes nothing (no fake data)", async () => {
    const draft = await fetchDocumentCatalog(
      { filename: "menu.pdf" },
      { extractors: { pdf: async () => ({ text: "Grooming $40" }) } },
    );
    expect(draft).toEqual({ services: [], products: [] });
  });

  it("a malformed/unreadable file fails soft → empty draft, no throw", async () => {
    const draft = await fetchDocumentCatalog(
      { filename: "broken.csv" },
      {
        extractors: {
          csv: async () => {
            throw new Error("corrupt");
          },
        },
      },
    );
    expect(draft).toEqual({ services: [], products: [] });
  });

  it("unknown file type → empty draft", async () => {
    expect(await fetchDocumentCatalog({ filename: "x.txt" })).toEqual({
      services: [],
      products: [],
    });
  });
});
