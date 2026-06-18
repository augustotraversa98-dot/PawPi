import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// GET /api/transport-trips/[tripId]/track — the live track for a trip (Wave 7 ticket 2.70). Serves
// BOTH the owner and provider staff: the trip's pickup/dropoff + status, plus the ordered GPS pings.
// There is no app-layer membership gate — RLS does the scoping uniformly: transport_trips_*_select
// lets the owner + active staff read the trip (else zero → 404), and transport_trip_locations'
// app_can_read_trip_location scopes the pings to owner + driver + active staff. An outsider or
// another provider's staff sees the trip as not-found and never any ping.
//
// DB is porsager's tagged-template `sql`.
async function GET(request, { params }) {
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

    // RLS-scoped trip read (owner or active staff). Missing/unauthorized → 404.
    const tripRows = await sql`
      SELECT
        id, status, provider_id, pet_id,
        pickup_lat, pickup_lng, pickup_address,
        dropoff_lat, dropoff_lng, dropoff_address
      FROM transport_trips
      WHERE id = ${tripId}
    `;
    if (tripRows.length === 0) {
      return Response.json(
        { error: "Trip not found or not authorized" },
        { status: 404 },
      );
    }

    // RLS-scoped pings (owner + driver + active staff), oldest→newest so the polyline draws in order.
    const locations = await sql`
      SELECT id, lat, lng, recorded_at
      FROM transport_trip_locations
      WHERE trip_id = ${tripId}
      ORDER BY recorded_at ASC, id ASC
    `;

    return Response.json({ trip: tripRows[0], locations });
  } catch (e) {
    console.error(
      "[GET /api/transport-trips/[tripId]/track] Error:",
      e?.message,
    );
    return Response.json({ error: "Failed to load track" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
