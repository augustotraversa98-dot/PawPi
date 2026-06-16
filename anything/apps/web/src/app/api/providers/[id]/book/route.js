import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// POST /api/providers/[id]/book — the pet's OWNER books this provider.
// Ticket 6a (docs/provider-design.md §4 item 6, owner half; 6b adds the provider
// confirm/decline side). The booking is a vet_appointments row carrying provider
// context (provider_id/location/service), source='owner', booking_status='requested'.
//
// This is an OWNER-context route, NOT a provider one: authorization is pet
// ownership (WHERE owner_user_id = me), not provider_staff membership — so it uses
// resolveUserId but NOT requireProviderRole. The created row is a normal
// vet_appointments row with the same reminder fields (reminder_enabled left at the
// table default), so the existing reminder engine keeps working unchanged.
//
// DB is porsager's tagged-template `sql` (SCHEMA_NOTES "neon→porsager"): every
// query is a tagged template; params bind via `${}`.
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

    const body = (await request.json()) ?? {};
    const {
      petId,
      appointment_date,
      appointment_time,
      service_id,
      provider_location_id,
      reason_for_visit,
      notes,
      title,
    } = body;

    if (!petId || !appointment_date || !appointment_time) {
      return Response.json(
        {
          error:
            "petId, appointment_date, and appointment_time are required",
        },
        { status: 400 },
      );
    }

    // I must OWN the pet — cannot book for a pet I don't own.
    const petCheck = await sql`
      SELECT id FROM pets WHERE id = ${petId} AND owner_user_id = ${userId}
    `;
    if (petCheck.length === 0) {
      return Response.json(
        { error: "You do not own this pet" },
        { status: 403 },
      );
    }

    // Provider must exist AND be published — cannot book a draft/unknown provider.
    const providerRows = await sql`
      SELECT id, name, status FROM providers WHERE id = ${providerId}
    `;
    if (providerRows.length === 0 || providerRows[0].status !== "published") {
      return Response.json(
        { error: "Provider not found" },
        { status: 404 },
      );
    }
    const provider = providerRows[0];

    // If a service is named it must belong to THIS provider and be active.
    let service = null;
    if (service_id !== undefined && service_id !== null) {
      const serviceRows = await sql`
        SELECT id, name, active FROM provider_services
        WHERE id = ${service_id} AND provider_id = ${providerId}
      `;
      if (serviceRows.length === 0 || serviceRows[0].active !== true) {
        return Response.json(
          { error: "Invalid service for this provider" },
          { status: 400 },
        );
      }
      service = serviceRows[0];
    }

    // If a location is named it must belong to THIS provider.
    if (provider_location_id !== undefined && provider_location_id !== null) {
      const locationRows = await sql`
        SELECT id FROM provider_locations
        WHERE id = ${provider_location_id} AND provider_id = ${providerId}
      `;
      if (locationRows.length === 0) {
        return Response.json(
          { error: "Invalid location for this provider" },
          { status: 400 },
        );
      }
    }

    // title is NOT NULL — derive it: explicit title, else the service name, else a
    // generic label naming the provider. Never leave it null.
    const resolvedTitle =
      title || service?.name || `Appointment with ${provider.name}`;

    // Insert the booking. reminder_enabled is intentionally omitted so it keeps the
    // table default (do NOT change reminder behavior). staff_user_id is NULL —
    // assigned later in 6b. booking_status='requested', source='owner',
    // status='scheduled' (the existing lifecycle column).
    const created = await sql`
      INSERT INTO vet_appointments (
        pet_id,
        owner_user_id,
        title,
        appointment_date,
        appointment_time,
        reason_for_visit,
        notes,
        provider_id,
        provider_location_id,
        service_id,
        staff_user_id,
        source,
        booking_status,
        status
      ) VALUES (
        ${petId},
        ${userId},
        ${resolvedTitle},
        ${appointment_date},
        ${appointment_time},
        ${reason_for_visit ?? null},
        ${notes ?? null},
        ${providerId},
        ${provider_location_id ?? null},
        ${service_id ?? null},
        ${null},
        ${"owner"},
        ${"requested"},
        ${"scheduled"}
      )
      RETURNING *
    `;

    return Response.json({ appointment: created[0] }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/providers/[id]/book] Error:", error.message);
    return Response.json(
      { error: "Failed to create booking" },
      { status: 500 },
    );
  }
}

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md). Handler
// bodies are unchanged — only their DB connection is now request-scoped.
const wrappedPOST = withRequestContext(POST);
export { wrappedPOST as POST };
