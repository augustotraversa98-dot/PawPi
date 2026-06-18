import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// /api/insurance-leads — the OWNER's quote/interest requests (ticket 2.54).
// POST: create a lead for an insurer (lead-gen; no payment). Only the owner's own pet fields +
//   contact go to the insurer — NEVER the Vet Record. RLS owner-insert is the backstop.
// GET: the owner's own leads (status follow-up).
//
// DB is porsager's tagged-template `sql`.

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
    const providerId = body.provider_id;
    if (!providerId) {
      return Response.json({ error: "provider_id is required" }, { status: 400 });
    }

    // If a pet is named it must be the caller's (no leaking another owner's pet into a lead).
    let petId = null;
    if (body.pet_id != null) {
      const pet = await sql`SELECT id FROM pets WHERE id = ${body.pet_id} AND owner_user_id = ${userId}`;
      if (pet.length === 0) {
        return Response.json({ error: "You do not own this pet" }, { status: 403 });
      }
      petId = body.pet_id;
    }

    const created = await sql`
      INSERT INTO insurance_leads (
        plan_id, provider_id, owner_user_id, pet_id, pet_species, pet_breed, pet_age,
        contact_email, contact_phone, note
      ) VALUES (
        ${body.plan_id ?? null}, ${providerId}, ${userId}, ${petId},
        ${body.pet_species ?? null}, ${body.pet_breed ?? null}, ${body.pet_age ?? null},
        ${body.contact_email ?? null}, ${body.contact_phone ?? null}, ${body.note ?? null}
      )
      RETURNING *
    `;
    return Response.json({ lead: created[0] }, { status: 201 });
  } catch (e) {
    console.error("[POST /api/insurance-leads] Error:", e?.message);
    return Response.json({ error: "Failed to submit request" }, { status: 500 });
  }
}

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
    const leads = await sql`
      SELECT l.*, pl.name AS plan_name, prov.name AS provider_name
      FROM insurance_leads l
      LEFT JOIN insurance_plans pl ON pl.id = l.plan_id
      LEFT JOIN providers prov ON prov.id = l.provider_id
      WHERE l.owner_user_id = ${userId}
      ORDER BY l.created_at DESC
    `;
    return Response.json({ leads });
  } catch (e) {
    console.error("[GET /api/insurance-leads] Error:", e?.message);
    return Response.json({ error: "Failed to fetch leads" }, { status: 500 });
  }
}

const wrappedPOST = withRequestContext(POST);
const wrappedGET = withRequestContext(GET);
export { wrappedPOST as POST, wrappedGET as GET };
