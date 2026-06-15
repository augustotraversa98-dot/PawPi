import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";

// The caller's own PENDING provider invitations. Closes the c2c staff-accept gap:
// POST /api/providers/[id]/staff/accept can flip an invite to active, but an
// invited user had no way to DISCOVER their invites (GET /api/providers lists
// ACTIVE staff only). This is the "my invites" read.
//
// Owner/self context like the other owner-scoped routes (resolveUserId, then the
// query is scoped WHERE user_profile_id = me) — NOT requireProviderRole: the
// caller is not active staff yet, exactly the reasoning of the accept route. The
// scoped WHERE is the authorization: a user can only ever see their own invites.

export async function GET(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      // No profile row yet → no memberships of any kind. Empty, not an error,
      // mirroring GET /api/providers.
      return Response.json({ invites: [] });
    }

    // The caller's own 'invited' rows, LEFT JOINed to providers for display
    // (name/type/logo). Newest first.
    const invites = await sql`
      SELECT
        ps.id,
        ps.provider_id,
        ps.role,
        ps.status,
        ps.created_at,
        p.name AS provider_name,
        p.provider_type,
        p.logo_url
      FROM provider_staff ps
      LEFT JOIN providers p ON p.id = ps.provider_id
      WHERE ps.user_profile_id = ${userId}
        AND ps.status = 'invited'
      ORDER BY ps.created_at DESC
    `;

    return Response.json({ invites });
  } catch (error) {
    console.error("[GET /api/provider-invites] Error:", error.message);
    return Response.json(
      { error: "Failed to list invites" },
      { status: 500 },
    );
  }
}
