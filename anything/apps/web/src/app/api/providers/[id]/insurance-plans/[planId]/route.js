import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import {
  requireProviderRole,
  requireProviderCapability,
  ProviderAuthError,
} from "@/app/api/utils/providerAuth";
import { withRequestContext } from "@/app/api/utils/requestContext";

// PATCH / DELETE /api/providers/[id]/insurance-plans/[planId] — admin edit / publish-toggle /
// delete a plan (ticket 2.54). RLS (insurance_plans_admin_all) is the backstop.
//
// DB is porsager's tagged-template `sql`.

async function PATCH(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id: providerId, planId } = params;
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }
    await requireProviderCapability(providerId, "insurance");
    await requireProviderRole(providerId, userId, ["owner", "admin"]);

    const body = (await request.json()) ?? {};
    const highlights = Array.isArray(body.coverage_highlights)
      ? body.coverage_highlights.filter((h) => typeof h === "string")
      : null;

    const updated = await sql`
      UPDATE insurance_plans
      SET
        name = COALESCE(${body.name ?? null}, name),
        tier = COALESCE(${body.tier ?? null}, tier),
        species = COALESCE(${body.species ?? null}, species),
        monthly_price_min = COALESCE(${body.monthly_price_min ?? null}, monthly_price_min),
        monthly_price_max = COALESCE(${body.monthly_price_max ?? null}, monthly_price_max),
        deductible = COALESCE(${body.deductible ?? null}, deductible),
        reimbursement = COALESCE(${body.reimbursement ?? null}, reimbursement),
        coverage_highlights = COALESCE(${highlights}, coverage_highlights),
        exclusions = COALESCE(${body.exclusions ?? null}, exclusions),
        terms_url = COALESCE(${body.terms_url ?? null}, terms_url),
        published = COALESCE(${body.published === undefined ? null : body.published}, published),
        updated_at = now()
      WHERE id = ${planId} AND provider_id = ${providerId}
      RETURNING *
    `;
    if (updated.length === 0) {
      return Response.json({ error: "Plan not found" }, { status: 404 });
    }
    return Response.json({ plan: updated[0] });
  } catch (e) {
    if (e instanceof ProviderAuthError) {
      return Response.json({ error: e.message }, { status: e.status ?? 403 });
    }
    console.error("[PATCH .../insurance-plans/[planId]] Error:", e?.message);
    return Response.json({ error: "Failed to update plan" }, { status: 500 });
  }
}

async function DELETE(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id: providerId, planId } = params;
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }
    await requireProviderCapability(providerId, "insurance");
    await requireProviderRole(providerId, userId, ["owner", "admin"]);

    const deleted = await sql`
      DELETE FROM insurance_plans
      WHERE id = ${planId} AND provider_id = ${providerId}
      RETURNING id
    `;
    if (deleted.length === 0) {
      return Response.json({ error: "Plan not found" }, { status: 404 });
    }
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof ProviderAuthError) {
      return Response.json({ error: e.message }, { status: e.status ?? 403 });
    }
    console.error("[DELETE .../insurance-plans/[planId]] Error:", e?.message);
    return Response.json({ error: "Failed to delete plan" }, { status: 500 });
  }
}

const wrappedPATCH = withRequestContext(PATCH);
const wrappedDELETE = withRequestContext(DELETE);
export { wrappedPATCH as PATCH, wrappedDELETE as DELETE };
