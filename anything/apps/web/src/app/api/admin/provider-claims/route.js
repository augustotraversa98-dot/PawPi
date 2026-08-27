import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// GET /api/admin/provider-claims — the admin review queue (0125). Admin-only.
// provider_claims' SELECT policy already opens to admins (app_is_admin), so this
// route reads under normal pawpi_app identity — no DEFINER helper needed.
//
// Query params:
//   ?status=pending|approved|rejected|withdrawn|all   (default: 'pending')
//
// Each row is enriched with the target's public identity (provider name/slug/type)
// and the claimant's public handle so the admin console renders a triage card
// without a client-side scan.
async function GET(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = await resolveUserId(session.user.id);
    if (userId == null) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    const [{ is_admin }] = await sql`SELECT app_is_admin() AS is_admin`;
    if (!is_admin) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get("status") ?? "pending";
    const status = statusParam === "all" ? null : statusParam;

    const claims = await sql`
      SELECT
        pc.id, pc.provider_id, pc.claimant_user_profile_id, pc.status,
        pc.method, pc.note, pc.evidence, pc.created_at, pc.decided_at, pc.decided_by,
        p.name          AS provider_name,
        p.slug          AS provider_slug,
        p.provider_type AS provider_type,
        p.claim_status  AS provider_claim_status,
        up.username     AS claimant_username,
        up.full_name    AS claimant_full_name
      FROM provider_claims pc
      JOIN providers p    ON p.id = pc.provider_id
      JOIN user_profiles up ON up.id = pc.claimant_user_profile_id
      WHERE (${status}::text IS NULL OR pc.status = ${status})
      ORDER BY pc.created_at DESC
    `;
    return Response.json({ claims });
  } catch (error) {
    console.error("[GET /api/admin/provider-claims] Error:", error.message);
    return Response.json({ error: "Failed to load claim queue" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
