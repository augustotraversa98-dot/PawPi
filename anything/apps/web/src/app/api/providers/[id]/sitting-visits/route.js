import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import {
  requireProviderCapability,
  ProviderAuthError,
} from "@/app/api/utils/providerAuth";
import { assertCareAccess, CareAccessError } from "@/app/api/utils/careAccess";
import { withRequestContext } from "@/app/api/utils/requestContext";

// /api/providers/[id]/sitting-visits — the SITTER's OWN assigned sitting visits (GET) and
// LOGGING a new per-visit update (POST). Phase 2 ticket 2.9
// (docs/phase2-tickets/2.9-sitting.md).
//
// GET: gated by requireProviderCapability(providerId, 'sitter') — the MODULE gate. The
// result is the sitter's OWN visits only: WHERE staff_user_id = me mirrors the
// sitting_visits RLS provider-read policy (participant-scoped — a sitter never sees
// another sitter's visit, so visit notes/media stay participant-only). No assertCareAccess
// on GET: it returns only the visits already assigned to the caller (operational metadata +
// the updates they themselves posted), not arbitrary pet data.
//
// POST (log a visit): THREE gates, in order (none bypassed):
//   1. requireProviderCapability(providerId, 'sitter') — the MODULE gate (2.1).
//   2. assertCareAccess(petId, providerId, 'health_logs_write', …) — the PET-DATA gate
//      (mirrors grooming/walking/daycare): active staff + an active grant whose scopes
//      include 'health_logs_write'. Writes the care_access_audit row. The pet is taken
//      from the body and confirmed to belong to a real pet; the visit is logged in the
//      OWNER's context (owner_user_id = pets.owner_user_id).
//   3. RLS on sitting_visits (0035): a sitter may only INSERT a visit assigned to
//      themselves (staff_user_id = me) — so an outsider / non-assigned sitter inserts ZERO.
//
// Photos/video reuse the existing Supabase Storage upload path; the route stores the URLs.
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

    // MODULE gate — the provider must hold the 'sitter' capability (2.1). 403 if not.
    await requireProviderCapability(providerId, "sitter");

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    // The sitter's OWN visits for this provider (staff_user_id = me). Join pet/owner
    // context for the card. Optional ?status= filter. RLS scopes per-row visibility.
    const visits = status
      ? await sql`
          SELECT
            sv.id, sv.booking_id, sv.pet_id, sv.owner_user_id, sv.provider_id,
            sv.staff_user_id, sv.visit_at, sv.status, sv.notes,
            sv.photo_urls, sv.video_urls, sv.check_in_lat, sv.check_in_lng,
            sv.created_at,
            p.name AS pet_name,
            COALESCE(up.full_name, up.username) AS owner_name
          FROM sitting_visits sv
          LEFT JOIN pets p ON p.id = sv.pet_id
          LEFT JOIN user_profiles up ON up.id = sv.owner_user_id
          WHERE sv.provider_id = ${providerId}
            AND sv.staff_user_id = ${userId}
            AND sv.status = ${status}
          ORDER BY COALESCE(sv.visit_at, sv.created_at) DESC, sv.id DESC
        `
      : await sql`
          SELECT
            sv.id, sv.booking_id, sv.pet_id, sv.owner_user_id, sv.provider_id,
            sv.staff_user_id, sv.visit_at, sv.status, sv.notes,
            sv.photo_urls, sv.video_urls, sv.check_in_lat, sv.check_in_lng,
            sv.created_at,
            p.name AS pet_name,
            COALESCE(up.full_name, up.username) AS owner_name
          FROM sitting_visits sv
          LEFT JOIN pets p ON p.id = sv.pet_id
          LEFT JOIN user_profiles up ON up.id = sv.owner_user_id
          WHERE sv.provider_id = ${providerId}
            AND sv.staff_user_id = ${userId}
          ORDER BY COALESCE(sv.visit_at, sv.created_at) DESC, sv.id DESC
        `;

    return Response.json({ visits });
  } catch (e) {
    if (e instanceof ProviderAuthError) {
      return Response.json({ error: e.message }, { status: e.status ?? 403 });
    }
    console.error(
      "[GET /api/providers/[id]/sitting-visits] Error:",
      e?.message,
    );
    return Response.json(
      { error: "Failed to fetch sitting visits" },
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

    // GATE 1 — the provider must HOLD the 'sitter' capability (2.1). 403 if not.
    await requireProviderCapability(providerId, "sitter");

    const body = (await request.json()) ?? {};
    const {
      pet_id,
      booking_id,
      visit_at,
      status,
      notes,
      photo_urls,
      video_urls,
      check_in_lat,
      check_in_lng,
    } = body;

    if (!pet_id) {
      return Response.json({ error: "pet_id is required" }, { status: 400 });
    }
    if (status !== undefined && !["scheduled", "completed", "cancelled"].includes(status)) {
      return Response.json(
        { error: "status must be 'scheduled', 'completed', or 'cancelled'" },
        { status: 400 },
      );
    }

    // The pet must exist; derive the OWNER (owner_user_id = pets.owner_user_id) for the
    // visit's owner key (the RLS owner branch + the owner's read path).
    const petRows = await sql`
      SELECT id, owner_user_id FROM pets WHERE id = ${pet_id}
    `;
    if (petRows.length === 0) {
      return Response.json({ error: "Pet not found" }, { status: 404 });
    }
    const ownerUserId = petRows[0].owner_user_id;

    // If a booking is linked it must be THIS provider's sitter booking for THIS pet.
    if (booking_id !== undefined && booking_id !== null) {
      const bookingRows = await sql`
        SELECT id FROM vet_appointments
        WHERE id = ${booking_id}
          AND provider_id = ${providerId}
          AND pet_id = ${pet_id}
      `;
      if (bookingRows.length === 0) {
        return Response.json(
          { error: "Invalid booking for this visit" },
          { status: 400 },
        );
      }
    }

    // GATE 2 — the pet-data gate (mirrors grooming/walking/daycare). 403 on denial; audits
    // on success. petId derived above; the sitter must be active staff + hold the grant.
    await assertCareAccess(pet_id, providerId, "health_logs_write", {
      staffUserId,
      action: "write",
      resource: `sitting_visits:pet:${pet_id}`,
    });

    const photoUrls = Array.isArray(photo_urls)
      ? photo_urls.filter((u) => typeof u === "string" && u.length > 0)
      : [];
    const videoUrls = Array.isArray(video_urls)
      ? video_urls.filter((u) => typeof u === "string" && u.length > 0)
      : [];

    // Log the visit, assigned to the calling sitter (staff_user_id = me — required by the
    // RLS INSERT policy; a sitter cannot log a visit for another sitter). RLS scopes to the
    // participant — no grant / not assigned → zero rows.
    const created = await sql`
      INSERT INTO sitting_visits (
        booking_id, pet_id, owner_user_id, provider_id, staff_user_id,
        visit_at, status, notes, photo_urls, video_urls, check_in_lat, check_in_lng
      ) VALUES (
        ${booking_id ?? null}, ${pet_id}, ${ownerUserId}, ${providerId}, ${staffUserId},
        ${visit_at ?? null}, ${status ?? "completed"}, ${notes ?? null},
        ${photoUrls}, ${videoUrls},
        ${check_in_lat ?? null}, ${check_in_lng ?? null}
      )
      RETURNING *
    `;
    if (created.length === 0) {
      return Response.json(
        { error: "Not authorized to log a visit for this pet" },
        { status: 403 },
      );
    }

    return Response.json({ visit: created[0] }, { status: 201 });
  } catch (e) {
    if (e instanceof ProviderAuthError || e instanceof CareAccessError) {
      return Response.json({ error: e.message }, { status: e.status ?? 403 });
    }
    console.error(
      "[POST /api/providers/[id]/sitting-visits] Error:",
      e?.message,
    );
    return Response.json(
      { error: "Failed to log sitting visit" },
      { status: 500 },
    );
  }
}

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md). Handler bodies are
// unchanged — only their DB connection is now request-scoped.
const wrappedGET = withRequestContext(GET);
const wrappedPOST = withRequestContext(POST);
export { wrappedGET as GET, wrappedPOST as POST };
