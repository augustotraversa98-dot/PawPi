import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import {
  requireProviderCapability,
  ProviderAuthError,
} from "@/app/api/utils/providerAuth";
import { assertCareAccess, CareAccessError } from "@/app/api/utils/careAccess";
import { withRequestContext } from "@/app/api/utils/requestContext";

// PATCH /api/providers/[id]/daycare-stays/[stayId] — facility staff CHECK a pet IN/OUT
// (or cancel) on a daycare/boarding stay. Phase 2 ticket 2.8
// (docs/phase2-tickets/2.8-daycare-boarding.md).
//
// Actions (?action= in the body):
//   * 'check_in'   — status booked → checked_in, stamp checked_in_at = now.
//   * 'check_out'  — status checked_in → checked_out, stamp checked_out_at = now.
//   * 'cancel'     — status → cancelled (frees the capacity slot).
//
// THREE gates, in order (none bypassed):
//   1. requireProviderCapability(providerId, 'daycare') — the MODULE gate (2.1).
//   2. assertCareAccess(petId, providerId, 'health_logs_write', …) — the PET-DATA gate
//      (mirrors grooming/walking): active staff + an active grant whose scopes include
//      'health_logs_write'. Writes the care_access_audit row. petId is read from the stay.
//   3. RLS on daycare_stays (0034): the UPDATE only matches a row the provider holds a
//      grant on — so a facility without the grant updates ZERO.
//
// DB is porsager's tagged-template `sql` (SCHEMA_NOTES "neon→porsager"): every query is a
// tagged template; params bind via `${}`.
async function PATCH(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const providerId = params.id;
    const stayId = params.stayId;
    const staffUserId = await resolveUserId(session.user.id);
    if (staffUserId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    // GATE 1 — the provider must HOLD the 'daycare' capability (2.1). 403 if not.
    await requireProviderCapability(providerId, "daycare");

    const body = (await request.json()) ?? {};
    const { action } = body;
    if (!["check_in", "check_out", "cancel"].includes(action)) {
      return Response.json(
        { error: "action must be 'check_in', 'check_out', or 'cancel'" },
        { status: 400 },
      );
    }

    // Load the stay — it must belong to this provider. (RLS also scopes the later UPDATE;
    // this read confirms existence + derives the pet.)
    const stayRows = await sql`
      SELECT id, pet_id, owner_user_id, status
      FROM daycare_stays
      WHERE id = ${stayId} AND provider_id = ${providerId}
    `;
    if (stayRows.length === 0) {
      return Response.json({ error: "Stay not found" }, { status: 404 });
    }
    const stay = stayRows[0];

    // GATE 2 — the pet-data gate (mirrors grooming/walking). 403 on denial; audits on
    // success.
    await assertCareAccess(stay.pet_id, providerId, "health_logs_write", {
      staffUserId,
      action: "write",
      resource: `daycare_stays:${stayId}`,
    });

    // Compute the target transition. Each action enforces its valid source status so the
    // lifecycle cannot skip (e.g. cannot check out a stay that was never checked in).
    let updated;
    if (action === "check_in") {
      updated = await sql`
        UPDATE daycare_stays
        SET status = 'checked_in', checked_in_at = NOW(), updated_at = NOW()
        WHERE id = ${stayId} AND status = 'booked'
        RETURNING *
      `;
    } else if (action === "check_out") {
      updated = await sql`
        UPDATE daycare_stays
        SET status = 'checked_out', checked_out_at = NOW(), updated_at = NOW()
        WHERE id = ${stayId} AND status = 'checked_in'
        RETURNING *
      `;
    } else {
      updated = await sql`
        UPDATE daycare_stays
        SET status = 'cancelled', updated_at = NOW()
        WHERE id = ${stayId} AND status = ANY (ARRAY['booked', 'checked_in'])
        RETURNING *
      `;
    }

    if (updated.length === 0) {
      // Either RLS denied (no grant) or the stay was not in the required source status.
      return Response.json(
        {
          error:
            "Cannot apply that action to this stay (wrong status or access denied)",
        },
        { status: 409 },
      );
    }

    return Response.json({ stay: updated[0] });
  } catch (e) {
    if (e instanceof ProviderAuthError || e instanceof CareAccessError) {
      return Response.json({ error: e.message }, { status: e.status ?? 403 });
    }
    console.error(
      "[PATCH /api/providers/[id]/daycare-stays/[stayId]] Error:",
      e?.message,
    );
    return Response.json(
      { error: "Failed to update stay" },
      { status: 500 },
    );
  }
}

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md). Handler bodies are
// unchanged — only their DB connection is now request-scoped.
const wrappedPATCH = withRequestContext(PATCH);
export { wrappedPATCH as PATCH };
