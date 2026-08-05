import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// GET /api/me/bookings/[id] — the OWNER's single booking detail, for the read-only booking
// summary screen (My Activity → Past). The by-id counterpart to /api/me/bookings: same
// OWNER-context authorization (WHERE owner_user_id = me), so another owner's booking id
// matches no row → 404. vet_appointments RLS is the last line (identity-scoped via
// withRequestContext). Soft-deleted rows are excluded.
//
// Beyond the list fields, this also returns `notes` ("what was done") and the SETTLED payment
// — the amount actually captured — via the SAME order→payment(approved) relationship the
// provider side uses for refunds (payments WHERE order_id = … AND status='approved'). Amount
// comes from the approved payment, currency from the order. `paid` is null when there is no
// settled payment — which, with real MercadoPago charges parked (sandbox never settles), is
// the norm today: the client renders a clean empty state, NEVER a fabricated number.
//
// DB is porsager's tagged-template `sql` (SCHEMA_NOTES "neon→porsager"): every query is a
// tagged template; params bind via `${}`. Never sql(string, array).
async function GET(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    const rows = await sql`
      SELECT
        va.id,
        va.pet_id,
        va.provider_id,
        va.title,
        va.appointment_date,
        va.appointment_time,
        va.booking_status,
        va.status,
        va.capability,
        va.service_id,
        va.notes,
        p.name AS pet_name,
        pr.name AS provider_name,
        pr.slug AS provider_slug,
        s.name AS service_name,
        (
          SELECT pmt.amount_cents FROM payments pmt
          WHERE pmt.order_id = va.order_id AND pmt.status = 'approved'
          ORDER BY pmt.id DESC
          LIMIT 1
        ) AS paid_amount_cents,
        o.currency AS paid_currency,
        loc.id AS location_id,
        loc.name AS location_name,
        loc.address AS location_address,
        loc.hours_json AS location_hours_json,
        loc.lat AS location_lat,
        loc.lng AS location_lng
      FROM vet_appointments va
      LEFT JOIN pets p ON p.id = va.pet_id
      LEFT JOIN providers pr ON pr.id = va.provider_id
      LEFT JOIN provider_services s ON s.id = va.service_id
      LEFT JOIN orders o ON o.id = va.order_id
      -- The provider's PRIMARY location (lowest id = primary), same LATERAL discover uses.
      LEFT JOIN LATERAL (
        SELECT pl.id, pl.name, pl.address, pl.hours_json, pl.lat, pl.lng
        FROM provider_locations pl
        WHERE pl.provider_id = va.provider_id
        ORDER BY pl.id ASC
        LIMIT 1
      ) loc ON true
      WHERE va.id = ${params.id}
        AND va.owner_user_id = ${userId}
        AND va.deleted_at IS NULL
      LIMIT 1
    `;

    if (rows.length === 0) {
      return Response.json({ error: "Booking not found" }, { status: 404 });
    }

    const {
      paid_amount_cents,
      paid_currency,
      location_id,
      location_name,
      location_address,
      location_hours_json,
      location_lat,
      location_lng,
      ...booking
    } = rows[0];
    // Only a settled (approved) payment yields an amount; otherwise `paid` is null.
    const paid =
      paid_amount_cents != null
        ? { amount_cents: Number(paid_amount_cents), currency: paid_currency ?? "ARS" }
        : null;

    // The provider's primary location (null when the provider has none). lat/lng come back as
    // numeric strings from porsager — coerce like discover does.
    const location =
      location_id != null
        ? {
            name: location_name ?? null,
            address: location_address ?? null,
            hours_json: location_hours_json ?? null,
            lat: location_lat != null ? Number(location_lat) : null,
            lng: location_lng != null ? Number(location_lng) : null,
          }
        : null;

    return Response.json({ booking: { ...booking, paid, location } });
  } catch (error) {
    console.error("[GET /api/me/bookings/[id]] Error:", error?.message);
    return Response.json(
      { error: "Failed to fetch booking" },
      { status: 500 },
    );
  }
}

const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
