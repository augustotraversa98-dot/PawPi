import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { requireProviderRole } from "@/app/api/utils/providerAuth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// Publish / unpublish a provider — owner|admin only. Dedicated endpoint so the
// profile PATCH (../route.js) never touches status. The value is validated
// against the providers_status_check set (draft|published) before it is written.

const VALID_STATUSES = ["draft", "published"];

async function POST(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const providerId = params.id;

    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    // owner|admin only (requireProviderRole default), scoped to this provider.
    await requireProviderRole(providerId, userId);

    const body = (await request.json()) ?? {};
    const { status } = body;

    if (!VALID_STATUSES.includes(status)) {
      return Response.json(
        { error: "status must be one of: draft, published" },
        { status: 400 },
      );
    }

    const result = await sql`
      UPDATE providers
      SET status = ${status}, updated_at = NOW()
      WHERE id = ${providerId}
      RETURNING *
    `;
    if (result.length === 0) {
      return Response.json({ error: "Provider not found" }, { status: 404 });
    }

    return Response.json({ provider: result[0] });
  } catch (error) {
    if (error.status === 403) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    console.error("[POST /api/providers/[id]/publish] Error:", error.message);
    return Response.json({ error: "Failed to update status" }, { status: 500 });
  }
}

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md). Handler
// bodies are unchanged — only their DB connection is now request-scoped.
const wrappedPOST = withRequestContext(POST);
export { wrappedPOST as POST };
