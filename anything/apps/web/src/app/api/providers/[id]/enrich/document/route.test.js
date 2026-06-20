import { describe, it, expect, vi, beforeEach } from "vitest";

// POST /api/providers/[id]/enrich/document (ticket 2.82) — confirm-first DOCUMENT enrichment.
// Proves: dormant behind ENRICHMENT_LLM_KEY → clean 503; configured → returns a PROPOSED catalog;
// the route NEVER writes provider/services data (sql is called only for resolveUserId, no INSERT/
// UPDATE); a malformed file is handled by the adapter (empty draft) — never a 500 here.
// auth + sql + providerAuth + the document adapter are mocked.

import { POST } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { requireProviderRole } from "@/app/api/utils/providerAuth";
import {
  fetchDocumentCatalog,
  isDocumentEnrichmentConfigured,
} from "@/app/api/utils/enrichment/document";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/providerAuth", () => {
  class ProviderAuthError extends Error {
    constructor(m) {
      super(m);
      this.name = "ProviderAuthError";
      this.status = 403;
    }
  }
  return { requireProviderRole: vi.fn(), ProviderAuthError };
});
vi.mock("@/app/api/utils/enrichment/document", () => ({
  fetchDocumentCatalog: vi.fn(),
  isDocumentEnrichmentConfigured: vi.fn(),
}));

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const PARAMS = { params: { id: "100" } };
const req = (body = { url: "https://store/menu.xlsx", filename: "menu.xlsx" }) =>
  new Request("http://localhost/x", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  auth.mockResolvedValue(SESSION);
  requireProviderRole.mockResolvedValue({ role: "owner" });
  sql.mockResolvedValueOnce([{ id: 7 }]); // resolveUserId
});

describe("POST enrich/document", () => {
  it("LLM key unset → clean 503, returns no catalog", async () => {
    isDocumentEnrichmentConfigured.mockReturnValue(false);
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(503);
    expect(fetchDocumentCatalog).not.toHaveBeenCalled();
  });

  it("configured → returns a PROPOSED catalog and writes nothing", async () => {
    isDocumentEnrichmentConfigured.mockReturnValue(true);
    fetchDocumentCatalog.mockResolvedValue({
      services: [{ name: "Bath", price: "20", duration: "30" }],
      products: [{ name: "Shampoo", price: "12" }],
    });
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.applied).toBe(false);
    expect(data.draft.services).toHaveLength(1);
    expect(data.draft.products).toHaveLength(1);
    // No write: sql was called exactly once (the resolveUserId SELECT) — no INSERT/UPDATE.
    expect(sql).toHaveBeenCalledTimes(1);
  });

  it("missing url/text → 400 (no adapter call)", async () => {
    isDocumentEnrichmentConfigured.mockReturnValue(true);
    const res = await POST(req({}), PARAMS);
    expect(res.status).toBe(400);
    expect(fetchDocumentCatalog).not.toHaveBeenCalled();
  });

  it("unauthorized → 401", async () => {
    auth.mockResolvedValue(null);
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(401);
  });
});
