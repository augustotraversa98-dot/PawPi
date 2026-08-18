import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { withRequestContext } from "@/app/api/utils/requestContext";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { resolvePetLogOwner } from "@/app/api/utils/petLogAccess";
import { extractPetRecordsFromDocument } from "@/app/api/utils/enrichment/petRecords";
import { EnrichmentNotConfiguredError } from "@/app/api/utils/enrichment/config";

// AI-1 (night-run 2026-08-18d): POST /api/vet-record/documents/extract — read a STORED pet document
// (photo or PDF) with Claude vision and return a PROPOSED record set. This route WRITES NOTHING —
// it returns { proposal, docType, applied:false } and the owner reviews/confirms in the app, which
// then creates each accepted record through the existing VR-B add routes (0120 attribution applies).
//
// Gated: owner-OR-Editor via resolvePetLogOwner (a Viewer gets 403); dormant (no ANTHROPIC_API_KEY)
// → 503; an unreadable/oversized/garbled file FAILS SOFT to an empty proposal (never a 500) so the
// stored file is never lost. Body: { petId, url, filename, mimeType } — or { petId, documentId }
// to look the stored file up by id.

async function POST(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    let { petId, url, filename, mimeType, documentId } = body || {};
    if (!petId) {
      return Response.json({ error: "petId is required" }, { status: 400 });
    }

    const callerId = await resolveUserId(session.user.id);
    const gate = await resolvePetLogOwner(callerId, petId);
    if (gate.error) {
      return Response.json({ error: gate.error }, { status: gate.status });
    }

    // Optional: resolve the stored file from a documentId (owner-scoped) when no url was passed.
    if (documentId && !url) {
      const [doc] = await sql`
        SELECT file_url, name, document_type
        FROM vet_documents
        WHERE id = ${documentId}
          AND pet_id = ${petId}
          AND owner_user_id = ${gate.ownerUserId}
      `;
      if (!doc) {
        return Response.json({ error: "Document not found" }, { status: 404 });
      }
      url = doc.file_url;
      filename = filename || doc.name;
    }

    if (!url) {
      return Response.json(
        { error: "url or documentId is required" },
        { status: 400 },
      );
    }

    const proposal = await extractPetRecordsFromDocument({ url, filename, mimeType });
    return Response.json({ proposal, docType: proposal.docType, applied: false });
  } catch (error) {
    // Dormant (no key) → clean 503; the extractor is the only thing that throws this.
    if (error instanceof EnrichmentNotConfiguredError || error?.status === 503) {
      return Response.json(
        { error: "Automatic reading isn't set up yet" },
        { status: 503 },
      );
    }
    // Never 500 on a bad file: the extractor already fails soft, but any other unexpected error
    // still degrades to an empty proposal so the stored document is never lost.
    console.error("[Vet Record Extract] Error:", error?.message);
    return Response.json(
      { proposal: { docType: "other", records: {} }, docType: "other", applied: false },
      { status: 200 },
    );
  }
}

// RLS R1-rollout: identity-scoped wrapper (docs/rls-hardening.md).
const wrappedPOST = withRequestContext(POST);
export { wrappedPOST as POST };
