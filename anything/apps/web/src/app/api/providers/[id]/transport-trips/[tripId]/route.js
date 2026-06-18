import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import {
  requireProviderCapability,
  ProviderAuthError,
} from "@/app/api/utils/providerAuth";
import { withRequestContext } from "@/app/api/utils/requestContext";

// PATCH /api/providers/[id]/transport-trips/[tripId] — the provider STAFF acts on a trip
// (ticket 2.52): confirm, assign a driver, advance status, set the fare. The capability gate is
// the module gate; transport_trips RLS (staff UPDATE) is the real guard — a non-staff caller (or
// another provider's staff) updates ZERO rows. The mirror UPDATE that touches a booking column
// keeps the booking_status in step so the inbox/calendar reflect it.
//
// DB is porsager's tagged-template `sql`.

const STATUSES = ["requested", "confirmed", "en_route", "completed", "cancelled"];
// The transport status → the generalized booking_status it implies (2.4 lifecycle).
const BOOKING_STATUS = {
  requested: "requested",
  confirmed: "confirmed",
  en_route: "confirmed",
  completed: "completed",
  cancelled: "cancelled",
};

async function PATCH(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const providerId = params.id;
    const tripId = params.tripId;
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }
    await requireProviderCapability(providerId, "transport");

    const body = (await request.json()) ?? {};
    const { status, assigned_staff_id, fare_amount } = body;

    if (status !== undefined && !STATUSES.includes(status)) {
      return Response.json({ error: "Invalid status" }, { status: 400 });
    }
    if (
      fare_amount !== undefined &&
      fare_amount !== null &&
      !(Number.isFinite(Number(fare_amount)) && Number(fare_amount) >= 0)
    ) {
      return Response.json({ error: "Invalid fare_amount" }, { status: 400 });
    }
    // An assigned driver must be active staff of THIS provider.
    if (assigned_staff_id !== undefined && assigned_staff_id !== null) {
      const staffRows = await sql`
        SELECT id FROM provider_staff
        WHERE id = ${assigned_staff_id} AND provider_id = ${providerId} AND status = 'active'
      `;
      if (staffRows.length === 0) {
        return Response.json(
          { error: "assigned_staff_id is not active staff of this provider" },
          { status: 400 },
        );
      }
    }

    // COALESCE keeps unspecified fields. transport_trips RLS (staff UPDATE) scopes the row to
    // active staff of the provider — a non-staff caller updates ZERO rows → 404.
    const updated = await sql`
      UPDATE transport_trips
      SET
        status = COALESCE(${status ?? null}, status),
        assigned_staff_id = COALESCE(${assigned_staff_id ?? null}, assigned_staff_id),
        fare_amount = COALESCE(${fare_amount ?? null}, fare_amount),
        updated_at = now()
      WHERE id = ${tripId} AND provider_id = ${providerId}
      RETURNING *
    `;
    if (updated.length === 0) {
      return Response.json(
        { error: "Trip not found or not authorized" },
        { status: 404 },
      );
    }

    // Keep the linked booking's lifecycle in step (best-effort; the trip is the source of truth).
    if (status !== undefined && updated[0].booking_id) {
      await sql`
        UPDATE vet_appointments
        SET booking_status = ${BOOKING_STATUS[status]}, updated_at = now()
        WHERE id = ${updated[0].booking_id} AND provider_id = ${providerId}
      `;
    }

    return Response.json({ trip: updated[0] });
  } catch (e) {
    if (e instanceof ProviderAuthError) {
      return Response.json({ error: e.message }, { status: e.status ?? 403 });
    }
    console.error(
      "[PATCH /api/providers/[id]/transport-trips/[tripId]] Error:",
      e?.message,
    );
    return Response.json({ error: "Failed to update trip" }, { status: 500 });
  }
}

const wrappedPATCH = withRequestContext(PATCH);
export { wrappedPATCH as PATCH };
