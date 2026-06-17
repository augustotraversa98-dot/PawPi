import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import {
  requireProviderCapability,
  ProviderAuthError,
} from "@/app/api/utils/providerAuth";
import { assertCareAccess, CareAccessError } from "@/app/api/utils/careAccess";
import { withRequestContext } from "@/app/api/utils/requestContext";

// POST /api/providers/[id]/pets/[petId]/walk-sessions — a WALKER CHECKS IN: creates an
// in_progress walk session for the pet, assigned to themselves. Phase 2 ticket 2.7
// (docs/phase2-tickets/2.7-walking-gps.md).
//
// THREE gates, in order (none bypassed):
//   1. requireProviderCapability(providerId, 'walker') — the MODULE gate (2.1). A
//      provider that does not HOLD the walker capability 403s here, before any pet data
//      is touched. Capability ≠ data access.
//   2. assertCareAccess(petId, providerId, 'health_logs_write', …) — the PET-DATA gate
//      (mirrors the grooming route): active staff + an active grant whose scopes include
//      'health_logs_write'. Writes the care_access_audit row.
//   3. RLS on walk_sessions (0033) is the last line: provider INSERT requires
//      staff_user_id = the caller AND active staff of the provider (participant-scoped),
//      so the walker can only create the session they are assigned to.
//
// The session is the LIVE/operational record (status + the GPS point stream). The OWNER's
// health timeline is fed on FINISH (PATCH ?action=finish) via the EXISTING health-log
// write — NOT here. owner_user_id is derived from pets.owner_user_id so the session lands
// on the OWNER's record and is immediately visible to them (the live map).
//
// DB is porsager's tagged-template `sql` (SCHEMA_NOTES "neon→porsager"): every query is a
// tagged template; params bind via `${}`.
async function POST(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const providerId = params.id;
    const petId = params.petId;

    const staffUserId = await resolveUserId(session.user.id);
    if (staffUserId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    // GATE 1 — the provider must HOLD the 'walker' capability (2.1). 403 if not.
    await requireProviderCapability(providerId, "walker");

    const body = (await request.json()) ?? {};
    const { booking_id } = body;

    // GATE 2 — the pet-data gate (mirrors grooming). Throws CareAccessError(403) on
    // denial; writes the audit row on success.
    await assertCareAccess(petId, providerId, "health_logs_write", {
      staffUserId,
      action: "write",
      resource: "walk_sessions",
    });

    // Derive the owner from the pet — the session belongs to the pet owner's record.
    const petRows = await sql`
      SELECT owner_user_id FROM pets WHERE id = ${petId}
    `;
    if (petRows.length === 0) {
      return Response.json({ error: "Pet not found" }, { status: 404 });
    }
    const ownerUserId = petRows[0].owner_user_id;

    // If a booking is linked it must be THIS provider's booking for THIS pet (a walk the
    // owner actually booked). Only checked when given.
    if (booking_id !== undefined && booking_id !== null) {
      const bookingRows = await sql`
        SELECT id FROM vet_appointments
        WHERE id = ${booking_id}
          AND provider_id = ${providerId}
          AND pet_id = ${petId}
      `;
      if (bookingRows.length === 0) {
        return Response.json(
          { error: "Invalid booking for this walk session" },
          { status: 400 },
        );
      }
    }

    // Check in: create the in_progress session assigned to this walker. started_at is
    // stamped now; the route array starts empty (points stream in via PATCH ?action=track).
    const created = await sql`
      INSERT INTO walk_sessions (
        booking_id,
        pet_id,
        owner_user_id,
        provider_id,
        staff_user_id,
        status,
        started_at
      ) VALUES (
        ${booking_id ?? null},
        ${petId},
        ${ownerUserId},
        ${providerId},
        ${staffUserId},
        'in_progress',
        NOW()
      )
      RETURNING *
    `;

    return Response.json({ session: created[0] }, { status: 201 });
  } catch (e) {
    if (e instanceof ProviderAuthError || e instanceof CareAccessError) {
      return Response.json({ error: e.message }, { status: e.status ?? 403 });
    }
    console.error(
      "[POST /api/providers/[id]/pets/[petId]/walk-sessions] Error:",
      e?.message,
    );
    return Response.json(
      { error: "Failed to start walk session" },
      { status: 500 },
    );
  }
}

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md). Handler bodies are
// unchanged — only their DB connection is now request-scoped.
const wrappedPOST = withRequestContext(POST);
export { wrappedPOST as POST };
