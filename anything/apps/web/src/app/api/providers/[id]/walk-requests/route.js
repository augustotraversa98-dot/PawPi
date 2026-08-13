import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import {
  requireProviderRole,
  requireProviderCapability,
  ProviderAuthError,
  ALL_PROVIDER_ROLES,
} from "@/app/api/utils/providerAuth";
import { withRequestContext } from "@/app/api/utils/requestContext";

// GET /api/providers/[id]/walk-requests?status=open — a walker's INCOMING targeted requests
// (ticket C1). Active staff of a walker provider only. status=open returns LIVE requests only
// (open AND not expired). The RLS provider-read policy (0092) already scopes rows to those targeted
// at a provider the caller staffs; the explicit target filter pins it to this provider. Non-integer
// id → 404 before SQL. Degrade clean: no table → { requests: [] }.
async function GET(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const providerId = Number(params.id);
    if (!Number.isInteger(providerId)) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    await requireProviderCapability(providerId, "walker");
    await requireProviderRole(providerId, userId, ALL_PROVIDER_ROLES);

    const url = new URL(request.url);
    const status = url.searchParams.get("status") ?? "open";
    const openOnly = status === "open";

    let requests = [];
    try {
      requests = await sql`
        SELECT
          wr.*,
          pet.name AS pet_name,
          COALESCE(owner.full_name, owner.username) AS owner_name
        FROM walk_requests wr
        LEFT JOIN pets pet ON pet.id = wr.pet_id
        LEFT JOIN user_profiles owner ON owner.id = wr.owner_user_id
        WHERE wr.target_provider_id = ${providerId}
          AND (
            ${openOnly}::boolean = false
            OR (wr.status = 'open' AND wr.expires_at > now())
          )
        ORDER BY wr.created_at DESC
      `;
    } catch (e) {
      if (e?.code === "42P01") return Response.json({ requests: [] });
      throw e;
    }

    return Response.json({ requests });
  } catch (e) {
    if (e instanceof ProviderAuthError) {
      return Response.json({ error: e.message }, { status: e.status ?? 403 });
    }
    console.error("[GET /api/providers/[id]/walk-requests] Error:", e?.message);
    return Response.json({ error: "Failed to load walk requests" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
