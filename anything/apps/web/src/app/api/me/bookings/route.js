import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// GET /api/me/bookings — the OWNER's bookings ACROSS ALL SERVICES, for the owner hub. Phase 2
// ticket 2.14 (docs/phase2-tickets/2.14-dashboards-analytics.md). The owner-side counterpart to
// the per-provider booking inbox: one unified list of every appointment the signed-in owner made
// with ANY provider (vet, groomer, walker, daycare, sitter, trainer — all live on
// vet_appointments via 2.4's generalized booking).
//
// OWNER-context: authorization is the caller's own identity (WHERE owner_user_id = me), exactly
// like every other owner-data route (/api/shop/orders, /api/care-access/grants). It does NOT use
// requireProviderRole. Another owner's bookings never match the WHERE clause; vet_appointments
// RLS is the last line. Soft-deleted rows are excluded.
//
// Split into upcoming (today onward, soonest first) + past (before today, most recent first) so
// the hub can render the two sections without client-side date math. Each row carries the
// provider + pet + service names so the hub links into the existing per-feature screens without
// extra lookups. No new cross-boundary read.
//
// DB is porsager's tagged-template `sql` (SCHEMA_NOTES "neon→porsager"): every query is a tagged
// template; params bind via `${}`. Never sql(string, array).
async function GET(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    const upcoming = await sql`
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
        p.name AS pet_name,
        pr.name AS provider_name,
        pr.slug AS provider_slug,
        s.name AS service_name
      FROM vet_appointments va
      LEFT JOIN pets p ON p.id = va.pet_id
      LEFT JOIN providers pr ON pr.id = va.provider_id
      LEFT JOIN provider_services s ON s.id = va.service_id
      WHERE va.owner_user_id = ${userId}
        AND va.deleted_at IS NULL
        AND va.appointment_date >= now()::date
      ORDER BY va.appointment_date ASC, va.appointment_time ASC
    `;

    const past = await sql`
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
        p.name AS pet_name,
        pr.name AS provider_name,
        pr.slug AS provider_slug,
        s.name AS service_name
      FROM vet_appointments va
      LEFT JOIN pets p ON p.id = va.pet_id
      LEFT JOIN providers pr ON pr.id = va.provider_id
      LEFT JOIN provider_services s ON s.id = va.service_id
      WHERE va.owner_user_id = ${userId}
        AND va.deleted_at IS NULL
        AND va.appointment_date < now()::date
      ORDER BY va.appointment_date DESC, va.appointment_time DESC
      LIMIT 50
    `;

    return Response.json({ upcoming, past });
  } catch (error) {
    console.error("[GET /api/me/bookings] Error:", error?.message);
    return Response.json(
      { error: "Failed to fetch bookings" },
      { status: 500 },
    );
  }
}

const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
