import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { requireProviderRole } from "@/app/api/utils/providerAuth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// Owner-facing RAW availability windows — the config surface the extranet editor reads.
// This is DELIBERATELY separate from the public GET /api/providers/[id]/availability, which
// COMPUTES open slots for a PUBLISHED provider (published-gated, any authed user). This route
// instead returns the raw provider_availability ROWS so an owner|admin can display and edit
// them — including for a DRAFT provider (membership-gated, not published-gated).
//
// MVP scope: PROVIDER-WIDE windows only (staff_user_id/capability/location_id all NULL — what
// the 0076 seed created). Any non-provider-wide windows are NOT returned for editing, but their
// count is surfaced (scoped_count) so the editor can note they exist rather than hide them.

// List this provider's raw provider-wide availability windows — owner|admin only.
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

    // Config read — owner|admin only (default requireProviderRole gate), same as the writes.
    await requireProviderRole(providerId, userId);

    const windows = await sql`
      SELECT id, weekday, start_time, end_time, slot_minutes, active
      FROM provider_availability
      WHERE provider_id = ${providerId}
        AND staff_user_id IS NULL
        AND capability IS NULL
        AND location_id IS NULL
      ORDER BY weekday ASC, start_time ASC
    `;

    // Count the windows the editor does NOT manage (per-staff / per-capability / per-location)
    // so the UI can surface a note instead of silently hiding them.
    const scoped = await sql`
      SELECT COUNT(*)::int AS count
      FROM provider_availability
      WHERE provider_id = ${providerId}
        AND (staff_user_id IS NOT NULL OR capability IS NOT NULL OR location_id IS NOT NULL)
    `;

    return Response.json({ windows, scoped_count: scoped[0]?.count ?? 0 });
  } catch (error) {
    if (error.status === 403) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    console.error(
      "[GET /api/providers/[id]/availability/windows] Error:",
      error.message,
    );
    return Response.json(
      { error: "Failed to fetch availability windows" },
      { status: 500 },
    );
  }
}

// RLS R1-rollout: identity-scoped wrapper (docs/rls-hardening.md). Handler body is
// unchanged — only its DB connection is request-scoped.
const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
