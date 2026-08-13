import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// Merge the pay_with_credit flag (ticket B4) onto a list of bookings via a SEPARATE guarded query,
// so the main SELECTs stay untouched and an unmigrated prod (no pay_with_credit column → 42703)
// degrades to all-false rather than 500ing.
async function withPayWithCredit(bookings) {
  if (!Array.isArray(bookings) || bookings.length === 0) return bookings;
  const ids = bookings.map((b) => b.id);
  let flags = {};
  try {
    const rows = await sql`
      SELECT id, pay_with_credit FROM vet_appointments WHERE id = ANY(${ids})
    `;
    flags = Object.fromEntries(
      (Array.isArray(rows) ? rows : []).map((r) => [r.id, r.pay_with_credit === true]),
    );
  } catch (e) {
    if (e?.code !== "42703" && !/does not exist/i.test(e?.message ?? "")) throw e;
  }
  return bookings.map((b) => ({ ...b, pay_with_credit: flags[b.id] ?? false }));
}

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
//
// Upcoming/past boundary: the DB session runs in UTC (confirmed via `SHOW timezone`), so a bare
// `now()::date` compares against the UTC calendar date, not the caller's. For a negative-offset
// timezone (e.g. Buenos Aires, UTC-3) that's wrong for ~3 hours every day (UTC 00:00-03:00, i.e.
// 21:00-24:00 local the previous day): a booking dated the caller's actual "today" has already
// rolled to DB-"tomorrow minus a day" territory and gets bucketed into `past`. Accept the caller's
// own local calendar date as `?today=YYYY-MM-DD` (mobile sends it via canonicalDateTime's
// toCanonicalDate) and use it as the boundary; fall back to `now()::date` when absent/invalid so
// any other caller keeps the previous (UTC) behavior unchanged.
// Validates "YYYY-MM-DD" and rejects impossible calendar dates (e.g. "2026-13-40",
// "2026-02-30") that a bare shape regex would let through and the DB would then reject as an
// invalid date literal. Returns the original string (never a Date — this only ever feeds a
// parameterized ::date cast) or null.
function parseCanonicalDateParam(value) {
  const m = typeof value === "string" && value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [, year, month, day] = m.map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  const roundTrips =
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day;
  return roundTrips ? value : null;
}

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

    const { searchParams } = new URL(request.url);
    const clientToday = parseCanonicalDateParam(searchParams.get("today"));

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
        s.name AS service_name,
        (
          SELECT ts.status FROM telehealth_sessions ts
          WHERE ts.booking_id = va.id
          ORDER BY ts.created_at DESC
          LIMIT 1
        ) AS telehealth_session_status
      FROM vet_appointments va
      LEFT JOIN pets p ON p.id = va.pet_id
      LEFT JOIN providers pr ON pr.id = va.provider_id
      LEFT JOIN provider_services s ON s.id = va.service_id
      WHERE va.owner_user_id = ${userId}
        AND va.deleted_at IS NULL
        AND va.appointment_date >= COALESCE(${clientToday}::date, now()::date)
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
        s.name AS service_name,
        (
          SELECT ts.status FROM telehealth_sessions ts
          WHERE ts.booking_id = va.id
          ORDER BY ts.created_at DESC
          LIMIT 1
        ) AS telehealth_session_status
      FROM vet_appointments va
      LEFT JOIN pets p ON p.id = va.pet_id
      LEFT JOIN providers pr ON pr.id = va.provider_id
      LEFT JOIN provider_services s ON s.id = va.service_id
      WHERE va.owner_user_id = ${userId}
        AND va.deleted_at IS NULL
        AND va.appointment_date < COALESCE(${clientToday}::date, now()::date)
      ORDER BY va.appointment_date DESC, va.appointment_time DESC
      LIMIT 50
    `;

    return Response.json({
      upcoming: await withPayWithCredit(upcoming),
      past: await withPayWithCredit(past),
    });
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
