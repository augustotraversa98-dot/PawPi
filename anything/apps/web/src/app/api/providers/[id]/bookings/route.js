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
