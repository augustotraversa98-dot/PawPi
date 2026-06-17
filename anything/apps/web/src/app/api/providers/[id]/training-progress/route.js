import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import {
  requireProviderCapability,
  ProviderAuthError,
} from "@/app/api/utils/providerAuth";
import { assertCareAccess, CareAccessError } from "@/app/api/utils/careAccess";
import { withRequestContext } from "@/app/api/utils/requestContext";

// /api/providers/[id]/training-progress — the TRAINER reads a session's ROSTER (GET) and
// LOGS per-pet PROGRESS (POST). Phase 2 ticket 2.10 (docs/phase2-tickets/2.10-training.md).
//
// GET (?session_id=): gated by requireProviderCapability(providerId,'trainer'). Returns the
// progress/roster rows for the class/session; training_progress RLS (0036) scopes per-row
// visibility through app_provider_has_grant — the trainer sees only attendees whose owner
// granted them access.
//
// POST (log progress): THREE gates, in order (none bypassed):
//   1. requireProviderCapability(providerId,'trainer') — the MODULE gate (2.1).
//   2. assertCareAccess(petId, providerId, 'health_logs_write', …) — the PET-DATA gate
//      (mirrors grooming/walking/daycare/sitting): active staff + an active grant whose
//      scopes include 'health_logs_write'. Writes the care_access_audit row.
//   3. RLS on training_progress (0036): provider INSERT/UPDATE requires an active grant on
//      the pet — so a trainer without the grant writes ZERO.
//
// Video lessons reuse the existing Supabase Storage upload path; the route stores the URLs.
// The owner reads progress via GET /api/pets/[id]/training-programs.
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

    await requireProviderCapability(providerId, "trainer");

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("session_id");

    // The roster/progress rows for this provider (optionally one session). RLS scopes to the
    // grant — the trainer sees only attendees they hold access to.
    const rows = sessionId
      ? await sql`
          SELECT
            tp.id, tp.session_id, tp.program_id, tp.pet_id, tp.owner_user_id,
            tp.provider_id, tp.attended, tp.progress_note, tp.video_lesson_urls,
            tp.status, tp.created_at,
            p.name AS pet_name
          FROM training_progress tp
          LEFT JOIN pets p ON p.id = tp.pet_id
          WHERE tp.provider_id = ${providerId}
            AND tp.session_id = ${sessionId}
          ORDER BY tp.id
        `
      : await sql`
          SELECT
            tp.id, tp.session_id, tp.program_id, tp.pet_id, tp.owner_user_id,
            tp.provider_id, tp.attended, tp.progress_note, tp.video_lesson_urls,
            tp.status, tp.created_at,
            p.name AS pet_name
          FROM training_progress tp
          LEFT JOIN pets p ON p.id = tp.pet_id
          WHERE tp.provider_id = ${providerId}
          ORDER BY tp.id DESC
        `;

    return Response.json({ progress: rows });
  } catch (e) {
    if (e instanceof ProviderAuthError) {
      return Response.json({ error: e.message }, { status: e.status ?? 403 });
    }
    console.error(
      "[GET /api/providers/[id]/training-progress] Error:",
      e?.message,
    );
    return Response.json(
      { error: "Failed to fetch training progress" },
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
    const staffUserId = await resolveUserId(session.user.id);
    if (staffUserId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    // GATE 1 — the provider must HOLD the 'trainer' capability (2.1). 403 if not.
    await requireProviderCapability(providerId, "trainer");

    const body = (await request.json()) ?? {};
    const {
      progress_id,
      session_id,
      pet_id,
      program_id,
      attended,
      progress_note,
      video_lesson_urls,
      status,
    } = body;

    if (status !== undefined && !["booked", "completed", "cancelled"].includes(status)) {
      return Response.json(
        { error: "status must be 'booked', 'completed', or 'cancelled'" },
        { status: 400 },
      );
    }

    const videoUrls = Array.isArray(video_lesson_urls)
      ? video_lesson_urls.filter((u) => typeof u === "string" && u.length > 0)
      : [];

    // UPDATE path — the trainer logs onto an EXISTING roster/progress row (e.g. a class
    // attendee the owner already joined, or a program session). Resolve the pet from it.
    if (progress_id !== undefined && progress_id !== null) {
      const existing = await sql`
        SELECT id, pet_id, provider_id FROM training_progress
        WHERE id = ${progress_id} AND provider_id = ${providerId}
      `;
      if (existing.length === 0) {
        return Response.json({ error: "Progress row not found" }, { status: 404 });
      }
      const targetPet = existing[0].pet_id;

      // GATE 2 — the pet-data gate. 403 on denial; audits on success.
      await assertCareAccess(targetPet, providerId, "health_logs_write", {
        staffUserId,
        action: "write",
        resource: `training_progress:${progress_id}`,
      });

      const updated = await sql`
        UPDATE training_progress
        SET
          attended = COALESCE(${attended ?? null}, attended),
          progress_note = COALESCE(${progress_note ?? null}, progress_note),
          video_lesson_urls = CASE
            WHEN ${videoUrls.length > 0} THEN ${videoUrls}
            ELSE video_lesson_urls
          END,
          status = COALESCE(${status ?? null}, status),
          updated_at = now()
        WHERE id = ${progress_id} AND provider_id = ${providerId}
        RETURNING *
      `;
      if (updated.length === 0) {
        return Response.json(
          { error: "Not authorized to log progress for this pet" },
          { status: 403 },
        );
      }
      return Response.json({ progress: updated[0] });
    }

    // INSERT path — the trainer creates a new progress row (e.g. a 1:1 / program session).
    if (!session_id || !pet_id) {
      return Response.json(
        { error: "session_id and pet_id are required to create progress" },
        { status: 400 },
      );
    }

    // The session must belong to THIS provider.
    const sessionRows = await sql`
      SELECT id FROM training_sessions
      WHERE id = ${session_id} AND provider_id = ${providerId}
    `;
    if (sessionRows.length === 0) {
      return Response.json({ error: "Session not found" }, { status: 404 });
    }

    // Derive the owner from the pet (owner_user_id = pets.owner_user_id — the RLS owner key).
    const petRows = await sql`
      SELECT id, owner_user_id FROM pets WHERE id = ${pet_id}
    `;
    if (petRows.length === 0) {
      return Response.json({ error: "Pet not found" }, { status: 404 });
    }
    const ownerUserId = petRows[0].owner_user_id;

    // If a program is linked it must belong to THIS provider.
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

    // GATE 2 — the pet-data gate. 403 on denial; audits on success.
    await assertCareAccess(pet_id, providerId, "health_logs_write", {
      staffUserId,
      action: "write",
      resource: `training_progress:session:${session_id}:pet:${pet_id}`,
    });

    const created = await sql`
      INSERT INTO training_progress (
        session_id, program_id, pet_id, owner_user_id, provider_id,
        attended, progress_note, video_lesson_urls, status
      ) VALUES (
        ${session_id}, ${program_id ?? null}, ${pet_id}, ${ownerUserId}, ${providerId},
        ${attended ?? false}, ${progress_note ?? null}, ${videoUrls}, ${status ?? "completed"}
      )
      RETURNING *
    `;
    if (created.length === 0) {
      return Response.json(
        { error: "Not authorized to log progress for this pet" },
        { status: 403 },
      );
    }

    return Response.json({ progress: created[0] }, { status: 201 });
  } catch (e) {
    if (e instanceof ProviderAuthError || e instanceof CareAccessError) {
      return Response.json({ error: e.message }, { status: e.status ?? 403 });
    }
    console.error(
      "[POST /api/providers/[id]/training-progress] Error:",
      e?.message,
    );
    return Response.json(
      { error: "Failed to log training progress" },
      { status: 500 },
    );
  }
}

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md).
const wrappedGET = withRequestContext(GET);
const wrappedPOST = withRequestContext(POST);
export { wrappedGET as GET, wrappedPOST as POST };
