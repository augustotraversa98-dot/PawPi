import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";
import { ALLOWED_CAPABILITIES } from "@/app/api/utils/providerAuth";
import { getCalendarSync } from "@/app/api/utils/calendarSync";

// POST /api/providers/[id]/book — the pet's OWNER books this provider.
// Ticket 6a (vet) GENERALIZED by ticket 2.4 (docs/phase2-tickets/2.4-generalized-
// booking.md): the same route now books ANY published provider+capability, not just
// vet. The booking is a vet_appointments row (the generalized booking table — see
// 0030's PATH-(a) decision) carrying provider context (provider_id/location/service),
// a capability (default 'vet'), an optional slot (start_at/end_at) + recurrence rule,
// an optional deposit link (order_id from 2.3), source='owner', booking_status=
// 'requested'. An optional meet_and_greet flag (2.9) tags a booking as the lightweight
// pre-engagement INTRO step (owner + sitter align over chat before the real booking);
// it defaults false so every non-sitter booking is unchanged.
//
// This is an OWNER-context route, NOT a provider one: authorization is pet
// ownership (WHERE owner_user_id = me), not provider_staff membership — so it uses
// resolveUserId but NOT requireProviderRole. The created row is a normal
// vet_appointments row with the same reminder fields (reminder_enabled left at the
// table default), so the existing reminder engine keeps working unchanged — a vet
// booking (capability 'vet', no slot) is byte-for-byte the pre-2.4 behaviour.
//
// DOUBLE-BOOK: when a slot (start_at/end_at) + staff are given, the route checks the
// staff member is free before inserting (clean 409); the 0030 partial-unique index is
// the last-line race guard. A calendar-sync hook (stub) is invoked post-insert.
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
      staff_user_id,
      reason_for_visit,
      notes,
      title,
      capability,
      start_at,
      end_at,
      recurrence_rule,
      order_id,
      meet_and_greet,
      calendar_event_id,
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

    // capability defaults to 'vet' (the pre-2.4 behaviour). When given it must be a
    // known capability AND the provider must actually HOLD it (you can only book a
    // service a provider offers). A bad value is a clean 400, not a 500/constraint error.
    const resolvedCapability = capability ?? "vet";
    if (!ALLOWED_CAPABILITIES.includes(resolvedCapability)) {
      return Response.json(
        { error: "Invalid capability" },
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

    // CAPABILITY GATE (2.4). The provider must HOLD the requested capability. Only
    // checked for a NON-vet booking: a plain vet booking (the pre-2.4 default) is
    // unchanged — no extra query, no behaviour change for the vet path. From 2.1 on a
    // service module gates on a CAPABILITY, never provider_type.
    if (resolvedCapability !== "vet") {
      const capRows = await sql`
        SELECT 1 FROM provider_capabilities
        WHERE provider_id = ${providerId} AND capability = ${resolvedCapability}
      `;
      if (capRows.length === 0) {
        return Response.json(
          { error: "Provider does not offer this capability" },
          { status: 400 },
        );
      }
    }

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

    // If an owner pre-selects a staff member (e.g. "book with this walker") it must be
    // ACTIVE staff of THIS provider. Only checked when given — the vet path passes none.
    if (staff_user_id !== undefined && staff_user_id !== null) {
      const staffRows = await sql`
        SELECT id FROM provider_staff
        WHERE provider_id = ${providerId}
          AND user_profile_id = ${staff_user_id}
          AND status = 'active'
      `;
      if (staffRows.length === 0) {
        return Response.json(
          { error: "Selected staff member is not active for this provider" },
          { status: 400 },
        );
      }
    }

    // DOUBLE-BOOK PREVENTION (2.4). When a concrete slot (start_at/end_at) is given for
    // a specific staff member, reject if that staff member already has a live
    // (requested|confirmed) booking overlapping the slot — a clean 409 instead of the
    // raw 0030 partial-unique constraint error. Only runs when BOTH a slot and a staff
    // member are supplied (the general walk/daycare/grooming path); the vet path, which
    // sends neither, is untouched.
    if (
      start_at !== undefined && start_at !== null &&
      end_at !== undefined && end_at !== null &&
      staff_user_id !== undefined && staff_user_id !== null
    ) {
      if (!(start_at < end_at)) {
        return Response.json(
          { error: "end_at must be after start_at" },
          { status: 400 },
        );
      }
      const clash = await sql`
        SELECT id FROM vet_appointments
        WHERE provider_id = ${providerId}
          AND staff_user_id = ${staff_user_id}
          AND deleted_at IS NULL
          AND booking_status = ANY (ARRAY['requested','confirmed'])
          AND start_at IS NOT NULL
          AND start_at < ${end_at}
          AND end_at > ${start_at}
        LIMIT 1
      `;
      if (clash.length > 0) {
        return Response.json(
          { error: "That time slot is no longer available" },
          { status: 409 },
        );
      }
    }

    // If a deposit order is linked it must be the owner's OWN order for THIS provider
    // (a booking deposit from 2.3). Only checked when given.
    if (order_id !== undefined && order_id !== null) {
      const orderRows = await sql`
        SELECT id FROM orders
        WHERE id = ${order_id}
          AND owner_user_id = ${userId}
          AND provider_id = ${providerId}
      `;
      if (orderRows.length === 0) {
        return Response.json(
          { error: "Invalid deposit order for this booking" },
          { status: 400 },
        );
      }
    }

    // title is NOT NULL — derive it: explicit title, else the service name, else a
    // generic label naming the provider. Never leave it null.
    const resolvedTitle =
      title || service?.name || `Appointment with ${provider.name}`;

    // Insert the booking. reminder_enabled is intentionally omitted so it keeps the
    // table default (do NOT change reminder behavior). booking_status='requested',
    // source='owner', status='scheduled' (the existing lifecycle column). The 2.4
    // generalized columns (capability/slot/recurrence/order) are bound here; a vet
    // booking sends capability 'vet' + nulls for the rest, reproducing the pre-2.4 row.
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
        capability,
        start_at,
        end_at,
        recurrence_rule,
        order_id,
        meet_and_greet,
        calendar_event_id,
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
        ${staff_user_id ?? null},
        ${resolvedCapability},
        ${start_at ?? null},
        ${end_at ?? null},
        ${recurrence_rule ?? null},
        ${order_id ?? null},
        ${meet_and_greet === true},
        ${calendar_event_id ?? null},
        ${"owner"},
        ${"requested"},
        ${"scheduled"}
      )
      RETURNING *
    `;

    // Calendar-sync hook (stub behind an interface — 2.4). A real Google/Apple adapter
    // would mirror the new booking onto the provider's external calendar; the no-op
    // adapter records intent and never fails, so it is safe to await inline. Failure to
    // sync must NOT fail the booking, so it is best-effort.
    try {
      await getCalendarSync().pushBooking(created[0]);
    } catch (syncErr) {
      console.error(
        "[POST /api/providers/[id]/book] calendar sync (non-fatal):",
        syncErr.message,
      );
    }

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
