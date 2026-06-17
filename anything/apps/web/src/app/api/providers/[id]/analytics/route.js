import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import {
  requireProviderRole,
  ProviderAuthError,
  ALL_PROVIDER_ROLES,
} from "@/app/api/utils/providerAuth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// GET /api/providers/[id]/analytics — the provider DASHBOARD HOME summary. Phase 2 ticket
// 2.14 (docs/phase2-tickets/2.14-dashboards-analytics.md). The single read that powers the
// at-a-glance business overview (recharts on the web side).
//
// SCOPE — this is PER-PROVIDER OPERATIONAL analytics on the LIVE RLS-scoped path. It aggregates
// ONLY rows that belong to THIS provider (every query is `WHERE provider_id = ${providerId}`),
// over tables the active staff already may read:
//   - revenue        → orders (2.3): paid orders billed to this provider, total + by-month.
//   - bookings        → vet_appointments (2.4): count over the last 6 months + the upcoming list.
//   - occupancy       → daycare_stays (2.8): currently-on-site (checked_in) + booked-ahead counts.
//   - rating          → provider_reviews (2.2): average + total review count.
//   - top services    → vet_appointments × provider_services (2.4): booking volume per service.
//
// It introduces NO cross-boundary read: there is no aggregation across providers/owners, no raw
// per-user data leaves the provider's own rows. The DEFERRED anonymized-predictions/analytics
// layer (separate read-only role + true anonymization + opt-in consent — PawPi_instructions.md)
// stays OUT of scope; this is the live operational path only.
//
// AUTH: any ACTIVE staff member may view the dashboard (read-only overview, not a config action),
// so ALL_PROVIDER_ROLES — mirroring the bookings/daycare inbox reads. RLS (orders/daycare_stays/
// provider_reviews/vet_appointments policies) is the last line: a non-staff caller's identity
// fails app_is_active_staff_of(provider_id) and every aggregate would return zero rows even if
// the membership gate were bypassed.
//
// DB is porsager's tagged-template `sql` (SCHEMA_NOTES "neon→porsager"): every query is a tagged
// template; params bind via `${}`. Never sql(string, array).
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

    // Active-staff gate. A removed/invited/non-member caller is denied here; even if it
    // weren't, the per-row RLS below would still return only this provider's rows.
    await requireProviderRole(providerId, userId, ALL_PROVIDER_ROLES);

    // ── REVENUE (orders 2.3) — paid orders billed to this provider. Total + a 6-month
    // by-month series (oldest→newest) for the revenue chart. amount_cents is summed; the
    // currency is the provider's de-facto currency (orders default 'ARS' — surface the
    // distinct currency so the UI labels it, falling back to 'ARS').
    const revenueTotalRows = await sql`
      SELECT
        COALESCE(SUM(amount_cents), 0)::bigint AS total_cents,
        COUNT(*)::int AS paid_order_count
      FROM orders
      WHERE provider_id = ${providerId} AND status = 'paid'
    `;
    const revenueByMonth = await sql`
      SELECT
        to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
        COALESCE(SUM(amount_cents), 0)::bigint AS revenue_cents,
        COUNT(*)::int AS order_count
      FROM orders
      WHERE provider_id = ${providerId}
        AND status = 'paid'
        AND created_at >= date_trunc('month', now()) - interval '5 months'
      GROUP BY date_trunc('month', created_at)
      ORDER BY date_trunc('month', created_at) ASC
    `;
    const currencyRows = await sql`
      SELECT currency, COUNT(*)::int AS n
      FROM orders
      WHERE provider_id = ${providerId} AND status = 'paid'
      GROUP BY currency
      ORDER BY n DESC
      LIMIT 1
    `;

    // ── BOOKINGS (vet_appointments 2.4) — a 6-month by-month booking-volume series + the
    // UPCOMING confirmed/requested list (next 10, soonest first). Soft-deleted excluded.
    const bookingsByMonth = await sql`
      SELECT
        to_char(date_trunc('month', appointment_date), 'YYYY-MM') AS month,
        COUNT(*)::int AS booking_count
      FROM vet_appointments
      WHERE provider_id = ${providerId}
        AND deleted_at IS NULL
        AND appointment_date >= (date_trunc('month', now()) - interval '5 months')::date
      GROUP BY date_trunc('month', appointment_date)
      ORDER BY date_trunc('month', appointment_date) ASC
    `;
    const upcomingBookings = await sql`
      SELECT
        va.id,
        va.pet_id,
        va.appointment_date,
        va.appointment_time,
        va.booking_status,
        va.status,
        va.capability,
        p.name AS pet_name,
        COALESCE(up.full_name, up.username) AS owner_name,
        s.name AS service_name
      FROM vet_appointments va
      LEFT JOIN pets p ON p.id = va.pet_id
      LEFT JOIN user_profiles up ON up.id = va.owner_user_id
      LEFT JOIN provider_services s ON s.id = va.service_id
      WHERE va.provider_id = ${providerId}
        AND va.deleted_at IS NULL
        AND va.appointment_date >= now()::date
        AND va.booking_status IN ('requested', 'confirmed')
      ORDER BY va.appointment_date ASC, va.appointment_time ASC
      LIMIT 10
    `;
    const bookingsTotalRows = await sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (
          WHERE appointment_date >= now()::date
            AND booking_status IN ('requested', 'confirmed')
        )::int AS upcoming
      FROM vet_appointments
      WHERE provider_id = ${providerId} AND deleted_at IS NULL
    `;

    // ── OCCUPANCY (daycare_stays 2.8) — currently on-site (checked_in) + booked-ahead. RLS
    // scopes per-row to granted pets; the counts reflect what this provider may see.
    const occupancyRows = await sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'checked_in')::int AS on_site,
        COUNT(*) FILTER (WHERE status = 'booked')::int AS booked_ahead
      FROM daycare_stays
      WHERE provider_id = ${providerId}
    `;

    // ── RATING (provider_reviews 2.2) — average rating + total reviews.
    const ratingRows = await sql`
      SELECT
        COUNT(*)::int AS review_count,
        COALESCE(ROUND(AVG(rating)::numeric, 2), 0) AS avg_rating
      FROM provider_reviews
      WHERE provider_id = ${providerId}
    `;

    // ── TOP SERVICES (vet_appointments × provider_services 2.4) — booking volume per service,
    // busiest first. Only this provider's own services/bookings; NULL service grouped out.
    const topServices = await sql`
      SELECT
        s.id AS service_id,
        s.name AS service_name,
        COUNT(va.id)::int AS booking_count
      FROM vet_appointments va
      JOIN provider_services s ON s.id = va.service_id
      WHERE va.provider_id = ${providerId}
        AND va.deleted_at IS NULL
      GROUP BY s.id, s.name
      ORDER BY booking_count DESC, s.name ASC
      LIMIT 5
    `;

    const revenue = revenueTotalRows[0] ?? { total_cents: 0, paid_order_count: 0 };
    const bookingsTotals = bookingsTotalRows[0] ?? { total: 0, upcoming: 0 };
    const occupancy = occupancyRows[0] ?? { on_site: 0, booked_ahead: 0 };
    const rating = ratingRows[0] ?? { review_count: 0, avg_rating: 0 };

    return Response.json({
      provider_id: Number(providerId),
      revenue: {
        total_cents: Number(revenue.total_cents),
        paid_order_count: Number(revenue.paid_order_count),
        currency: currencyRows[0]?.currency ?? "ARS",
        by_month: revenueByMonth.map((r) => ({
          month: r.month,
          revenue_cents: Number(r.revenue_cents),
          order_count: Number(r.order_count),
        })),
      },
      bookings: {
        total: Number(bookingsTotals.total),
        upcoming_count: Number(bookingsTotals.upcoming),
        by_month: bookingsByMonth.map((r) => ({
          month: r.month,
          booking_count: Number(r.booking_count),
        })),
        upcoming: upcomingBookings,
      },
      occupancy: {
        on_site: Number(occupancy.on_site),
        booked_ahead: Number(occupancy.booked_ahead),
      },
      rating: {
        review_count: Number(rating.review_count),
        avg_rating: Number(rating.avg_rating),
      },
      top_services: topServices.map((r) => ({
        service_id: r.service_id,
        service_name: r.service_name,
        booking_count: Number(r.booking_count),
      })),
    });
  } catch (error) {
    if (error instanceof ProviderAuthError || error.status === 403) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    console.error("[GET /api/providers/[id]/analytics] Error:", error?.message);
    return Response.json(
      { error: "Failed to load analytics" },
      { status: 500 },
    );
  }
}

// RLS R1-rollout: identity-scoped wrapper (docs/rls-hardening.md). Handler body is unchanged —
// only its DB connection is now request-scoped, so the aggregates run under the caller's RLS
// identity (no cross-provider read).
const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
