import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { withRequestContext } from "@/app/api/utils/requestContext";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { resolvePetLogOwner } from "@/app/api/utils/petLogAccess";

// VR-B: owner-OR-family(Editor) gated reads/writes with authorship attribution (0120).
// See vet-record/allergies/route.js for the shared rationale.

async function GET(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const petId = searchParams.get("petId");
    if (!petId) {
      return Response.json({ error: "petId is required" }, { status: 400 });
    }

    const callerId = await resolveUserId(session.user.id);
    const gate = await resolvePetLogOwner(callerId, petId);
    if (gate.error) {
      return Response.json({ error: gate.error }, { status: gate.status });
    }

    const documents = await sql`
      SELECT d.*, coalesce(up.full_name, up.username) AS created_by_name
      FROM vet_documents d
      LEFT JOIN user_profiles up ON up.id = d.created_by_user_id
      WHERE d.pet_id = ${petId} AND d.owner_user_id = ${gate.ownerUserId}
      ORDER BY d.document_date DESC NULLS LAST, d.created_at DESC
    `;

    return Response.json({ documents });
  } catch (error) {
    console.error("[Vet Record Documents] Error:", error);
    return Response.json(
      { error: "Failed to fetch documents" },
      { status: 500 },
    );
  }
}

async function POST(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { petId, name, documentType, fileUrl, documentDate, notes } = body;

    if (!petId || !name || !documentType || !fileUrl) {
      return Response.json(
        { error: "petId, name, documentType, and fileUrl are required" },
        { status: 400 },
      );
    }

    const callerId = await resolveUserId(session.user.id);
    const gate = await resolvePetLogOwner(callerId, petId);
    if (gate.error) {
      return Response.json({ error: gate.error }, { status: gate.status });
    }

    const result = await sql`
      INSERT INTO vet_documents (
        pet_id, owner_user_id, name, document_type, file_url, document_date, notes,
        created_by_user_id, created_by_role
      ) VALUES (
        ${petId}, ${gate.ownerUserId}, ${name}, ${documentType}, ${fileUrl},
        ${documentDate || null}, ${notes || null},
        ${callerId}, ${gate.isOwner ? "owner" : "editor"}
      )
      RETURNING *
    `;

    return Response.json({ document: result[0] });
  } catch (error) {
    console.error("[Vet Record Documents] Error:", error);
    return Response.json(
      { error: "Failed to create document" },
      { status: 500 },
    );
  }
}

async function DELETE(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return Response.json({ error: "id is required" }, { status: 400 });
    }

    const ownerUserId = await resolveUserId(session.user.id);
    if (ownerUserId === null) {
      return Response.json(
        { error: "User profile not found" },
        { status: 404 },
      );
    }

    await sql`
      DELETE FROM vet_documents
      WHERE id = ${id} AND owner_user_id = ${ownerUserId}
    `;

    return Response.json({ success: true });
  } catch (error) {
    console.error("[Vet Record Documents] Error:", error);
    return Response.json(
      { error: "Failed to delete document" },
      { status: 500 },
    );
  }
}

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md). Handler
// bodies are unchanged — only their DB connection is now request-scoped.
const wrappedGET = withRequestContext(GET);
const wrappedPOST = withRequestContext(POST);
const wrappedDELETE = withRequestContext(DELETE);
export { wrappedGET as GET, wrappedPOST as POST, wrappedDELETE as DELETE };
