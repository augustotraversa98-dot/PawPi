import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// PATCH /api/transport-trips/[tripId] — the OWNER cancels their own trip (ticket 2.52). Owners can
// ONLY cancel (the transport_trips RLS owner-UPDATE WITH CHECK pins them to requested|cancelled —
// they can never self-advance to confirmed/en_route/completed). Mirrors the booking to cancelled.
//
// DB is porsager's tagged-template `sql`.
async function PATCH(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const tripId = params.tripId;
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }
    const body = (await request.json()) ?? {};
    if (body.status !== "cancelled") {
      return Response.json(
        { error: "Owners can only cancel a trip" },
        { status: 400 },
      );
    }

    const updated = await sql`
      UPDATE transport_trips
      SET status = 'cancelled', updated_at = now()
      WHERE id = ${tripId} AND owner_user_id = ${userId}
      RETURNING id, booking_id, status
    `;
    if (updated.length === 0) {
      return Response.json({ error: "Trip not found" }, { status: 404 });
    }
    if (updated[0].booking_id) {
      // Cancel the linked booking AND clear any device calendar event id (2.80): the
      // mobile client deletes the device event before cancelling, so the stored id is
      // now stale — null it server-side.
      await sql`
        UPDATE vet_appointments
        SET booking_status = 'cancelled', calendar_event_id = NULL, updated_at = now()
        WHERE id = ${updated[0].booking_id} AND owner_user_id = ${userId}
      `;
    }
    return Response.json({ trip: updated[0] });
  } catch (e) {
    console.error("[PATCH /api/transport-trips/[tripId]] Error:", e?.message);
    return Response.json({ error: "Failed to cancel trip" }, { status: 500 });
  }
}

const wrappedPATCH = withRequestContext(PATCH);
export { wrappedPATCH as PATCH };
