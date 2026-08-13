import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import {
  requireProviderCapability,
  ProviderAuthError,
} from "@/app/api/utils/providerAuth";
import { withRequestContext } from "@/app/api/utils/requestContext";

// Merge the pickup point (ticket B3/B5) onto a list of sessions via a SEPARATE guarded query, so
// the main SELECT stays untouched and an unmigrated prod (no pickup_lat/lng columns → 42703)
// degrades to null-pickup rather than 500ing the live walker history/list.
async function withPickup(sessions) {
  if (!Array.isArray(sessions) || sessions.length === 0) return sessions;
  const ids = sessions.map((s) => s.id);
  let map = {};
  try {
    const rows = await sql`
      SELECT id, pickup_lat, pickup_lng, credit_pack_id
      FROM walk_sessions
      WHERE id = ANY(${ids})
    `;
    map = Object.fromEntries(
      (Array.isArray(rows) ? rows : []).map((r) => [
        r.id,
        { pickup_lat: r.pickup_lat, pickup_lng: r.pickup_lng, credit_pack_id: r.credit_pack_id },
      ]),
    );
  } catch (e) {
    if (e?.code !== "42703" && !/does not exist/i.test(e?.message ?? "")) throw e;
    // columns absent (unmigrated) → leave pickup null
  }
  return sessions.map((s) => ({
    ...s,
    pickup_lat: map[s.id]?.pickup_lat ?? null,
    pickup_lng: map[s.id]?.pickup_lng ?? null,
    credit_pack_id: map[s.id]?.credit_pack_id ?? null,
  }));
}

// GET /api/providers/[id]/walk-sessions — the WALKER's OWN assigned walk sessions for this
// provider (the walker app's active/finished list). Phase 2 ticket 2.7
// (docs/phase2-tickets/2.7-walking-gps.md).
//
// Gated by requireProviderCapability(providerId, 'walker') — the MODULE gate. The result
// is the walker's OWN sessions only: the WHERE staff_user_id = me is the app mirror of the
// walk_sessions RLS provider-read policy (participant-scoped — a walker never sees another
// walker's session, so live location stays participant-only). No assertCareAccess here:
// this returns only the sessions already assigned to the caller (operational metadata +
// the live route they themselves posted), not arbitrary pet data.
//
// DB is porsager's tagged-template `sql` (SCHEMA_NOTES "neon→porsager"): every query is a
// tagged template; params bind via `${}`.
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

    // MODULE gate — the provider must hold the 'walker' capability (2.1). 403 if not.
    await requireProviderCapability(providerId, "walker");

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    // The walker's OWN sessions for this provider (staff_user_id = me). Join pet/owner
    // context for the card. Optional ?status= filter (two tagged-template variants — never
    // sql(string, array)). Newest first. Empty → empty array (the UI shows an empty state).
    const sessions = status
      ? await sql`
          SELECT
            ws.id, ws.booking_id, ws.pet_id, ws.owner_user_id, ws.provider_id,
            ws.staff_user_id, ws.status, ws.started_at, ws.ended_at, ws.distance_m,
            ws.duration_s, ws.route, ws.potty_pee, ws.potty_poo, ws.notes,
            ws.photo_urls, ws.created_at,
            p.name AS pet_name,
            COALESCE(up.full_name, up.username) AS owner_name
          FROM walk_sessions ws
          LEFT JOIN pets p ON p.id = ws.pet_id
          LEFT JOIN user_profiles up ON up.id = ws.owner_user_id
          WHERE ws.provider_id = ${providerId}
            AND ws.staff_user_id = ${userId}
            AND ws.status = ${status}
          ORDER BY ws.created_at DESC
        `
      : await sql`
          SELECT
            ws.id, ws.booking_id, ws.pet_id, ws.owner_user_id, ws.provider_id,
            ws.staff_user_id, ws.status, ws.started_at, ws.ended_at, ws.distance_m,
            ws.duration_s, ws.route, ws.potty_pee, ws.potty_poo, ws.notes,
            ws.photo_urls, ws.created_at,
            p.name AS pet_name,
            COALESCE(up.full_name, up.username) AS owner_name
          FROM walk_sessions ws
          LEFT JOIN pets p ON p.id = ws.pet_id
          LEFT JOIN user_profiles up ON up.id = ws.owner_user_id
          WHERE ws.provider_id = ${providerId}
            AND ws.staff_user_id = ${userId}
          ORDER BY ws.created_at DESC
        `;

    return Response.json({ sessions: await withPickup(sessions) });
  } catch (e) {
    if (e instanceof ProviderAuthError) {
      return Response.json({ error: e.message }, { status: e.status ?? 403 });
    }
    console.error(
      "[GET /api/providers/[id]/walk-sessions] Error:",
      e?.message,
    );
    return Response.json(
      { error: "Failed to fetch walk sessions" },
      { status: 500 },
    );
  }
}

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md). Handler bodies are
// unchanged — only their DB connection is now request-scoped.
const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
