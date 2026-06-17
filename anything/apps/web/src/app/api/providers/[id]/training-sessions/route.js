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

// /api/providers/[id]/training-sessions — a trainer's session SCHEDULE: 1:1 sessions,
// GROUP CLASSES (capacity), and program sessions. Phase 2 ticket 2.10
// (docs/phase2-tickets/2.10-training.md).
//
// GET: gated by requireProviderCapability(providerId,'trainer') — the MODULE gate. Returns
// the provider's sessions; training_sessions RLS (0036) scopes per-row visibility (active
// staff see all; a PUBLISHED provider's sessions are public-readable so an OWNER can browse
// classes to join). The route does NOT require provider_staff membership — it is the shared
// "browse this trainer's classes" surface AND the trainer's own schedule. Optional
// ?kind=group_class filters to bookable classes.
//
// POST (manage a session/class): TWO gates, in order (none bypassed):
//   1. requireProviderCapability(providerId,'trainer') — the MODULE gate (2.1).
//   2. requireProviderRole(providerId, me, ALL_PROVIDER_ROLES) — active staff manage the
//      schedule (front desk + trainers, not just owner/admin).
//   3. RLS on training_sessions (0036): the staff_all policy requires active staff of the
//      provider — so a non-staff caller inserts ZERO. This is trainer CONFIGURATION (a class
//      slot), NOT pet data, so there is no assertCareAccess here (capacity is configured;
//      pet data is touched only when progress is logged — see training-progress).
//
// DB is porsager's tagged-template `sql` (SCHEMA_NOTES "neon→porsager").
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

    // MODULE gate — the provider must hold the 'trainer' capability (2.1). 403 if not.
    await requireProviderCapability(providerId, "trainer");

    const { searchParams } = new URL(request.url);
    const kind = searchParams.get("kind");

    // For a group class, also report the live attendee count + remaining seats so the owner
    // (or the trainer) sees fullness. RLS scopes which rows are visible to the caller.
    const sessions = kind
      ? await sql`
          SELECT
            s.id, s.provider_id, s.service_id, s.program_id, s.kind, s.title,
            s.scheduled_at, s.capacity, s.status, s.created_at,
            (
              SELECT COUNT(*)::int FROM training_progress tp
              WHERE tp.session_id = s.id
                AND tp.status = ANY (ARRAY['booked', 'completed'])
            ) AS attendee_count
          FROM training_sessions s
          WHERE s.provider_id = ${providerId}
            AND s.kind = ${kind}
          ORDER BY s.scheduled_at NULLS LAST, s.id DESC
        `
      : await sql`
          SELECT
            s.id, s.provider_id, s.service_id, s.program_id, s.kind, s.title,
            s.scheduled_at, s.capacity, s.status, s.created_at,
            (
              SELECT COUNT(*)::int FROM training_progress tp
              WHERE tp.session_id = s.id
                AND tp.status = ANY (ARRAY['booked', 'completed'])
            ) AS attendee_count
          FROM training_sessions s
          WHERE s.provider_id = ${providerId}
          ORDER BY s.scheduled_at NULLS LAST, s.id DESC
        `;

    return Response.json({ sessions });
  } catch (e) {
    if (e instanceof ProviderAuthError) {
      return Response.json({ error: e.message }, { status: e.status ?? 403 });
    }
    console.error(
      "[GET /api/providers/[id]/training-sessions] Error:",
      e?.message,
    );
    return Response.json(
      { error: "Failed to fetch training sessions" },
      { status: 500 },
    );
  }
}

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

    // GATE 1 — the provider must HOLD the 'trainer' capability (2.1). 403 if not.
    await requireProviderCapability(providerId, "trainer");
    // GATE 2 — active staff manage the schedule.
    await requireProviderRole(providerId, userId, ALL_PROVIDER_ROLES);

    const body = (await request.json()) ?? {};
    const { service_id, program_id, kind, title, scheduled_at, capacity } = body;

    if (kind !== undefined && !["one_on_one", "group_class", "program"].includes(kind)) {
      return Response.json(
        { error: "kind must be 'one_on_one', 'group_class', or 'program'" },
        { status: 400 },
      );
    }
    if (capacity !== undefined && capacity !== null) {
      if (!Number.isInteger(capacity) || capacity <= 0) {
        return Response.json(
          { error: "capacity must be a positive integer" },
          { status: 400 },
        );
      }
    }

    // If a service is named it must belong to THIS provider.
    if (service_id !== undefined && service_id !== null) {
      const svcRows = await sql`
        SELECT id FROM provider_services
        WHERE id = ${service_id} AND provider_id = ${providerId}
      `;
      if (svcRows.length === 0) {
        return Response.json(
          { error: "Invalid service for this provider" },
          { status: 400 },
        );
      }
    }

    // If a program is named it must belong to THIS provider.
    if (program_id !== undefined && program_id !== null) {
      const progRows = await sql`
        SELECT id FROM training_programs
        WHERE id = ${program_id} AND provider_id = ${providerId}
      `;
      if (progRows.length === 0) {
        return Response.json(
          { error: "Invalid program for this provider" },
          { status: 400 },
        );
      }
    }

    // Create the session. RLS scopes to active staff (no membership → zero rows).
    const created = await sql`
      INSERT INTO training_sessions (
        provider_id, service_id, program_id, kind, title, scheduled_at, capacity, status
      ) VALUES (
        ${providerId}, ${service_id ?? null}, ${program_id ?? null},
        ${kind ?? "one_on_one"}, ${title ?? null}, ${scheduled_at ?? null},
        ${capacity ?? null}, 'scheduled'
      )
      RETURNING *
    `;
    if (created.length === 0) {
      return Response.json(
        { error: "Not authorized to create a session for this provider" },
        { status: 403 },
      );
    }

    return Response.json({ session: created[0] }, { status: 201 });
  } catch (e) {
    if (e instanceof ProviderAuthError) {
      return Response.json({ error: e.message }, { status: e.status ?? 403 });
    }
    console.error(
      "[POST /api/providers/[id]/training-sessions] Error:",
      e?.message,
    );
    return Response.json(
      { error: "Failed to create training session" },
      { status: 500 },
    );
  }
}

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md).
const wrappedGET = withRequestContext(GET);
const wrappedPOST = withRequestContext(POST);
export { wrappedGET as GET, wrappedPOST as POST };
