import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import {
  requireProviderCapability,
  ProviderAuthError,
} from "@/app/api/utils/providerAuth";
import { withRequestContext } from "@/app/api/utils/requestContext";

// /api/insurance-policies — the OWNER side of in-app binding (Wave 7 ticket 2.72, extends 2.54).
//   GET  ?petId= — the owner's policies (RLS owner_select), newest first.
//   POST          — apply for a plan (status 'application'); records terms acceptance. RLS owner_insert
//                   forbids a self-issued number/premium. The insurer issues the number/premium next;
//                   the owner then pays (2.3) and activates via the safe path. The insurer is the
//                   party-of-record — PawPi only facilitates (no underwriting).
//
// DB is porsager's tagged-template `sql`.
async function GET(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }
    const { searchParams } = new URL(request.url);
    const petId = searchParams.get("petId");

    const rows = petId
      ? await sql`
          SELECT pol.*, pl.name AS plan_name, pl.tier, prov.name AS provider_name
          FROM insurance_policies pol
          LEFT JOIN insurance_plans pl ON pl.id = pol.plan_id
          LEFT JOIN providers prov ON prov.id = pol.provider_id
          WHERE pol.owner_user_id = ${userId} AND pol.pet_id = ${petId}
          ORDER BY pol.created_at DESC, pol.id DESC
        `
      : await sql`
          SELECT pol.*, pl.name AS plan_name, pl.tier, prov.name AS provider_name
          FROM insurance_policies pol
          LEFT JOIN insurance_plans pl ON pl.id = pol.plan_id
          LEFT JOIN providers prov ON prov.id = pol.provider_id
          WHERE pol.owner_user_id = ${userId}
          ORDER BY pol.created_at DESC, pol.id DESC
        `;
    return Response.json({ policies: rows });
  } catch (e) {
    console.error("[GET /api/insurance-policies] Error:", e?.message);
    return Response.json({ error: "Failed to load policies" }, { status: 500 });
  }
}

async function POST(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }
    const body = (await request.json()) ?? {};
    const { plan_id, provider_id, pet_id, lead_id, terms_accepted, terms_url } =
      body;

    if (!provider_id) {
      return Response.json({ error: "provider_id is required" }, { status: 400 });
    }
    if (!terms_accepted) {
      return Response.json(
        { error: "You must accept the insurer's terms to apply" },
        { status: 400 },
      );
    }
    // The insurer must hold the `insurance` capability (clean 403 vs a later RLS error).
    await requireProviderCapability(provider_id, "insurance");

    // If a pet is named it must be the caller's (no leaking another owner's pet).
    let petIdSafe = null;
    if (pet_id != null) {
      const petRows = await sql`
        SELECT id FROM pets WHERE id = ${pet_id} AND owner_user_id = ${userId}
      `;
      if (petRows.length === 0) {
        return Response.json({ error: "Pet not found" }, { status: 404 });
      }
      petIdSafe = pet_id;
    }

    // RLS owner_insert backstops: status 'application', no policy_number/premium.
    const created = await sql`
      INSERT INTO insurance_policies
        (plan_id, lead_id, provider_id, owner_user_id, pet_id, status, terms_accepted_at, terms_url)
      VALUES (
        ${plan_id ?? null}, ${lead_id ?? null}, ${provider_id}, ${userId},
        ${petIdSafe}, 'application', now(), ${terms_url ?? null}
      )
      RETURNING *
    `;
    return Response.json({ policy: created[0] }, { status: 201 });
  } catch (e) {
    if (e instanceof ProviderAuthError || e.status === 403) {
      return Response.json({ error: e.message }, { status: 403 });
    }
    if (/row-level security/i.test(e?.message ?? "")) {
      return Response.json(
        { error: "That application isn't allowed" },
        { status: 400 },
      );
    }
    console.error("[POST /api/insurance-policies] Error:", e?.message);
    return Response.json({ error: "Failed to apply" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
const wrappedPOST = withRequestContext(POST);
export { wrappedGET as GET, wrappedPOST as POST };
