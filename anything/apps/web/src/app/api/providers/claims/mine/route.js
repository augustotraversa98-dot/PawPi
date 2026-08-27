import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// GET /api/providers/claims/mine — the caller's claim history (drives the mobile
// "My claims" list). Public payload only — never surfaces `decided_by` (admin
// identity) or `evidence` (may contain the claimant's private phone/document).
//
// Each row also carries the provider's public name + slug so the client renders
// "You claimed <Name>" without a second round-trip. provider_claims' SELECT policy
// already scopes to the caller (or admin) so no explicit userId filter is needed
// on top of RLS — but we keep an explicit WHERE for clarity + a fast index.
async function GET(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = await resolveUserId(session.user.id);
    if (userId == null) {
      return Response.json({ claims: [] });
    }
    const claims = await sql`
      SELECT
        pc.id, pc.provider_id, pc.status, pc.method, pc.note,
        pc.created_at, pc.decided_at,
        p.name  AS provider_name,
        p.slug  AS provider_slug,
        p.provider_type
      FROM provider_claims pc
      JOIN providers p ON p.id = pc.provider_id
      WHERE pc.claimant_user_profile_id = ${userId}
      ORDER BY pc.created_at DESC
    `;
    return Response.json({ claims });
  } catch (error) {
    console.error("[GET /api/providers/claims/mine] Error:", error.message);
    return Response.json({ error: "Failed to list claims" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
