import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import {
  requireProviderCapability,
  ProviderAuthError,
} from "@/app/api/utils/providerAuth";
import { assertCareAccess, CareAccessError } from "@/app/api/utils/careAccess";
import { withRequestContext } from "@/app/api/utils/requestContext";

// POST /api/providers/[id]/daycare-stays/[stayId]/report-cards — facility staff post a
// DAILY REPORT CARD (mood / meals / activities / notes / photos) on a stay, visible to
// the owner. Phase 2 ticket 2.8 (docs/phase2-tickets/2.8-daycare-boarding.md).
//
// THREE gates, in order (none bypassed):
//   1. requireProviderCapability(providerId, 'daycare') — the MODULE gate (2.1).
//   2. assertCareAccess(petId, providerId, 'health_logs_write', …) — the PET-DATA gate
//      (mirrors grooming/walking): active staff + an active grant whose scopes include
//      'health_logs_write'. Writes the care_access_audit row. petId is read from the stay.
//   3. RLS on report_cards (0034): provider INSERT requires an active grant on the stay's
//      pet (resolved via the stay subselect) — so a facility without the grant inserts ZERO.
//
// Photos/video reuse the existing Supabase Storage upload path; the route stores the URLs.
// The owner reads the card via GET /api/pets/[id]/daycare-stays (report_cards joined).
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
    const stayId = params.stayId;
    const staffUserId = await resolveUserId(session.user.id);
    if (staffUserId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    // GATE 1 — the provider must HOLD the 'daycare' capability (2.1). 403 if not.
    await requireProviderCapability(providerId, "daycare");

    // Load the stay — it must belong to this provider. (RLS also scopes the later INSERT;
    // this read confirms existence + derives the pet.)
    const stayRows = await sql`
      SELECT id, pet_id FROM daycare_stays
      WHERE id = ${stayId} AND provider_id = ${providerId}
    `;
    if (stayRows.length === 0) {
      return Response.json({ error: "Stay not found" }, { status: 404 });
    }
    const stay = stayRows[0];

    // GATE 2 — the pet-data gate (mirrors grooming/walking). 403 on denial; audits.
    await assertCareAccess(stay.pet_id, providerId, "health_logs_write", {
      staffUserId,
      action: "write",
      resource: `report_cards:stay:${stayId}`,
    });

    const body = (await request.json()) ?? {};
    const { date, mood, meals, activities, notes, photo_urls } = body;
    if (!date) {
      return Response.json({ error: "date is required" }, { status: 400 });
    }
    const photoUrls = Array.isArray(photo_urls)
      ? photo_urls.filter((u) => typeof u === "string" && u.length > 0)
      : [];

    // Insert the card. RLS scopes to the assigned grant (no grant → zero rows → 403).
    const created = await sql`
      INSERT INTO report_cards (stay_id, date, mood, meals, activities, notes, photo_urls)
      VALUES (
        ${stayId}, ${date}, ${mood ?? null}, ${meals ?? null},
        ${activities ?? null}, ${notes ?? null}, ${photoUrls}
      )
      RETURNING *
    `;
    if (created.length === 0) {
      return Response.json(
        { error: "Not authorized to post a report card for this stay" },
        { status: 403 },
      );
    }

    return Response.json({ report_card: created[0] }, { status: 201 });
  } catch (e) {
    if (e instanceof ProviderAuthError || e instanceof CareAccessError) {
      return Response.json({ error: e.message }, { status: e.status ?? 403 });
    }
    console.error(
      "[POST /api/providers/[id]/daycare-stays/[stayId]/report-cards] Error:",
      e?.message,
    );
    return Response.json(
      { error: "Failed to post report card" },
      { status: 500 },
    );
  }
}

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md). Handler bodies are
// unchanged — only their DB connection is now request-scoped.
const wrappedPOST = withRequestContext(POST);
export { wrappedPOST as POST };
