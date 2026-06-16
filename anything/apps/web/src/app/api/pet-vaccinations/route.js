import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// GET /api/pet-vaccinations?petId=... — OWNER-side read of a pet's vaccinations.
// Ticket 8 (docs/provider-design.md §4 item 8). This is the owner half that makes
// provider-written vaccinations immediately visible to the owner (vet_notes
// already has an owner GET; pet_vaccinations was missing one).
//
// OWNER-context route: authorization is pet ownership via the existing
// `WHERE owner_user_id = me` pattern — NOT assertCareAccess (that gates the
// provider side only). DB is porsager's tagged-template `sql`.
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

    const ownerUserId = await resolveUserId(session.user.id);
    if (ownerUserId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    const vaccinations = await sql`
      SELECT * FROM pet_vaccinations
      WHERE pet_id = ${petId}
        AND owner_user_id = ${ownerUserId}
        AND deleted_at IS NULL
      ORDER BY date_given DESC NULLS LAST, created_at DESC
    `;

    return Response.json({ vaccinations });
  } catch (error) {
    console.error("[GET /api/pet-vaccinations] Error:", error?.message);
    return Response.json(
      { error: "Failed to fetch vaccinations" },
      { status: 500 },
    );
  }
}

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md). Handler
// bodies are unchanged — only their DB connection is now request-scoped.
const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
