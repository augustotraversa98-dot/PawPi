import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import {
  requireProviderCapability,
  ProviderAuthError,
} from "@/app/api/utils/providerAuth";
import { withRequestContext } from "@/app/api/utils/requestContext";

// GET /api/providers/[id]/insurance-leads — the insurer's leads inbox (ticket 2.54). RLS
// (insurance_leads_staff_select) scopes to active staff of the provider.
async function GET(request, { params }) {
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
    await requireProviderCapability(providerId, "insurance");

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    const leads = status
      ? await sql`
          SELECT l.*, pl.name AS plan_name, pet.name AS pet_name
          FROM insurance_leads l
          LEFT JOIN insurance_plans pl ON pl.id = l.plan_id
          LEFT JOIN pets pet ON pet.id = l.pet_id
          WHERE l.provider_id = ${providerId} AND l.status = ${status}
          ORDER BY l.created_at DESC
        `
      : await sql`
          SELECT l.*, pl.name AS plan_name, pet.name AS pet_name
          FROM insurance_leads l
          LEFT JOIN insurance_plans pl ON pl.id = l.plan_id
          LEFT JOIN pets pet ON pet.id = l.pet_id
          WHERE l.provider_id = ${providerId}
          ORDER BY l.created_at DESC
        `;
    return Response.json({ leads });
  } catch (e) {
    if (e instanceof ProviderAuthError) {
      return Response.json({ error: e.message }, { status: e.status ?? 403 });
    }
    console.error("[GET .../insurance-leads] Error:", e?.message);
    return Response.json({ error: "Failed to fetch leads" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
