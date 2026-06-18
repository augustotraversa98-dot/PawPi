import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// Self (DIY) training progress (ticket 2.45). Owner-scoped: completion of curriculum
// sessions (content lives in the app's static trainingCurriculum module) persisted per
// owner + pet. DISTINCT from the provider training tables (2.10).
//
//   GET  ?petId=  → the completed { program_key, session_key, completed_at } rows for a pet
//   POST { petId, programKey, sessionKey, completed } → mark complete (idempotent upsert) or
//         un-complete (delete). Returns the new completed state.

async function GET(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = await resolveUserId(session.user.id);
    if (!userId) return Response.json({ completed: [] });

    const { searchParams } = new URL(request.url);
    const petId = parseInt(searchParams.get("petId"));
    if (!Number.isInteger(petId)) {
      return Response.json({ error: "petId is required" }, { status: 400 });
    }

    const completed = await sql`
      SELECT program_key, session_key, completed_at
      FROM training_progress_self
      WHERE owner_user_id = ${userId} AND pet_id = ${petId}
      ORDER BY completed_at DESC
    `;

    return Response.json({ completed });
  } catch (error) {
    console.error("[GET /api/training/self-progress] Error:", error.message);
    return Response.json({ error: "Failed to load progress" }, { status: 500 });
  }
}

async function POST(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = await resolveUserId(session.user.id);
    if (!userId) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    const body = await request.json();
    const petId = parseInt(body.petId);
    const programKey = (body.programKey || "").trim();
    const sessionKey = (body.sessionKey || "").trim();
    const completed = body.completed !== false; // default true (mark complete)

    if (!Number.isInteger(petId) || !programKey || !sessionKey) {
      return Response.json(
        { error: "petId, programKey and sessionKey are required" },
        { status: 400 },
      );
    }

    // Ownership: the pet must belong to the caller (RLS also enforces owner-scoping on the
    // progress row, but this gives a clean 403 instead of a silent no-op insert).
    const pets = await sql`
      SELECT id FROM pets WHERE id = ${petId} AND owner_user_id = ${userId}
    `;
    if (pets.length === 0) {
      return Response.json({ error: "Pet not found or access denied" }, { status: 403 });
    }

    if (completed) {
      await sql`
        INSERT INTO training_progress_self (owner_user_id, pet_id, program_key, session_key)
        VALUES (${userId}, ${petId}, ${programKey}, ${sessionKey})
        ON CONFLICT (owner_user_id, pet_id, program_key, session_key) DO NOTHING
      `;
    } else {
      await sql`
        DELETE FROM training_progress_self
        WHERE owner_user_id = ${userId} AND pet_id = ${petId}
          AND program_key = ${programKey} AND session_key = ${sessionKey}
      `;
    }

    return Response.json({ programKey, sessionKey, completed }, { status: 200 });
  } catch (error) {
    console.error("[POST /api/training/self-progress] Error:", error.message);
    return Response.json({ error: "Failed to save progress" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
const wrappedPOST = withRequestContext(POST);
export { wrappedGET as GET, wrappedPOST as POST };
