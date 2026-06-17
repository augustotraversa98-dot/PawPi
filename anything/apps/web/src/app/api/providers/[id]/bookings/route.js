import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import {
  requireProviderRole,
  ALL_PROVIDER_ROLES,
} from "@/app/api/utils/providerAuth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// GET /api/providers/[id]/bookings — this provider's booking INBOX.
// Ticket 6b (docs/provider-design.md §4 item 6, provider half; 6a is the owner
// half that POSTs the booking). Lists the vet_appointments rows owners booked
// with this provider so front-desk staff can confirm/decline/assign them
// (PATCH lives in ./[appointmentId]).
//
// AUTH: booking management is OPERATIONAL — any ACTIVE staff (front desk, not
// just owner/admin) may read the inbox and act on bookings. So this authorizes
// with ALL_PROVIDER_ROLES, unlike the config routes (locations/services/staff)
// which require owner|admin.
//
// CONSENT BOUNDARY: this returns ONLY booking metadata + booking CONTEXT (pet
// name, owner display name, service name). It MUST NOT read any pet MEDICAL data
// (weight, meds, vaccines, vet notes, care_access) — that requires a care_access
// grant (tickets 7–8) and is out of scope. The booking the owner initiated is
// shareable; the pet's health record is not. assertCareAccess is deliberately
// NOT called here because no medical data is touched.
//
// DB is porsager's tagged-template `sql` (SCHEMA_NOTES "neon→porsager"): every
// query is a tagged template; params bind via `${}`. The optional ?booking_status=
// filter uses two tagged-template variants (never sql(string, array)).
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

    // OPERATIONAL read — any active staff member may view the inbox.
    await requireProviderRole(providerId, userId, ALL_PROVIDER_ROLES);

    const { searchParams } = new URL(request.url);
    const bookingStatus = searchParams.get("booking_status");

    // CALENDAR view (ticket 2.24) — the same booking-context-ONLY data as the inbox,
    // plus the grid extras: pet basic info (species/breed/avatar — NOT medical), the
    // location (in-store name/address), and the order's value + paid flag. Scoped to a
    // [from, to) start_at window so the grid only pulls the visible week/day.
    //
    // STILL booking-context only — NO medical table is touched (no weight/meds/vaccines/
    // vet notes/care_access). orders/provider_locations are booking metadata, not health
    // data. assertCareAccess is deliberately not called (no medical data).
    if (searchParams.get("view") === "calendar") {
      const from = searchParams.get("from");
      const to = searchParams.get("to");
      if (!from || !to) {
        return Response.json(
          { error: "from and to are required for the calendar view" },
          { status: 400 },
        );
      }

      const calendar = await sql`
        SELECT
          va.id,
          va.pet_id,
          va.owner_user_id,
          va.title,
          va.appointment_date,
          va.appointment_time,
          va.reason_for_visit,
          va.notes,
          va.booking_status,
          va.status,
          va.staff_user_id,
          va.provider_id,
          va.provider_location_id,
          va.service_id,
          va.capability,
          va.start_at,
          va.end_at,
          va.order_id,
          p.name AS pet_name,
          p.species AS pet_species,
          p.breed AS pet_breed,
          p.avatar_url AS pet_avatar_url,
          COALESCE(up.full_name, up.username) AS owner_name,
          s.name AS service_name,
          pl.name AS location_name,
          pl.address AS location_address,
          o.amount_cents AS value_cents,
          o.currency AS value_currency,
          (o.status = 'paid') AS paid
        FROM vet_appointments va
        LEFT JOIN pets p ON p.id = va.pet_id
        LEFT JOIN user_profiles up ON up.id = va.owner_user_id
        LEFT JOIN provider_services s ON s.id = va.service_id
        LEFT JOIN provider_locations pl ON pl.id = va.provider_location_id
        LEFT JOIN orders o ON o.id = va.order_id
        WHERE va.provider_id = ${providerId}
          AND va.deleted_at IS NULL
          AND va.start_at IS NOT NULL
          AND va.start_at >= ${from}
          AND va.start_at < ${to}
        ORDER BY va.start_at ASC, va.id ASC
      `;

      return Response.json({ bookings: calendar });
    }

    // BOOKING FIELDS + CONTEXT ONLY. The joins surface human-readable context
    // (pet/owner/service names); no medical table is touched. owner_name prefers
    // full_name, falling back to username. provider_services is LEFT JOIN'd
    // because service_id is nullable on a booking.
    const bookings = bookingStatus
      ? await sql`
          SELECT
            va.id,
            va.pet_id,
            va.owner_user_id,
            va.title,
            va.appointment_date,
            va.appointment_time,
            va.reason_for_visit,
            va.notes,
            va.booking_status,
            va.status,
            va.staff_user_id,
            va.provider_id,
            va.provider_location_id,
            va.service_id,
            va.capability,
            va.start_at,
            va.end_at,
            va.recurrence_rule,
            va.order_id,
            va.source,
            va.created_at,
            va.updated_at,
            p.name AS pet_name,
            COALESCE(up.full_name, up.username) AS owner_name,
            s.name AS service_name
          FROM vet_appointments va
          LEFT JOIN pets p ON p.id = va.pet_id
          LEFT JOIN user_profiles up ON up.id = va.owner_user_id
          LEFT JOIN provider_services s ON s.id = va.service_id
          WHERE va.provider_id = ${providerId}
            AND va.deleted_at IS NULL
            AND va.booking_status = ${bookingStatus}
          ORDER BY va.appointment_date DESC, va.appointment_time DESC
        `
      : await sql`
          SELECT
            va.id,
            va.pet_id,
            va.owner_user_id,
            va.title,
            va.appointment_date,
            va.appointment_time,
            va.reason_for_visit,
            va.notes,
            va.booking_status,
            va.status,
            va.staff_user_id,
            va.provider_id,
            va.provider_location_id,
            va.service_id,
            va.capability,
            va.start_at,
            va.end_at,
            va.recurrence_rule,
            va.order_id,
            va.source,
            va.created_at,
            va.updated_at,
            p.name AS pet_name,
            COALESCE(up.full_name, up.username) AS owner_name,
            s.name AS service_name
          FROM vet_appointments va
          LEFT JOIN pets p ON p.id = va.pet_id
          LEFT JOIN user_profiles up ON up.id = va.owner_user_id
          LEFT JOIN provider_services s ON s.id = va.service_id
          WHERE va.provider_id = ${providerId}
            AND va.deleted_at IS NULL
          ORDER BY va.appointment_date DESC, va.appointment_time DESC
        `;

    return Response.json({ bookings });
  } catch (error) {
    if (error.status === 403) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    console.error("[GET /api/providers/[id]/bookings] Error:", error.message);
    return Response.json(
      { error: "Failed to fetch bookings" },
      { status: 500 },
    );
  }
}

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md). Handler
// bodies are unchanged — only their DB connection is now request-scoped.
const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
