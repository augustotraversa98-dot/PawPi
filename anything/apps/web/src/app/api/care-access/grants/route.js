import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// GET /api/care-access/grants — the OWNER's trust view: who has (or requested)
// access to which of my pets. Ticket 7 (docs/provider-design.md §2 + §4 item 7).
//
// This is an OWNER-context route, NOT a provider one: authorization is the
// caller's own identity (WHERE owner_user_id = me), exactly like every other
// owner-data route. It does NOT use requireProviderRole. Another owner's grants
// are invisible because they never match the WHERE clause.
//
// Returns the grant rows joined with the provider name + pet name so the trust UI
// can render "Dr. Smith — Rex" without extra lookups. Optional ?petId / ?status
// filters narrow the list. Newest first.
//
// DB is porsager's tagged-template `sql` (SCHEMA_NOTES "neon→porsager"): every
// query is a tagged template; params bind via `${}`. The optional filters are
// expressed as tagged-template booleans (never sql(string, array)).
async function GET(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const petId = searchParams.get("petId");
    const status = searchParams.get("status");

    // Owner scope is the hard gate (WHERE owner_user_id = me). The optional
    // filters are folded in with `(${filter} IS NULL OR col = ${filter})` so a
    // single tagged template handles every combination without sql(string,array).
    const grants = await sql`
      SELECT
        g.id,
        g.pet_id,
        g.owner_user_id,
        g.provider_id,
        g.scopes,
        g.status,
        g.requested_by,
        g.booking_id,
        g.granted_at,
        g.expires_at,
        g.revoked_at,
        g.created_at,
        g.updated_at,
        pr.name AS provider_name,
        p.name AS pet_name
      FROM care_access_grants g
      LEFT JOIN providers pr ON pr.id = g.provider_id
      LEFT JOIN pets p ON p.id = g.pet_id
      WHERE g.owner_user_id = ${userId}
        AND (${petId}::int IS NULL OR g.pet_id = ${petId}::int)
        AND (${status}::text IS NULL OR g.status = ${status}::text)
      ORDER BY g.created_at DESC
    `;

    return Response.json({ grants });
  } catch (error) {
    console.error("[GET /api/care-access/grants] Error:", error.message);
    return Response.json(
      { error: "Failed to fetch grants" },
      { status: 500 },
    );
  }
}

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md). Handler
// bodies are unchanged — only their DB connection is now request-scoped.
const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
