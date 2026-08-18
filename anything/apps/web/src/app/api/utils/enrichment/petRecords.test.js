import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  detectMedia,
  normalizeRecords,
  extractPetRecordsFromDocument,
} from "./petRecords";
import { EnrichmentNotConfiguredError } from "./config";

// AI-1: the pet-document extractor (night-run 2026-08-18d). The model call + file fetch are injected
// via opts so nothing touches the network in CI. Proves: a vaccination card → a vaccination proposal
// mapped to the VR-B route columns; a lab report → lab rows; an unreadable file → an empty proposal
// (no throw); a dormant key → 503; and that no invented data survives normalization.

describe("detectMedia", () => {
  it("classifies PDFs, images, and rejects unknowns", () => {
    expect(detectMedia({ filename: "card.pdf" })).toEqual({
      kind: "pdf",
      mediaType: "application/pdf",
    });
    expect(detectMedia({ mimeType: "application/pdf" }).kind).toBe("pdf");
    expect(detectMedia({ filename: "photo.PNG" })).toEqual({
      kind: "image",
      mediaType: "image/png",
    });
    expect(detectMedia({ filename: "scan.jpg" }).kind).toBe("image");
    expect(detectMedia({ filename: "notes.txt" })).toBeNull();
    expect(detectMedia({})).toBeNull();
  });
});

describe("normalizeRecords (no invented data)", () => {
  it("maps rows to route columns and drops rows missing their key field", () => {
    const out = normalizeRecords({
      vaccinations: [
        { name: "Rabies", dateGiven: "2025-01-02", clinicName: "VetCo" },
        { dateGiven: "2025-01-02" }, // dropped — no name
      ],
      conditions: [{ condition: "" }], // dropped — blank
      visitNotes: [{ note: "Seen for limp", vetName: "Dr. Ruiz" }],
    });
    expect(out.vaccinations).toEqual([
      {
        name: "Rabies",
        dateGiven: "2025-01-02",
        expiresOn: null,
        clinicName: "VetCo",
        notes: null,
      },
    ]);
    expect(out.conditions).toBeUndefined();
    expect(out.visitNotes).toEqual([
      { vetName: "Dr. Ruiz", noteDate: null, note: "Seen for limp" },
    ]);
  });

  it("coerces the string 'null' and blanks to null", () => {
    const out = normalizeRecords({
      medications: [{ name: "Apoquel", dose: "null", frequency: "  " }],
    });
    expect(out.medications[0]).toEqual({
      name: "Apoquel",
      dose: null,
      frequency: null,
      prescribedBy: null,
      startDate: null,
      notes: null,
    });
  });
});

describe("extractPetRecordsFromDocument", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-key";
  });
  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_MODEL;
  });

  const okBytes = async () => Buffer.from("fake-image-bytes");

  it("a vaccination card → a vaccination proposal mapped to pet_vaccinations columns", async () => {
    const proposal = await extractPetRecordsFromDocument(
      { url: "https://x/card.jpg", filename: "card.jpg", mimeType: "image/jpeg" },
      {
        fetchBytes: okBytes,
        callModel: async () => ({
          docType: "vaccination_card",
          records: {
            vaccinations: [
              { name: "Rabies", dateGiven: "2025-01-02", expiresOn: "2028-01-02" },
            ],
          },
        }),
      },
    );
    expect(proposal.docType).toBe("vaccination_card");
    expect(proposal.records.vaccinations).toEqual([
      {
        name: "Rabies",
        dateGiven: "2025-01-02",
        expiresOn: "2028-01-02",
        clinicName: null,
        notes: null,
      },
    ]);
  });

  it("a lab report → lab-result rows", async () => {
    const proposal = await extractPetRecordsFromDocument(
      { url: "https://x/lab.pdf", filename: "lab.pdf", mimeType: "application/pdf" },
      {
        fetchBytes: okBytes,
        callModel: async () => ({
          docType: "lab_report",
          records: {
            labResults: [
              { testName: "BUN", testDate: "2025-03-01", results: "22 mg/dL (ref 7-27)" },
            ],
          },
        }),
      },
    );
    expect(proposal.docType).toBe("lab_report");
    expect(proposal.records.labResults[0]).toMatchObject({
      testName: "BUN",
      testDate: "2025-03-01",
      results: "22 mg/dL (ref 7-27)",
    });
  });

  it("an unreadable file fails soft → empty proposal (no throw)", async () => {
    const proposal = await extractPetRecordsFromDocument(
      { url: "https://x/gone.jpg", filename: "gone.jpg" },
      {
        fetchBytes: async () => {
          throw new Error("404");
        },
      },
    );
    expect(proposal).toEqual({ docType: "other", records: {} });
  });

  it("a model error fails soft → empty proposal (no throw)", async () => {
    const proposal = await extractPetRecordsFromDocument(
      { url: "https://x/card.jpg", filename: "card.jpg" },
      {
        fetchBytes: okBytes,
        callModel: async () => {
          throw new Error("anthropic 500");
        },
      },
    );
    expect(proposal).toEqual({ docType: "other", records: {} });
  });

  it("an unsupported file type → empty proposal", async () => {
    const proposal = await extractPetRecordsFromDocument(
      { url: "https://x/notes.txt", filename: "notes.txt" },
      { fetchBytes: okBytes },
    );
    expect(proposal).toEqual({ docType: "other", records: {} });
  });

  it("dormant (no ANTHROPIC_API_KEY) → throws EnrichmentNotConfiguredError (503)", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(
      extractPetRecordsFromDocument({ url: "https://x/card.jpg", filename: "card.jpg" }),
    ).rejects.toBeInstanceOf(EnrichmentNotConfiguredError);
  });
});
