import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import {
  requireProviderRole,
  requireProviderCapability,
  ProviderAuthError,
  ALL_PROVIDER_ROLES,
} from "@/app/api/utils/providerAuth";
import { withRequestContext } from "@/app/api/utils/requestContext";

// GET /api/providers/[id]/daycare-stays — the facility's OCCUPANCY list: the stays the
// daycare cares for, so staff can run the check-in/out + report-card workflow and read the
// occupancy calendar. Phase 2 ticket 2.8 (docs/phase2-tickets/2.8-daycare-boarding.md).
//
// AUTH: this is OPERATIONAL — any ACTIVE staff may read the occupancy list and act on
// stays (front desk, not just owner/admin), so ALL_PROVIDER_ROLES. The MODULE gate
// requireProviderCapability(providerId,'daycare') runs first.
//
// CONSENT BOUNDARY: the per-row visibility is the daycare_stays RLS (0034) — a provider
// row is visible ONLY through app_provider_has_grant(pet_id,'health_logs_write'), so the
// facility sees a stay only for a pet the owner granted them access to. The FEEDING/MED
// INSTRUCTIONS the owner left ARE part of the stay the facility must act on, so they are
// returned here; they are NOT pet MEDICAL history (which still needs assertCareAccess).
//
// Optional ?status= and ?from=/?to= (date range) filter the calendar. DB is porsager's
// tagged-template `sql` (SCHEMA_NOTES "neon→porsager"): every query is a tagged template.
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

    await requireProviderCapability(providerId, "daycare");
    await requireProviderRole(providerId, userId, ALL_PROVIDER_ROLES);

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    // Build with sql.unsafe-free dynamic filtering via composable WHERE — but to keep the
    // porsager tagged-template safety we branch on the present filters. The base list joins
    // pet + owner + location names for the calendar. RLS scopes per-row visibility.
    const rows = await sql`
      SELECT
        ds.id, ds.booking_id, ds.pet_id, ds.owner_user_id, ds.provider_id, ds.location_id,
        ds.start_date, ds.end_date, ds.status,
        ds.feeding_instructions, ds.med_instructions,
        ds.checked_in_at, ds.checked_out_at, ds.created_at,
        p.name AS pet_name,
        COALESCE(up.full_name, up.username) AS owner_name,
        l.name AS location_name,
        (SELECT COUNT(*)::int FROM report_cards rc WHERE rc.stay_id = ds.id) AS report_card_count
      FROM daycare_stays ds
      LEFT JOIN pets p ON p.id = ds.pet_id
      LEFT JOIN user_profiles up ON up.id = ds.owner_user_id
      LEFT JOIN provider_locations l ON l.id = ds.location_id
      WHERE ds.provider_id = ${providerId}
        AND (${status}::text IS NULL OR ds.status = ${status})
        AND (${from}::date IS NULL OR ds.end_date >= ${from}::date)
        AND (${to}::date IS NULL OR ds.start_date <= ${to}::date)
      ORDER BY ds.start_date ASC, ds.id ASC
    `;

    return Response.json({ stays: rows });
  } catch (e) {
    if (e instanceof ProviderAuthError) {
      return Response.json({ error: e.message }, { status: e.status ?? 403 });
    }
    console.error(
      "[GET /api/providers/[id]/daycare-stays] Error:",
      e?.message,
    );
    return Response.json(
      { error: "Failed to fetch daycare stays" },
      { status: 500 },
    );
  }
}

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md). Handler bodies are
// unchanged — only their DB connection is now request-scoped.
const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
