import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// Reviews & ratings surfacing — Phase 2 ticket 2.2 (docs/phase2-tickets/2.2-reviews-surfacing.md,
// master plan §2 item 3). Surfaces the EXISTING provider_reviews table (created in 0014,
// never wired). Two halves:
//
//   POST /api/providers/[id]/reviews — the pet's OWNER writes a review. Anti-abuse gate:
//     the owner must have a COMPLETED booking with this provider (a vet_appointments row
//     with status='completed'), and only ONE review per completed booking (dedup). Fields:
//     rating 1–5 (required), body (optional), pet_id (optional, must be the owner's pet).
//     owner_user_id comes from the session — NEVER the body.
//
//   GET /api/providers/[id]/reviews — list a provider's reviews (any authed user; the
//     reviews of a PUBLISHED provider are public-ish). Returns reviewer display name + pet
//     name + rating + body + date. Paginated (?limit=&offset=).
//
// This is an OWNER-context route (like ./book), NOT a provider-staff one: the POST gate is
// "do I own a completed booking with this provider", not provider_staff membership. So it
// uses resolveUserId but never requireProviderRole. Providers have NO write path to reviews
// (enforced app-side here + at the DB by 0028's RLS) — they cannot author/edit/delete.
//
// DB is porsager's tagged-template `sql` (SCHEMA_NOTES "neon→porsager"): every query is a
// tagged template; params bind via `${}`. Pagination uses two tagged-template variants for
// the deterministic LIMIT/OFFSET (never sql(string, array)).

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

// GET — public-ish list of a provider's reviews with reviewer + pet context.
async function GET(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const providerId = params.id;

    // Provider must exist AND be published — reviews of a draft/unknown provider are not
    // public (mirrors discovery/public visibility).
    const providerRows = await sql`
      SELECT id, status FROM providers WHERE id = ${providerId}
    `;
    if (providerRows.length === 0 || providerRows[0].status !== "published") {
      return Response.json({ error: "Provider not found" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit"), 10) || DEFAULT_LIMIT, 1),
      MAX_LIMIT,
    );
    const offset = Math.max(parseInt(searchParams.get("offset"), 10) || 0, 0);

    // Reviewer display name prefers full_name, falling back to username. Pet name is
    // LEFT JOIN'd (pet_id is non-null on the row but the pet may have been deleted — keep
    // the review). Newest first.
    const reviews = await sql`
      SELECT
        r.id,
        r.provider_id,
        r.pet_id,
        r.rating,
        r.body,
        r.created_at,
        COALESCE(up.full_name, up.username) AS reviewer_name,
        p.name AS pet_name
      FROM provider_reviews r
      LEFT JOIN user_profiles up ON up.id = r.owner_user_id
      LEFT JOIN pets p ON p.id = r.pet_id
      WHERE r.provider_id = ${providerId}
      ORDER BY r.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    return Response.json({ reviews });
  } catch (error) {
    console.error("[GET /api/providers/[id]/reviews] Error:", error.message);
    return Response.json(
      { error: "Failed to fetch reviews" },
      { status: 500 },
    );
  }
}

// POST — owner writes a review, gated on a COMPLETED booking + one-per-booking dedup.
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

    const body = (await request.json()) ?? {};
    const { rating, pet_id } = body;
    const reviewBody = body.body;

    // rating is required and must be an integer 1–5 (mirrors the table CHECK).
    if (
      rating === undefined ||
      rating === null ||
      !Number.isInteger(rating) ||
      rating < 1 ||
      rating > 5
    ) {
      return Response.json(
        { error: "rating is required and must be an integer from 1 to 5" },
        { status: 400 },
      );
    }

    // Provider must exist AND be published — cannot review a draft/unknown provider.
    const providerRows = await sql`
      SELECT id, status FROM providers WHERE id = ${providerId}
    `;
    if (providerRows.length === 0 || providerRows[0].status !== "published") {
      return Response.json({ error: "Provider not found" }, { status: 404 });
    }

    // GATE: the owner must have a COMPLETED booking with THIS provider. status='completed'
    // is the lifecycle column (scheduled|completed|cancelled|missed), set when an
    // appointment is marked done. deleted_at IS NULL excludes soft-deleted bookings. Pick
    // the EARLIEST completed booking that has no review yet so each completed booking can be
    // reviewed at most once (one-per-booking dedup) — LEFT JOIN provider_reviews on the
    // appointment id and require no existing review for it.
    const completed = await sql`
      SELECT va.id
      FROM vet_appointments va
      LEFT JOIN provider_reviews r ON r.appointment_id = va.id
      WHERE va.provider_id = ${providerId}
        AND va.owner_user_id = ${userId}
        AND va.status = 'completed'
        AND va.deleted_at IS NULL
        AND r.id IS NULL
      ORDER BY va.appointment_date ASC, va.appointment_time ASC, va.id ASC
      LIMIT 1
    `;
    if (completed.length === 0) {
      // Either no completed booking at all, or every completed booking already reviewed.
      const anyCompleted = await sql`
        SELECT 1 FROM vet_appointments
        WHERE provider_id = ${providerId}
          AND owner_user_id = ${userId}
          AND status = 'completed'
          AND deleted_at IS NULL
        LIMIT 1
      `;
      if (anyCompleted.length === 0) {
        return Response.json(
          {
            error:
              "You can only review a provider after a completed appointment with them",
          },
          { status: 403 },
        );
      }
      return Response.json(
        { error: "You have already reviewed your completed appointment(s) with this provider" },
        { status: 409 },
      );
    }
    const appointmentId = completed[0].id;

    // Resolve the pet for the review. If pet_id is supplied it must be the owner's pet;
    // otherwise default to the pet on the completed booking (provider_reviews.pet_id is
    // NOT NULL). This keeps the review attributed to a real, owned pet.
    let resolvedPetId = null;
    if (pet_id !== undefined && pet_id !== null) {
      const petCheck = await sql`
        SELECT id FROM pets WHERE id = ${pet_id} AND owner_user_id = ${userId}
      `;
      if (petCheck.length === 0) {
        return Response.json(
          { error: "You do not own this pet" },
          { status: 403 },
        );
      }
      resolvedPetId = pet_id;
    } else {
      const bookingPet = await sql`
        SELECT pet_id FROM vet_appointments WHERE id = ${appointmentId}
      `;
      resolvedPetId = bookingPet[0]?.pet_id ?? null;
    }
    if (resolvedPetId === null) {
      return Response.json(
        { error: "pet_id is required" },
        { status: 400 },
      );
    }

    const created = await sql`
      INSERT INTO provider_reviews (
        provider_id,
        owner_user_id,
        pet_id,
        appointment_id,
        rating,
        body
      ) VALUES (
        ${providerId},
        ${userId},
        ${resolvedPetId},
        ${appointmentId},
        ${rating},
        ${reviewBody ?? null}
      )
      RETURNING *
    `;

    return Response.json({ review: created[0] }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/providers/[id]/reviews] Error:", error.message);
    return Response.json(
      { error: "Failed to create review" },
      { status: 500 },
    );
  }
}

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md). Handler
// bodies are unchanged — only their DB connection is now request-scoped.
const wrappedGET = withRequestContext(GET);
const wrappedPOST = withRequestContext(POST);
export { wrappedGET as GET, wrappedPOST as POST };
