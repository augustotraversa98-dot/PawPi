import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import {
  requireProviderCapability,
  ProviderAuthError,
} from "@/app/api/utils/providerAuth";
import { assertCareAccess, CareAccessError } from "@/app/api/utils/careAccess";
import { withRequestContext } from "@/app/api/utils/requestContext";

// PATCH /api/providers/[id]/sitting-visits/[visitId] — the assigned SITTER edits a logged
// visit: append a note / photos / video / a location check-in, or change the status
// (e.g. mark a scheduled visit completed, or cancel). Phase 2 ticket 2.9
// (docs/phase2-tickets/2.9-sitting.md).
//
// THREE gates, in order (none bypassed):
//   1. requireProviderCapability(providerId, 'sitter') — the MODULE gate (2.1).
//   2. assertCareAccess(petId, providerId, 'health_logs_write', …) — the PET-DATA gate
//      (mirrors grooming/walking/daycare): active staff + an active grant whose scopes
//      include 'health_logs_write'. Writes the care_access_audit row. petId is read from
//      the visit.
//   3. RLS on sitting_visits (0035): the UPDATE only matches a visit the sitter is the
//      assigned staff of (staff_user_id = me) — so a non-assigned sitter / outsider
//      updates ZERO (visit media stays participant-only).
//
// DB is porsager's tagged-template `sql` (SCHEMA_NOTES "neon→porsager").
async function PATCH(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const providerId = params.id;
    const visitId = params.visitId;
    const staffUserId = await resolveUserId(session.user.id);
    if (staffUserId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    // GATE 1 — the provider must HOLD the 'sitter' capability (2.1). 403 if not.
    await requireProviderCapability(providerId, "sitter");

    // Load the visit — it must belong to this provider. (RLS also scopes the later UPDATE;
    // this read confirms existence + derives the pet.)
    const visitRows = await sql`
      SELECT id, pet_id, status FROM sitting_visits
      WHERE id = ${visitId} AND provider_id = ${providerId}
    `;
    if (visitRows.length === 0) {
      return Response.json({ error: "Visit not found" }, { status: 404 });
    }
    const visit = visitRows[0];

    // GATE 2 — the pet-data gate (mirrors grooming/walking/daycare). 403 on denial; audits.
    await assertCareAccess(visit.pet_id, providerId, "health_logs_write", {
      staffUserId,
      action: "write",
      resource: `sitting_visits:${visitId}`,
    });

    const body = (await request.json()) ?? {};
    const {
      status,
      notes,
      visit_at,
      photo_urls,
      video_urls,
      check_in_lat,
      check_in_lng,
    } = body;

    if (status !== undefined && !["scheduled", "completed", "cancelled"].includes(status)) {
      return Response.json(
        { error: "status must be 'scheduled', 'completed', or 'cancelled'" },
        { status: 400 },
      );
    }

    const photoUrls =
      photo_urls === undefined
        ? null
        : Array.isArray(photo_urls)
          ? photo_urls.filter((u) => typeof u === "string" && u.length > 0)
          : [];
    const videoUrls =
      video_urls === undefined
        ? null
        : Array.isArray(video_urls)
          ? video_urls.filter((u) => typeof u === "string" && u.length > 0)
          : [];

    // Update only the supplied fields (COALESCE keeps the existing value when null is
    // passed for an unspecified field). RLS scopes the row to the assigned sitter — a
    // non-assigned sitter matches zero rows.
    const updated = await sql`
      UPDATE sitting_visits
      SET status        = COALESCE(${status ?? null}, status),
          notes         = COALESCE(${notes ?? null}, notes),
          visit_at      = COALESCE(${visit_at ?? null}, visit_at),
          photo_urls    = COALESCE(${photoUrls}, photo_urls),
          video_urls    = COALESCE(${videoUrls}, video_urls),
          check_in_lat  = COALESCE(${check_in_lat ?? null}, check_in_lat),
          check_in_lng  = COALESCE(${check_in_lng ?? null}, check_in_lng),
          updated_at    = NOW()
      WHERE id = ${visitId}
      RETURNING *
    `;

    if (updated.length === 0) {
      // RLS denied (the caller is not the assigned sitter of this visit).
      return Response.json(
        { error: "Not authorized to update this visit" },
        { status: 403 },
      );
    }

    return Response.json({ visit: updated[0] });
  } catch (e) {
    if (e instanceof ProviderAuthError || e instanceof CareAccessError) {
      return Response.json({ error: e.message }, { status: e.status ?? 403 });
    }
    console.error(
      "[PATCH /api/providers/[id]/sitting-visits/[visitId]] Error:",
      e?.message,
    );
    return Response.json(
      { error: "Failed to update visit" },
      { status: 500 },
    );
  }
}

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md). Handler bodies are
// unchanged — only their DB connection is now request-scoped.
const wrappedPATCH = withRequestContext(PATCH);
export { wrappedPATCH as PATCH };
