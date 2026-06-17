import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import {
  requireProviderCapability,
  ProviderAuthError,
} from "@/app/api/utils/providerAuth";
import { assertCareAccess, CareAccessError } from "@/app/api/utils/careAccess";
import { withRequestContext } from "@/app/api/utils/requestContext";

// POST /api/providers/[id]/pets/[petId]/groom-sessions — a GROOMER logs a grooming
// session against a pet: before/after photos (→ pet profile) + coat/skin notes (→ the
// pet's health timeline). Phase 2 ticket 2.6 (docs/phase2-tickets/2.6-grooming.md).
//
// THREE gates, in order (none bypassed):
//   1. requireProviderCapability(providerId, 'groomer') — the MODULE gate (2.1). A
//      provider that does not HOLD the groomer capability 403s here, before any pet
//      data is touched. Capability ≠ data access.
//   2. assertCareAccess(petId, providerId, 'health_logs_write', …) — the PET-DATA gate
//      (mirrors the vet_notes route's assertCareAccess): active staff + an active grant
//      whose scopes include 'health_logs_write'. Writes the care_access_audit row.
//   3. RLS on groom_sessions (0032) is the last line: provider INSERT requires the same
//      health_logs_write grant.
//
// The COAT/SKIN NOTES flow into the pet's HEALTH TIMELINE via the EXISTING health-log
// write — a health_general_checks row (skin_fur_status + notes) in OWNER context
// (owner_user_id = pets.owner_user_id), exactly the table /api/health/timeline already
// surfaces as a 'general_check' event. We do NOT invent a parallel timeline write. The
// before/after URLs live on the groom_sessions row and surface on the PET PROFILE.
//
// owner_user_id is derived from pets.owner_user_id so the session + health note land on
// the OWNER's record and are immediately visible to them (same as the notes route).
//
// DB is porsager's tagged-template `sql` (SCHEMA_NOTES "neon→porsager"): every query is
// a tagged template; params bind via `${}`.
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

    // GATE 1 — the provider must HOLD the 'groomer' capability (2.1). 403 if not.
    await requireProviderCapability(providerId, "groomer");

    const body = (await request.json()) ?? {};
    const {
      booking_id,
      before_urls,
      after_urls,
      coat_skin_notes,
      products_used,
      next_due_at,
    } = body;

    // Normalize the URL arrays — only string URLs, default to empty (an early session
    // may carry only "before" photos, or notes with no photos yet).
    const beforeUrls = Array.isArray(before_urls)
      ? before_urls.filter((u) => typeof u === "string" && u.length > 0)
      : [];
    const afterUrls = Array.isArray(after_urls)
      ? after_urls.filter((u) => typeof u === "string" && u.length > 0)
      : [];

    // A session must carry SOMETHING — at least one photo or a coat/skin note. An empty
    // POST is a 400 (no fake/empty rows).
    if (
      beforeUrls.length === 0 &&
      afterUrls.length === 0 &&
      !coat_skin_notes &&
      !products_used
    ) {
      return Response.json(
        {
          error:
            "A grooming session needs at least one photo or a coat/skin note",
        },
        { status: 400 },
      );
    }

    // GATE 2 — the pet-data gate (mirrors vet_notes). Throws CareAccessError(403) on
    // denial; writes the audit row on success.
    await assertCareAccess(petId, providerId, "health_logs_write", {
      staffUserId,
      action: "write",
      resource: "groom_sessions",
    });

    // Derive the owner from the pet — the session belongs to the pet owner's record.
    const petRows = await sql`
      SELECT owner_user_id FROM pets WHERE id = ${petId}
    `;
    if (petRows.length === 0) {
      return Response.json({ error: "Pet not found" }, { status: 404 });
    }
    const ownerUserId = petRows[0].owner_user_id;

    // If a booking is linked it must be THIS provider's booking for THIS pet (a groom
    // the owner actually booked). Only checked when given.
    if (booking_id !== undefined && booking_id !== null) {
      const bookingRows = await sql`
        SELECT id FROM vet_appointments
        WHERE id = ${booking_id}
          AND provider_id = ${providerId}
          AND pet_id = ${petId}
      `;
      if (bookingRows.length === 0) {
        return Response.json(
          { error: "Invalid booking for this groom session" },
          { status: 400 },
        );
      }
    }

    // Insert the session row (before/after photos surface on the pet profile).
    const created = await sql`
      INSERT INTO groom_sessions (
        booking_id,
        pet_id,
        owner_user_id,
        provider_id,
        before_urls,
        after_urls,
        coat_skin_notes,
        products_used,
        next_due_at
      ) VALUES (
        ${booking_id ?? null},
        ${petId},
        ${ownerUserId},
        ${providerId},
        ${beforeUrls},
        ${afterUrls},
        ${coat_skin_notes ?? null},
        ${products_used ?? null},
        ${next_due_at ?? null}
      )
      RETURNING *
    `;

    // Route the coat/skin observation into the pet's HEALTH TIMELINE via the EXISTING
    // health-log write — a health_general_checks row in OWNER context. This is the same
    // table /api/health/timeline reads as a 'general_check' event, so the owner sees the
    // groomer's coat/skin note in Health with no parallel timeline path. Only written
    // when there IS a note (no empty health rows).
    let healthLog = null;
    if (coat_skin_notes) {
      const groomNote = products_used
        ? `${coat_skin_notes}\n\nProducts used: ${products_used}`
        : coat_skin_notes;
      const healthRows = await sql`
        INSERT INTO health_general_checks (
          pet_id, owner_user_id, skin_fur_status, notes
        ) VALUES (
          ${petId}, ${ownerUserId}, ${coat_skin_notes}, ${groomNote}
        )
        RETURNING *
      `;
      healthLog = healthRows[0];
    }

    return Response.json(
      { session: created[0], healthLog },
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof ProviderAuthError || e instanceof CareAccessError) {
      return Response.json({ error: e.message }, { status: e.status ?? 403 });
    }
    console.error(
      "[POST /api/providers/[id]/pets/[petId]/groom-sessions] Error:",
      e?.message,
    );
    return Response.json(
      { error: "Failed to log groom session" },
      { status: 500 },
    );
  }
}

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md). Handler
// bodies are unchanged — only their DB connection is now request-scoped.
const wrappedPOST = withRequestContext(POST);
export { wrappedPOST as POST };
