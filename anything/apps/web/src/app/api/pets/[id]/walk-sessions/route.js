import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// GET /api/pets/[id]/walk-sessions — the OWNER reads their pet's walk sessions: the LIVE
// MAP (an in_progress session's growing route, polled) + the finished walk reports. Phase
// 2 ticket 2.7 (docs/phase2-tickets/2.7-walking-gps.md).
//
// This is an OWNER-context route: authorization is pet OWNERSHIP (WHERE owner_user_id =
// me), NOT provider_staff membership — so it uses resolveUserId, never
// requireProviderCapability / assertCareAccess. walk_sessions RLS (0033) also enforces the
// owner FOR ALL policy as the last line. Optional ?status=in_progress isolates the live
// session for the map; default returns all (newest first). Empty → empty array (empty
// state, no fake routes/data).
//
// DB is porsager's tagged-template `sql` (SCHEMA_NOTES "neon→porsager"): every query is a
// tagged template; params bind via `${}`.
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

    // I must OWN the pet — cannot read another owner's walk sessions (or their live
    // location).
    const petCheck = await sql`
      SELECT id FROM pets WHERE id = ${petId} AND owner_user_id = ${userId}
    `;
    if (petCheck.length === 0) {
      return Response.json(
        { error: "Pet not found or access denied" },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    // Join the provider + walker name so the live map / report can label the walk. Two
    // tagged-template variants for the optional ?status= filter (never sql(string, array)).
    const sessions = status
      ? await sql`
          SELECT
            ws.id, ws.booking_id, ws.pet_id, ws.provider_id, ws.staff_user_id,
            ws.status, ws.started_at, ws.ended_at, ws.distance_m, ws.duration_s,
            ws.route, ws.potty_pee, ws.potty_poo, ws.notes, ws.photo_urls,
            ws.created_at,
            p.name AS provider_name,
            COALESCE(up.full_name, up.username) AS walker_name
          FROM walk_sessions ws
          LEFT JOIN providers p ON p.id = ws.provider_id
          LEFT JOIN user_profiles up ON up.id = ws.staff_user_id
          WHERE ws.pet_id = ${petId}
            AND ws.owner_user_id = ${userId}
            AND ws.status = ${status}
          ORDER BY ws.created_at DESC
        `
      : await sql`
          SELECT
            ws.id, ws.booking_id, ws.pet_id, ws.provider_id, ws.staff_user_id,
            ws.status, ws.started_at, ws.ended_at, ws.distance_m, ws.duration_s,
            ws.route, ws.potty_pee, ws.potty_poo, ws.notes, ws.photo_urls,
            ws.created_at,
            p.name AS provider_name,
            COALESCE(up.full_name, up.username) AS walker_name
          FROM walk_sessions ws
          LEFT JOIN providers p ON p.id = ws.provider_id
          LEFT JOIN user_profiles up ON up.id = ws.staff_user_id
          WHERE ws.pet_id = ${petId}
            AND ws.owner_user_id = ${userId}
          ORDER BY ws.created_at DESC
        `;

    return Response.json({ sessions });
  } catch (error) {
    console.error("[GET /api/pets/[id]/walk-sessions] Error:", error?.message);
    return Response.json(
      { error: "Failed to fetch walk sessions" },
      { status: 500 },
    );
  }
}

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md). Handler bodies are
// unchanged — only their DB connection is now request-scoped.
const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
