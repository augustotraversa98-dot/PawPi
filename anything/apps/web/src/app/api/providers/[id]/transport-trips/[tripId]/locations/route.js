import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import {
  requireProviderCapability,
  ProviderAuthError,
} from "@/app/api/utils/providerAuth";
import { withRequestContext } from "@/app/api/utils/requestContext";

// POST /api/providers/[id]/transport-trips/[tripId]/locations — the assigned DRIVER posts a live
// GPS ping while the trip is en_route (Wave 7 ticket 2.70; the 2.52 follow-up, mirrors walker-GPS
// 2.7). The capability gate is the module gate; the real guard is transport_trip_locations RLS —
// its INSERT WITH CHECK app_can_post_trip_location(trip_id) lets ONLY the assigned active driver
// insert, and ONLY while status='en_route'. The app-layer checks below turn those same conditions
// into clean 403/409 responses instead of an RLS error, and resolve posted_by_staff_id.
//
// DB is porsager's tagged-template `sql`.
function validCoord(v) {
  return Number.isFinite(Number(v));
}

async function POST(request, { params }) {
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
    const { lat, lng } = body;
    if (
      !validCoord(lat) ||
      !validCoord(lng) ||
      Math.abs(Number(lat)) > 90 ||
      Math.abs(Number(lng)) > 180
    ) {
      return Response.json(
        { error: "lat and lng must be valid coordinates" },
        { status: 400 },
      );
    }

    // Load the trip (staff_select RLS lets active staff read it). Missing/other-provider → 404.
    const tripRows = await sql`
      SELECT id, status, assigned_staff_id
      FROM transport_trips
      WHERE id = ${tripId} AND provider_id = ${providerId}
    `;
    if (tripRows.length === 0) {
      return Response.json(
        { error: "Trip not found or not authorized" },
        { status: 404 },
      );
    }
    const trip = tripRows[0];
    if (trip.status !== "en_route") {
      return Response.json(
        { error: "Location can only be posted while the trip is en route" },
        { status: 409 },
      );
    }

    // The caller's active staff row for this provider.
    const staffRows = await sql`
      SELECT id FROM provider_staff
      WHERE provider_id = ${providerId}
        AND user_profile_id = ${userId}
        AND status = 'active'
    `;
    const callerStaffId = staffRows[0]?.id ?? null;
    if (callerStaffId === null || callerStaffId !== trip.assigned_staff_id) {
      return Response.json(
        { error: "Only the assigned driver can post location" },
        { status: 403 },
      );
    }

    // INSERT — RLS WITH CHECK (app_can_post_trip_location) is the backstop.
    const inserted = await sql`
      INSERT INTO transport_trip_locations (trip_id, lat, lng, posted_by_staff_id)
      VALUES (${tripId}, ${Number(lat)}, ${Number(lng)}, ${callerStaffId})
      RETURNING id, trip_id, lat, lng, recorded_at
    `;
    return Response.json({ location: inserted[0] }, { status: 201 });
  } catch (e) {
    if (e instanceof ProviderAuthError) {
      return Response.json({ error: e.message }, { status: e.status ?? 403 });
    }
    console.error(
      "[POST /api/providers/[id]/transport-trips/[tripId]/locations] Error:",
      e?.message,
    );
    return Response.json({ error: "Failed to post location" }, { status: 500 });
  }
}

const wrappedPOST = withRequestContext(POST);
export { wrappedPOST as POST };
