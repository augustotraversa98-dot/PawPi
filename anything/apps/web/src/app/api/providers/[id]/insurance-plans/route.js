import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import {
  requireProviderRole,
  requireProviderCapability,
  ProviderAuthError,
} from "@/app/api/utils/providerAuth";
import { withRequestContext } from "@/app/api/utils/requestContext";

// /api/providers/[id]/insurance-plans — an insurer's plan catalog (ticket 2.54).
// GET: capability-gated; RLS scopes rows (staff → all incl. unpublished; an owner/marketplace
//   caller → published plans of a published provider). POST: admin-only create.
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

    const plans = await sql`
      SELECT id, provider_id, name, tier, species, monthly_price_min, monthly_price_max,
             deductible, reimbursement, coverage_highlights, exclusions, terms_url,
             published, created_at, updated_at
      FROM insurance_plans
      WHERE provider_id = ${providerId}
      ORDER BY (published) DESC, created_at DESC, id DESC
    `;
    return Response.json({ plans });
  } catch (e) {
    if (e instanceof ProviderAuthError) {
      return Response.json({ error: e.message }, { status: e.status ?? 403 });
    }
    console.error("[GET .../insurance-plans] Error:", e?.message);
    return Response.json({ error: "Failed to fetch plans" }, { status: 500 });
  }
}

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
    await requireProviderCapability(providerId, "insurance");
    await requireProviderRole(providerId, userId, ["owner", "admin"]);

    const body = (await request.json()) ?? {};
    if (!body.name || typeof body.name !== "string") {
      return Response.json({ error: "name is required" }, { status: 400 });
    }
    const highlights = Array.isArray(body.coverage_highlights)
      ? body.coverage_highlights.filter((h) => typeof h === "string")
      : [];

    const created = await sql`
      INSERT INTO insurance_plans (
        provider_id, name, tier, species, monthly_price_min, monthly_price_max,
        deductible, reimbursement, coverage_highlights, exclusions, terms_url, published
      ) VALUES (
        ${providerId}, ${body.name}, ${body.tier ?? null}, ${body.species ?? null},
        ${body.monthly_price_min ?? null}, ${body.monthly_price_max ?? null},
        ${body.deductible ?? null}, ${body.reimbursement ?? null}, ${highlights},
        ${body.exclusions ?? null}, ${body.terms_url ?? null}, ${body.published === true}
      )
      RETURNING *
    `;
    if (created.length === 0) {
      return Response.json({ error: "Not authorized" }, { status: 403 });
    }
    return Response.json({ plan: created[0] }, { status: 201 });
  } catch (e) {
    if (e instanceof ProviderAuthError) {
      return Response.json({ error: e.message }, { status: e.status ?? 403 });
    }
    console.error("[POST .../insurance-plans] Error:", e?.message);
    return Response.json({ error: "Failed to create plan" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
const wrappedPOST = withRequestContext(POST);
export { wrappedGET as GET, wrappedPOST as POST };
