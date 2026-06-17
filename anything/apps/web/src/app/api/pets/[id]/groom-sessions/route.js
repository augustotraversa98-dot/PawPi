import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// GET /api/pets/[id]/groom-sessions — the OWNER reads their pet's grooming sessions,
// so the before/after photos + coat/skin notes surface on the PET PROFILE. Phase 2
// ticket 2.6 (docs/phase2-tickets/2.6-grooming.md).
//
// This is an OWNER-context route: authorization is pet OWNERSHIP (WHERE owner_user_id =
// me), NOT provider_staff membership — so it uses resolveUserId, never
// requireProviderRole / assertCareAccess. groom_sessions RLS (0032) also enforces the
// owner FOR ALL policy as the last line. Newest session first.
//
// DB is porsager's tagged-template `sql` (SCHEMA_NOTES "neon→porsager"): every query is
// a tagged template; params bind via `${}`.
async function GET(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const petId = params.id;
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    // I must OWN the pet — cannot read another owner's grooming sessions.
    const petCheck = await sql`
      SELECT id FROM pets WHERE id = ${petId} AND owner_user_id = ${userId}
    `;
    if (petCheck.length === 0) {
      return Response.json(
        { error: "Pet not found or access denied" },
        { status: 403 },
      );
    }

    // Join the provider name so the profile can label each session's groomer. Newest
    // first. Empty → empty array (the UI shows an empty state, no fake data).
    const sessions = await sql`
      SELECT
        gs.id,
        gs.booking_id,
        gs.pet_id,
        gs.provider_id,
        gs.before_urls,
        gs.after_urls,
        gs.coat_skin_notes,
        gs.products_used,
        gs.next_due_at,
        gs.created_at,
        p.name AS provider_name
      FROM groom_sessions gs
      LEFT JOIN providers p ON p.id = gs.provider_id
      WHERE gs.pet_id = ${petId}
        AND gs.owner_user_id = ${userId}
      ORDER BY gs.created_at DESC
    `;

    return Response.json({ sessions });
  } catch (error) {
    console.error(
      "[GET /api/pets/[id]/groom-sessions] Error:",
      error?.message,
    );
    return Response.json(
      { error: "Failed to fetch groom sessions" },
      { status: 500 },
    );
  }
}

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md). Handler
// bodies are unchanged — only their DB connection is now request-scoped.
const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
