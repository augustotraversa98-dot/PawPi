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

    const surgeries = await sql`
      SELECT s.*, coalesce(up.full_name, up.username) AS created_by_name
      FROM pet_surgeries s
      LEFT JOIN user_profiles up ON up.id = s.created_by_user_id
      WHERE s.pet_id = ${petId} AND s.owner_user_id = ${gate.ownerUserId}
      ORDER BY s.surgery_date DESC
    `;

    return Response.json({ surgeries });
  } catch (error) {
    console.error("[Vet Record Surgeries] Error:", error);
    return Response.json(
      { error: "Failed to fetch surgeries" },
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
    const {
      petId,
      procedure,
      surgeryDate,
      surgeon,
      clinic,
      complications,
      recovery,
      notes,
    } = body;

    if (!petId || !procedure || !surgeryDate) {
      return Response.json(
        { error: "petId, procedure, and surgeryDate are required" },
        { status: 400 },
      );
    }

    const callerId = await resolveUserId(session.user.id);
    const gate = await resolvePetLogOwner(callerId, petId);
    if (gate.error) {
      return Response.json({ error: gate.error }, { status: gate.status });
    }

    const result = await sql`
      INSERT INTO pet_surgeries (
        pet_id, owner_user_id, procedure, surgery_date, surgeon, clinic,
        complications, recovery, notes, created_by_user_id, created_by_role
      ) VALUES (
        ${petId}, ${gate.ownerUserId}, ${procedure}, ${surgeryDate}, ${surgeon || null},
        ${clinic || null}, ${complications || null}, ${recovery || null}, ${notes || null},
        ${callerId}, ${gate.isOwner ? "owner" : "editor"}
      )
      RETURNING *
    `;

    return Response.json({ surgery: result[0] });
  } catch (error) {
    console.error("[Vet Record Surgeries] Error:", error);
    return Response.json(
      { error: "Failed to create surgery" },
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
      DELETE FROM pet_surgeries
      WHERE id = ${id} AND owner_user_id = ${ownerUserId}
    `;

    return Response.json({ success: true });
  } catch (error) {
    console.error("[Vet Record Surgeries] Error:", error);
    return Response.json(
      { error: "Failed to delete surgery" },
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
