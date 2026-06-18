import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import {
  requireProviderCapability,
  ProviderAuthError,
} from "@/app/api/utils/providerAuth";
import { assertCareAccess, CareAccessError } from "@/app/api/utils/careAccess";
import { withRequestContext } from "@/app/api/utils/requestContext";

// /api/providers/[id]/pets/[petId]/prescriptions — a VET issues / lists prescriptions for a pet
// (ticket 2.53). Gates in order: requireProviderCapability(provider,'vet') →
// assertCareAccess('medical_write') (the audited consent path) → INSERT (RLS app_provider_can_rx
// is the DB backstop; it also admits a booking-based access). The OWNER never writes an Rx.
//
// DB is porsager's tagged-template `sql`.

async function POST(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const providerId = params.id;
    const petId = params.petId;
    const staffUserId = await resolveUserId(session.user.id);
    if (staffUserId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    // GATE 1 — the provider must HOLD the 'vet' capability (2.1). 403 if not.
    await requireProviderCapability(providerId, "vet");

    const body = (await request.json()) ?? {};
    const { drug_name, dose, frequency } = body;
    if (!drug_name || typeof drug_name !== "string") {
      return Response.json({ error: "drug_name is required" }, { status: 400 });
    }
    if (!dose || !frequency) {
      return Response.json({ error: "dose and frequency are required" }, { status: 400 });
    }
    const refillsAuthorized = Number.isInteger(body.refills_authorized)
      ? Math.max(0, body.refills_authorized)
      : 0;
    const source =
      body.source === "telehealth" || body.source === "in_person" ? body.source : null;

    // GATE 2 — the pet-data gate (medical write). Throws CareAccessError(403); audits on success.
    await assertCareAccess(petId, providerId, "medical_write", {
      staffUserId,
      action: "write",
      resource: "prescriptions",
    });

    // Derive the owner from the pet + the issuing staff row.
    const petRows = await sql`SELECT owner_user_id FROM pets WHERE id = ${petId}`;
    if (petRows.length === 0) {
      return Response.json({ error: "Pet not found" }, { status: 404 });
    }
    const ownerUserId = petRows[0].owner_user_id;
    const staffRows = await sql`
      SELECT id FROM provider_staff
      WHERE provider_id = ${providerId} AND user_profile_id = ${staffUserId} AND status = 'active'
      LIMIT 1
    `;
    const issuedByStaffId = staffRows[0]?.id ?? null;

    // RLS WITH CHECK (app_provider_can_rx) is the DB backstop. refills_remaining starts at authorized.
    const created = await sql`
      INSERT INTO prescriptions (
        pet_id, owner_user_id, provider_id, issued_by_staff_id, source,
        drug_name, strength, dose, route, frequency, duration, quantity,
        refills_authorized, refills_remaining, instructions
      ) VALUES (
        ${petId}, ${ownerUserId}, ${providerId}, ${issuedByStaffId}, ${source},
        ${drug_name}, ${body.strength ?? null}, ${dose}, ${body.route ?? null}, ${frequency},
        ${body.duration ?? null}, ${body.quantity ?? null},
        ${refillsAuthorized}, ${refillsAuthorized}, ${body.instructions ?? null}
      )
      RETURNING *
    `;
    if (created.length === 0) {
      return Response.json(
        { error: "Not authorized to issue a prescription for this pet" },
        { status: 403 },
      );
    }
    return Response.json({ prescription: created[0] }, { status: 201 });
  } catch (e) {
    if (e instanceof ProviderAuthError) {
      return Response.json({ error: e.message }, { status: e.status ?? 403 });
    }
    if (e instanceof CareAccessError) {
      return Response.json({ error: e.message }, { status: e.status ?? 403 });
    }
    console.error("[POST .../prescriptions] Error:", e?.message);
    return Response.json({ error: "Failed to issue prescription" }, { status: 500 });
  }
}

async function GET(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const providerId = params.id;
    const petId = params.petId;
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }
    await requireProviderCapability(providerId, "vet");

    // RLS (prescriptions_provider_read) scopes to active staff of this provider.
    const prescriptions = await sql`
      SELECT * FROM prescriptions
      WHERE provider_id = ${providerId} AND pet_id = ${petId}
      ORDER BY issued_at DESC, id DESC
    `;
    return Response.json({ prescriptions });
  } catch (e) {
    if (e instanceof ProviderAuthError) {
      return Response.json({ error: e.message }, { status: e.status ?? 403 });
    }
    console.error("[GET .../prescriptions] Error:", e?.message);
    return Response.json({ error: "Failed to fetch prescriptions" }, { status: 500 });
  }
}

const wrappedPOST = withRequestContext(POST);
const wrappedGET = withRequestContext(GET);
export { wrappedPOST as POST, wrappedGET as GET };
