import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// /api/pets/[id]/training-programs — the OWNER enrolls in a trainer PROGRAM / books a 1:1
// course and reads their pet's enrollments (with per-session PROGRESS + VIDEO LESSONS).
// Phase 2 ticket 2.10 (docs/phase2-tickets/2.10-training.md).
//
// This is the PROVIDER training service (HIRING a trainer) — DISTINCT from the consumer
// self-Training tab (static content, no DB). It surfaces under Pet Services → Training.
//
// This is an OWNER-context route: authorization is pet OWNERSHIP (WHERE owner_user_id =
// me), NOT provider_staff membership — so it uses resolveUserId, never
// requireProviderCapability / assertCareAccess. training_programs RLS (0036) also enforces
// the owner FOR ALL policy as the last line. The trainer (a participant with a grant) logs
// progress the owner reads here.
//
// DB is porsager's tagged-template `sql` (SCHEMA_NOTES "neon→porsager"): every query is a
// tagged template; params bind via `${}`. Empty → empty array (the UI shows an empty state).
async function GET(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const petId = params.id;
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    // I must OWN the pet — cannot read another owner's programs.
    const petCheck = await sql`
      SELECT id FROM pets WHERE id = ${petId} AND owner_user_id = ${userId}
    `;
    if (petCheck.length === 0) {
      return Response.json(
        { error: "Pet not found or access denied" },
        { status: 403 },
      );
    }

    // The program enrollments + the trainer name for labelling. Newest first.
    const programs = await sql`
      SELECT
        tp.id, tp.booking_id, tp.pet_id, tp.owner_user_id, tp.provider_id, tp.service_id,
        tp.title, tp.total_sessions, tp.status, tp.video_lesson_urls, tp.created_at,
        p.name AS provider_name
      FROM training_programs tp
      LEFT JOIN providers p ON p.id = tp.provider_id
      WHERE tp.pet_id = ${petId}
        AND tp.owner_user_id = ${userId}
      ORDER BY tp.created_at DESC, tp.id DESC
    `;

    // Attach each program's per-session progress (owner-visible). RLS scopes to the owner.
    // Batched in one query (same fix as api/shop/orders/route.js) instead of one
    // round-trip per program.
    const programIds = programs.map((p) => p.id);
    const allProgress =
      programIds.length > 0
        ? await sql`
            SELECT
              pr.id, pr.session_id, pr.program_id, pr.pet_id, pr.attended,
              pr.progress_note, pr.video_lesson_urls, pr.status, pr.created_at,
              s.kind, s.title AS session_title, s.scheduled_at
            FROM training_progress pr
            LEFT JOIN training_sessions s ON s.id = pr.session_id
            WHERE pr.program_id = ANY(${programIds})
              AND pr.owner_user_id = ${userId}
            ORDER BY pr.program_id, s.scheduled_at NULLS LAST, pr.id
          `
        : [];

    const progressByProgramId = new Map();
    for (const p of allProgress) {
      if (!progressByProgramId.has(p.program_id)) progressByProgramId.set(p.program_id, []);
      progressByProgramId.get(p.program_id).push(p);
    }

    const enriched = programs.map((program) => ({
      ...program,
      progress: progressByProgramId.get(program.id) ?? [],
    }));

    return Response.json({ programs: enriched });
  } catch (error) {
    console.error(
      "[GET /api/pets/[id]/training-programs] Error:",
      error?.message,
    );
    return Response.json(
      { error: "Failed to fetch training programs" },
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

    const petId = params.id;
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    // I must OWN the pet — cannot enroll a pet I don't own.
    const petCheck = await sql`
      SELECT id FROM pets WHERE id = ${petId} AND owner_user_id = ${userId}
    `;
    if (petCheck.length === 0) {
      return Response.json(
        { error: "Pet not found or access denied" },
        { status: 403 },
      );
    }

    const body = (await request.json()) ?? {};
    const { provider_id, service_id, title, total_sessions, booking_id } = body;

    if (!provider_id || !title) {
      return Response.json(
        { error: "provider_id and title are required" },
        { status: 400 },
      );
    }
    const totalSessions =
      Number.isInteger(total_sessions) && total_sessions > 0
        ? total_sessions
        : 1;

    // Provider must exist, be published, AND HOLD the 'trainer' capability (you can only
    // book a service a provider offers — the module/capability gate, 2.1).
    const providerRows = await sql`
      SELECT id, status FROM providers WHERE id = ${provider_id}
    `;
    if (providerRows.length === 0 || providerRows[0].status !== "published") {
      return Response.json({ error: "Provider not found" }, { status: 404 });
    }
    const capRows = await sql`
      SELECT 1 FROM provider_capabilities
      WHERE provider_id = ${provider_id} AND capability = 'trainer'
    `;
    if (capRows.length === 0) {
      return Response.json(
        { error: "Provider does not offer training" },
        { status: 400 },
      );
    }

    // If a service is named it must belong to THIS provider.
    if (service_id !== undefined && service_id !== null) {
      const svcRows = await sql`
        SELECT id FROM provider_services
        WHERE id = ${service_id} AND provider_id = ${provider_id}
      `;
      if (svcRows.length === 0) {
        return Response.json(
          { error: "Invalid service for this provider" },
          { status: 400 },
        );
      }
    }

    // If a booking is linked it must be THIS provider's booking for THIS pet.
    if (booking_id !== undefined && booking_id !== null) {
      const bookingRows = await sql`
        SELECT id FROM vet_appointments
        WHERE id = ${booking_id}
          AND provider_id = ${provider_id}
          AND pet_id = ${petId}
      `;
      if (bookingRows.length === 0) {
        return Response.json(
          { error: "Invalid booking for this program" },
          { status: 400 },
        );
      }
    }

    // Create the enrollment (active) in OWNER context. owner_user_id = me (the RLS key).
    const created = await sql`
      INSERT INTO training_programs (
        booking_id, pet_id, owner_user_id, provider_id, service_id,
        title, total_sessions, status
      ) VALUES (
        ${booking_id ?? null}, ${petId}, ${userId}, ${provider_id},
        ${service_id ?? null}, ${title}, ${totalSessions}, 'active'
      )
      RETURNING *
    `;

    return Response.json({ program: created[0] }, { status: 201 });
  } catch (error) {
    console.error(
      "[POST /api/pets/[id]/training-programs] Error:",
      error?.message,
    );
    return Response.json(
      { error: "Failed to enroll in training program" },
      { status: 500 },
    );
  }
}

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md). Handler bodies are
// unchanged — only their DB connection is now request-scoped.
const wrappedGET = withRequestContext(GET);
const wrappedPOST = withRequestContext(POST);
export { wrappedGET as GET, wrappedPOST as POST };
