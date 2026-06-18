import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import {
  requireProviderCapability,
  ProviderAuthError,
} from "@/app/api/utils/providerAuth";
import { withRequestContext } from "@/app/api/utils/requestContext";

// /api/providers/[id]/transport-trips — pet-taxi trips on the spine (ticket 2.52).
//
// POST (OWNER books): gate the 'transport' capability (2.1), verify pet ownership, create the
//   generalized booking (2.4 — vet_appointments capability='transport') AND the transport_trip
//   detail in the SAME request. The trip is owner-scoped + status 'requested'. Fare is charged
//   later via payments (2.3); chat (2.5) is booking-scoped. A trip IS a booking, so it surfaces
//   in the existing provider Bookings inbox + the 2.24 Calendar automatically.
// GET (provider STAFF inbox): gate the capability; list THIS provider's trips. transport_trips
//   RLS scopes rows to active staff of the provider (a non-staff caller reads zero).
//
// DB is porsager's tagged-template `sql`.

const TRIP_TYPES = ["one_way", "round_trip"];

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

    // MODULE gate — the provider must HOLD the 'transport' capability (2.1). 403 if not.
    await requireProviderCapability(providerId, "transport");

    const body = (await request.json()) ?? {};
    const {
      petId,
      scheduled_at,
      pickup_address,
      pickup_lat,
      pickup_lng,
      dropoff_address,
      dropoff_lat,
      dropoff_lng,
      trip_type,
      pet_size,
      carrier_needed,
      notes,
    } = body;

    if (!petId) {
      return Response.json({ error: "petId is required" }, { status: 400 });
    }
    if (!scheduled_at) {
      return Response.json({ error: "scheduled_at is required" }, { status: 400 });
    }
    if (!pickup_address || !dropoff_address) {
      return Response.json(
        { error: "pickup_address and dropoff_address are required" },
        { status: 400 },
      );
    }
    const tripType = TRIP_TYPES.includes(trip_type) ? trip_type : "one_way";

    // Must OWN the pet.
    const petCheck = await sql`
      SELECT id FROM pets WHERE id = ${petId} AND owner_user_id = ${userId}
    `;
    if (petCheck.length === 0) {
      return Response.json({ error: "You do not own this pet" }, { status: 403 });
    }

    // Provider must exist + be published.
    const providerRows = await sql`
      SELECT id, name, status FROM providers WHERE id = ${providerId}
    `;
    if (providerRows.length === 0 || providerRows[0].status !== "published") {
      return Response.json({ error: "Provider not found" }, { status: 404 });
    }
    const provider = providerRows[0];

    // Derive the booking date/time from scheduled_at (a transport trip IS a booking, 2.4).
    const when = new Date(scheduled_at);
    const apptDate = when.toISOString().slice(0, 10);
    const apptTime = when.toISOString().slice(11, 16);

    // 1) The generalized booking (capability='transport'). Surfaces in the inbox + calendar.
    const booking = await sql`
      INSERT INTO vet_appointments (
        pet_id, owner_user_id, title, appointment_date, appointment_time,
        provider_id, capability, start_at, source, booking_status, status, notes
      ) VALUES (
        ${petId}, ${userId}, ${`Pet taxi with ${provider.name}`}, ${apptDate}, ${apptTime},
        ${providerId}, 'transport', ${scheduled_at}, 'owner', 'requested', 'scheduled', ${notes ?? null}
      )
      RETURNING id
    `;
    const bookingId = booking[0].id;

    // 2) The transport TRIP detail (owner-scoped, status 'requested'). Separate statement in the
    // SAME request tx — the trip's RLS WITH CHECK (owner=me, status='requested') is independent of
    // the booking row, so no CTE-snapshot issue.
    const trip = await sql`
      INSERT INTO transport_trips (
        booking_id, provider_id, pet_id, owner_user_id,
        pickup_lat, pickup_lng, pickup_address,
        dropoff_lat, dropoff_lng, dropoff_address,
        scheduled_at, trip_type, pet_size, carrier_needed, notes, status
      ) VALUES (
        ${bookingId}, ${providerId}, ${petId}, ${userId},
        ${pickup_lat ?? null}, ${pickup_lng ?? null}, ${pickup_address},
        ${dropoff_lat ?? null}, ${dropoff_lng ?? null}, ${dropoff_address},
        ${scheduled_at}, ${tripType}, ${pet_size ?? null}, ${carrier_needed === true},
        ${notes ?? null}, 'requested'
      )
      RETURNING *
    `;

    return Response.json({ trip: trip[0], booking_id: bookingId }, { status: 201 });
  } catch (e) {
    if (e instanceof ProviderAuthError) {
      return Response.json({ error: e.message }, { status: e.status ?? 403 });
    }
    console.error("[POST /api/providers/[id]/transport-trips] Error:", e?.message);
    return Response.json({ error: "Failed to book transport" }, { status: 500 });
  }
}

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
    await requireProviderCapability(providerId, "transport");

    // RLS scopes to active staff of the provider (non-staff → zero rows). Join pet/owner context.
    const trips = await sql`
      SELECT
        t.id, t.booking_id, t.pet_id, t.owner_user_id, t.provider_id,
        t.pickup_address, t.dropoff_address, t.scheduled_at, t.trip_type,
        t.pet_size, t.carrier_needed, t.assigned_staff_id, t.status, t.fare_amount,
        t.notes, t.created_at,
        p.name AS pet_name,
        COALESCE(up.full_name, up.username) AS owner_name
      FROM transport_trips t
      LEFT JOIN pets p ON p.id = t.pet_id
      LEFT JOIN user_profiles up ON up.id = t.owner_user_id
      WHERE t.provider_id = ${providerId}
      ORDER BY t.scheduled_at DESC NULLS LAST, t.id DESC
    `;
    return Response.json({ trips });
  } catch (e) {
    if (e instanceof ProviderAuthError) {
      return Response.json({ error: e.message }, { status: e.status ?? 403 });
    }
    console.error("[GET /api/providers/[id]/transport-trips] Error:", e?.message);
    return Response.json({ error: "Failed to fetch trips" }, { status: 500 });
  }
}

const wrappedPOST = withRequestContext(POST);
const wrappedGET = withRequestContext(GET);
export { wrappedPOST as POST, wrappedGET as GET };
