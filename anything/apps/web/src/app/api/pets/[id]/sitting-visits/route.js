import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// GET /api/pets/[id]/sitting-visits — the OWNER reads their pet's SITTING VISIT updates
// (status + notes + photos/video + optional location check-in), posted by the sitter.
// Phase 2 ticket 2.9 (docs/phase2-tickets/2.9-sitting.md).
//
// This is an OWNER-context route: authorization is pet OWNERSHIP (WHERE owner_user_id =
// me), NOT provider_staff membership — so it uses resolveUserId, never
// requireProviderCapability / assertCareAccess. sitting_visits RLS (0035) also enforces
// the owner FOR ALL policy as the last line. The owner is the only side that books; the
// sitter (a participant) posts updates the owner reads here.
//
// DB is porsager's tagged-template `sql` (SCHEMA_NOTES "neon→porsager"): every query is a
// tagged template; params bind via `${}`. Empty → empty array (the UI shows an empty state).
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

    // I must OWN the pet — cannot read another owner's visits.
    const petCheck = await sql`
      SELECT id FROM pets WHERE id = ${petId} AND owner_user_id = ${userId}
    `;
    if (petCheck.length === 0) {
      return Response.json(
        { error: "Pet not found or access denied" },
        { status: 403 },
      );
    }

    // The visits + the provider name for labelling. Newest first.
    const visits = await sql`
      SELECT
        sv.id, sv.booking_id, sv.pet_id, sv.owner_user_id, sv.provider_id,
        sv.staff_user_id, sv.visit_at, sv.status, sv.notes,
        sv.photo_urls, sv.video_urls, sv.check_in_lat, sv.check_in_lng,
        sv.created_at,
        p.name AS provider_name,
        COALESCE(up.full_name, up.username) AS sitter_name
      FROM sitting_visits sv
      LEFT JOIN providers p ON p.id = sv.provider_id
      LEFT JOIN user_profiles up ON up.id = sv.staff_user_id
      WHERE sv.pet_id = ${petId}
        AND sv.owner_user_id = ${userId}
      ORDER BY COALESCE(sv.visit_at, sv.created_at) DESC, sv.id DESC
    `;

    return Response.json({ visits });
  } catch (error) {
    console.error("[GET /api/pets/[id]/sitting-visits] Error:", error?.message);
    return Response.json(
      { error: "Failed to fetch sitting visits" },
      { status: 500 },
    );
  }
}

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md). Handler bodies are
// unchanged — only their DB connection is now request-scoped.
const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
