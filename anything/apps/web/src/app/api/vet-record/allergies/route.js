import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { withRequestContext } from "@/app/api/utils/requestContext";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { resolvePetLogOwner } from "@/app/api/utils/petLogAccess";

// VR-B: reads/writes are gated by the shared owner-OR-family(Editor) path
// (resolvePetLogOwner). owner_user_id anchors to the pet's OWNER (shared storage/read
// key); created_by_user_id + created_by_role ('owner'|'editor', 0120) record who authored
// the row so the app can show "Added by {name} · {role} · {date}". A Viewer (non-family)
// gets 403 — matching the tables' RLS (0022 owner-private + 0049 family).

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

    const allergies = await sql`
      SELECT a.*, coalesce(up.full_name, up.username) AS created_by_name
      FROM pet_allergies a
      LEFT JOIN user_profiles up ON up.id = a.created_by_user_id
      WHERE a.pet_id = ${petId} AND a.owner_user_id = ${gate.ownerUserId}
      ORDER BY a.created_at DESC
    `;

    return Response.json({ allergies });
  } catch (error) {
    console.error("[Vet Record Allergies] Error:", error);
    return Response.json(
      { error: "Failed to fetch allergies" },
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
    const { petId, allergen, severity, reaction, diagnosedDate, notes } = body;

    if (!petId || !allergen) {
      return Response.json(
        { error: "petId and allergen are required" },
        { status: 400 },
      );
    }

    const callerId = await resolveUserId(session.user.id);
    const gate = await resolvePetLogOwner(callerId, petId);
    if (gate.error) {
      return Response.json({ error: gate.error }, { status: gate.status });
    }

    const result = await sql`
      INSERT INTO pet_allergies (
        pet_id, owner_user_id, allergen, severity, reaction, diagnosed_date, notes,
        created_by_user_id, created_by_role
      ) VALUES (
        ${petId}, ${gate.ownerUserId}, ${allergen}, ${severity || null},
        ${reaction || null}, ${diagnosedDate || null}, ${notes || null},
        ${callerId}, ${gate.isOwner ? "owner" : "editor"}
      )
      RETURNING *
    `;

    return Response.json({ allergy: result[0] });
  } catch (error) {
    console.error("[Vet Record Allergies] Error:", error);
    return Response.json(
      { error: "Failed to create allergy" },
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
      DELETE FROM pet_allergies
      WHERE id = ${id} AND owner_user_id = ${ownerUserId}
    `;

    return Response.json({ success: true });
  } catch (error) {
    console.error("[Vet Record Allergies] Error:", error);
    return Response.json(
      { error: "Failed to delete allergy" },
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
