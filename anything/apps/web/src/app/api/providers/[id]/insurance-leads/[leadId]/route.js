import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import {
  requireProviderCapability,
  ProviderAuthError,
} from "@/app/api/utils/providerAuth";
import { withRequestContext } from "@/app/api/utils/requestContext";

// PATCH /api/providers/[id]/insurance-leads/[leadId] — the insurer updates a lead's status (ticket
// 2.54). RLS (insurance_leads_staff_update) scopes to active staff of the targeted provider; a
// non-staff caller updates ZERO rows → 404.
const STATUSES = ["new", "contacted", "closed"];

async function PATCH(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id: providerId, leadId } = params;
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }
    await requireProviderCapability(providerId, "insurance");

    const body = (await request.json()) ?? {};
    if (!STATUSES.includes(body.status)) {
      return Response.json({ error: "Invalid status" }, { status: 400 });
    }

    const updated = await sql`
      UPDATE insurance_leads
      SET status = ${body.status}
      WHERE id = ${leadId} AND provider_id = ${providerId}
      RETURNING id, status
    `;
    if (updated.length === 0) {
      return Response.json({ error: "Lead not found or not authorized" }, { status: 404 });
    }
    return Response.json({ lead: updated[0] });
  } catch (e) {
    if (e instanceof ProviderAuthError) {
      return Response.json({ error: e.message }, { status: e.status ?? 403 });
    }
    console.error("[PATCH .../insurance-leads/[leadId]] Error:", e?.message);
    return Response.json({ error: "Failed to update lead" }, { status: 500 });
  }
}

const wrappedPATCH = withRequestContext(PATCH);
export { wrappedPATCH as PATCH };
