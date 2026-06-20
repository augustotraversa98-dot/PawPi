import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import {
  requireProviderRole,
  ProviderAuthError,
} from "@/app/api/utils/providerAuth";
import { withRequestContext } from "@/app/api/utils/requestContext";
import { EnrichmentNotConfiguredError } from "@/app/api/utils/enrichment/config";
import {
  fetchDocumentCatalog,
  isDocumentEnrichmentConfigured,
} from "@/app/api/utils/enrichment/document";

// POST /api/providers/[id]/enrich/document — CONFIRM-FIRST document enrichment (Phase 2 ticket 2.82).
//
// owner|admin uploads a price-list/menu (PDF or Excel/CSV) through the existing provider Storage
// path; the client passes the stored file's { url, filename, mimeType } here. We fetch the file as
// TRANSIENT input, extract + STRUCTURE it into a PROPOSED { services, products } catalog, and return
// it. This route writes NOTHING — the provider reviews the draft in the same confirm-first panel as
// 2.21 and applies each row through the EXISTING owner-identity services/products CRUD routes (RLS +
// validation apply). The file is not attached to the provider unless they choose to elsewhere.
//
// Dormant behind ENRICHMENT_LLM_KEY (the FLAG reuses the existing go-live key): unset → clean 503
// ("not set up yet"). A malformed/unreadable file FAILS SOFT — an empty draft, never a 500.
async function POST(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    const providerId = params.id;
    // owner|admin only — same gate as the CRUD routes the provider applies the draft through.
    await requireProviderRole(providerId, userId);

    // Dormant: structuring messy documents needs the LLM key. Unset → clean 503 (no crash).
    if (!isDocumentEnrichmentConfigured()) {
      throw new EnrichmentNotConfiguredError();
    }

    const body = (await request.json().catch(() => ({}))) ?? {};
    const { url, filename, mimeType } = body;
    if (!url && !body.text) {
      return Response.json(
        { error: "A document url is required" },
        { status: 400 },
      );
    }

    // PROPOSAL ONLY — the catalog is returned for review; nothing is written.
    const catalog = await fetchDocumentCatalog({
      url,
      filename,
      mimeType,
      text: body.text,
    });

    return Response.json({
      draft: { services: catalog.services, products: catalog.products },
      sources: { document: filename || url ? "ok" : "none" },
      applied: false,
    });
  } catch (e) {
    if (e instanceof EnrichmentNotConfiguredError || e.status === 503) {
      return Response.json({ error: e.message }, { status: 503 });
    }
    if (e instanceof ProviderAuthError || e.status === 403) {
      return Response.json({ error: e.message }, { status: e.status ?? 403 });
    }
    console.error("[POST /api/providers/[id]/enrich/document] Error:", e?.message);
    return Response.json({ error: "Failed to read document" }, { status: 500 });
  }
}

const wrappedPOST = withRequestContext(POST);
export { wrappedPOST as POST };
