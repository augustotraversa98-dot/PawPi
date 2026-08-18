import { describe, it, expect, vi, beforeEach } from "vitest";

// AI-1: the /extract route (night-run 2026-08-18d). Confirms the confirm-first contract — it WRITES
// NOTHING (applied:false), gates owner-OR-Editor (Viewer → 403), 503s when dormant, and fails soft
// (empty proposal, 200) on a bad file. The model itself is never hit — the extractor is mocked.

import { POST } from "./route";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { resolvePetLogOwner } from "@/app/api/utils/petLogAccess";
import { extractPetRecordsFromDocument } from "@/app/api/utils/enrichment/petRecords";
import { EnrichmentNotConfiguredError } from "@/app/api/utils/enrichment/config";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/currentUser", () => ({ resolveUserId: vi.fn() }));
vi.mock("@/app/api/utils/petLogAccess", () => ({ resolvePetLogOwner: vi.fn() }));
vi.mock("@/app/api/utils/enrichment/petRecords", () => ({
  extractPetRecordsFromDocument: vi.fn(),
}));

const post = (body) =>
  new Request("http://localhost/api/vet-record/documents/extract", {
    method: "POST",
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  resolveUserId.mockResolvedValue(7);
  resolvePetLogOwner.mockResolvedValue({ ownerUserId: 7, isOwner: true });
});

describe("POST /api/vet-record/documents/extract", () => {
  it("401 unauthenticated", async () => {
    auth.mockResolvedValue(undefined);
    expect((await POST(post({ petId: 3, url: "u" }))).status).toBe(401);
  });

  it("400 without petId", async () => {
    auth.mockResolvedValue({ user: { id: "a" } });
    expect((await POST(post({ url: "u" }))).status).toBe(400);
  });

  it("403 for a Viewer (non-owner, non-family)", async () => {
    auth.mockResolvedValue({ user: { id: "a" } });
    resolvePetLogOwner.mockResolvedValue({
      error: "Pet not found or access denied",
      status: 403,
    });
    const res = await POST(post({ petId: 3, url: "https://x/card.jpg" }));
    expect(res.status).toBe(403);
    expect(extractPetRecordsFromDocument).not.toHaveBeenCalled();
  });

  it("returns the proposal and writes nothing (applied:false)", async () => {
    auth.mockResolvedValue({ user: { id: "a" } });
    extractPetRecordsFromDocument.mockResolvedValue({
      docType: "vaccination_card",
      records: { vaccinations: [{ name: "Rabies" }] },
    });
    const res = await POST(
      post({ petId: 3, url: "https://x/card.jpg", filename: "card.jpg" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.applied).toBe(false);
    expect(body.docType).toBe("vaccination_card");
    expect(body.proposal.records.vaccinations).toHaveLength(1);
  });

  it("503 when dormant (no ANTHROPIC_API_KEY)", async () => {
    auth.mockResolvedValue({ user: { id: "a" } });
    extractPetRecordsFromDocument.mockRejectedValue(new EnrichmentNotConfiguredError());
    const res = await POST(post({ petId: 3, url: "https://x/card.jpg" }));
    expect(res.status).toBe(503);
  });

  it("fails soft (200 + empty proposal) on an unexpected extractor error", async () => {
    auth.mockResolvedValue({ user: { id: "a" } });
    extractPetRecordsFromDocument.mockRejectedValue(new Error("boom"));
    const res = await POST(post({ petId: 3, url: "https://x/card.jpg" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      proposal: { docType: "other", records: {} },
      docType: "other",
      applied: false,
    });
  });

  it("400 when neither url nor documentId is given", async () => {
    auth.mockResolvedValue({ user: { id: "a" } });
    expect((await POST(post({ petId: 3 }))).status).toBe(400);
  });
});
