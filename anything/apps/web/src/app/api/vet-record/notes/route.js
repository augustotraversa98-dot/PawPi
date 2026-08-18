import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { withRequestContext } from "@/app/api/utils/requestContext";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { resolvePetLogOwner } from "@/app/api/utils/petLogAccess";

// VR-B: owner-OR-family(Editor) gated reads/writes with authorship attribution (0120).
// vet_notes gained a family policy in 0120 so an Editor can append a clinical note too.
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

    const notes = await sql`
      SELECT n.*, coalesce(up.full_name, up.username) AS created_by_name
      FROM vet_notes n
      LEFT JOIN user_profiles up ON up.id = n.created_by_user_id
      WHERE n.pet_id = ${petId} AND n.owner_user_id = ${gate.ownerUserId}
      ORDER BY n.note_date DESC
    `;

    return Response.json({ notes });
  } catch (error) {
    console.error("[Vet Record Notes] Error:", error);
    return Response.json({ error: "Failed to fetch notes" }, { status: 500 });
  }
}

async function POST(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { petId, vetName, noteDate, note, appointmentId } = body;

    if (!petId || !noteDate || !note) {
      return Response.json(
        { error: "petId, noteDate, and note are required" },
        { status: 400 },
      );
    }

    const callerId = await resolveUserId(session.user.id);
    const gate = await resolvePetLogOwner(callerId, petId);
    if (gate.error) {
      return Response.json({ error: gate.error }, { status: gate.status });
    }

    const result = await sql`
      INSERT INTO vet_notes (
        pet_id, owner_user_id, vet_name, note_date, note, appointment_id,
        created_by_user_id, created_by_role
      ) VALUES (
        ${petId}, ${gate.ownerUserId}, ${vetName || null}, ${noteDate}, ${note},
        ${appointmentId || null},
        ${callerId}, ${gate.isOwner ? "owner" : "editor"}
      )
      RETURNING *
    `;

    return Response.json({ note: result[0] });
  } catch (error) {
    console.error("[Vet Record Notes] Error:", error);
    return Response.json({ error: "Failed to create note" }, { status: 500 });
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
      DELETE FROM vet_notes
      WHERE id = ${id} AND owner_user_id = ${ownerUserId}
    `;

    return Response.json({ success: true });
  } catch (error) {
    console.error("[Vet Record Notes] Error:", error);
    return Response.json({ error: "Failed to delete note" }, { status: 500 });
  }
}

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md). Handler
// bodies are unchanged — only their DB connection is now request-scoped.
const wrappedGET = withRequestContext(GET);
const wrappedPOST = withRequestContext(POST);
const wrappedDELETE = withRequestContext(DELETE);
export { wrappedGET as GET, wrappedPOST as POST, wrappedDELETE as DELETE };
