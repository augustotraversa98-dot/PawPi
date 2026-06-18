import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import {
  requireProviderCapability,
  ProviderAuthError,
} from "@/app/api/utils/providerAuth";
import { withRequestContext } from "@/app/api/utils/requestContext";

// GET /api/providers/[id]/insurance-policies — the insurer's POLICIES view (Wave 7 ticket 2.72).
// Capability-gated to `insurance`; RLS (insurance_policies_staff_select) scopes to active staff of
// THIS insurer — another provider's staff sees ZERO. Surfaces applications + bound policies with the
// pet/owner, premium, status and payment state.
//
// DB is porsager's tagged-template `sql`.
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

    const policies = await sql`
      SELECT
        pol.id, pol.plan_id, pol.pet_id, pol.owner_user_id, pol.policy_number,
        pol.status, pol.premium_cents, pol.billing_period, pol.effective_at,
        pol.terms_accepted_at, pol.payment_id, pol.documents, pol.created_at,
        pl.name AS plan_name, pl.tier,
        p.name AS pet_name,
        COALESCE(up.full_name, up.username) AS owner_name,
        pay.status AS payment_status
      FROM insurance_policies pol
      LEFT JOIN insurance_plans pl ON pl.id = pol.plan_id
      LEFT JOIN pets p ON p.id = pol.pet_id
      LEFT JOIN user_profiles up ON up.id = pol.owner_user_id
      LEFT JOIN payments pay ON pay.id = pol.payment_id
      WHERE pol.provider_id = ${providerId}
      ORDER BY pol.created_at DESC, pol.id DESC
    `;
    return Response.json({ policies });
  } catch (e) {
    if (e instanceof ProviderAuthError || e.status === 403) {
      return Response.json({ error: e.message }, { status: 403 });
    }
    console.error(
      "[GET /api/providers/[id]/insurance-policies] Error:",
      e?.message,
    );
    return Response.json({ error: "Failed to load policies" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
