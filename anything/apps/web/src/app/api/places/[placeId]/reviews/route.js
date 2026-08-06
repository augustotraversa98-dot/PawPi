import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";
import {
  VALID_PET_WELCOME_LEVELS,
  VALID_PLACE_AMENITIES,
} from "@/app/api/utils/placeReviews";

// /api/places/[placeId]/reviews — community pet-friendly reviews on a Google-sourced place
// (keyed by the Google place_id). Places are NOT providers; the only persisted community data is
// this review (migration 0074). Two dimensions per review: an overall 1–5 rating + a pet-welcome
// tier + amenity tags.
//
//   GET  — public-ish (any authed user): the place's reviews newest-first + PUBLIC aggregates
//          (overall avg/count, the pet-welcome tier distribution + most-common tier, amenity
//          tallies). NOT owner-scoped — aggregates are for everyone browsing.
//   POST — the CALLER upserts THEIR single review for this place (ON CONFLICT (owner_user_id,
//          place_id) DO UPDATE). owner_user_id comes from the session, never the body. Every
//          field is validated against the shared vocab BEFORE any write.
//   DELETE — soft-delete the caller's own review (deleted_at); reviving it later is a repeat POST.
//
// DB is porsager's tagged-template `sql`; RLS (0074) mirrors provider_reviews — public read for
// any authenticated user, owner-only writes.

// Compute the public aggregates from a place's non-deleted reviews (newest-first list). Kept in JS
// so the roll-up is provably consistent with the returned `reviews` array (same source rows).
function computeAggregates(reviews) {
  const overall_count = reviews.length;
  const overall_avg =
    overall_count === 0
      ? null
      : Math.round(
          (reviews.reduce((sum, r) => sum + r.overall_rating, 0) /
            overall_count) *
            100,
        ) / 100;

  // Pet-welcome tier distribution + the single most-common tier. Ties break by
  // VALID_PET_WELCOME_LEVELS order (first-listed wins) so top_level is deterministic.
  const distribution = {};
  for (const r of reviews) {
    distribution[r.pet_welcome_level] =
      (distribution[r.pet_welcome_level] ?? 0) + 1;
  }
  let top_level = null;
  let topCount = 0;
  for (const level of VALID_PET_WELCOME_LEVELS) {
    const count = distribution[level] ?? 0;
    if (count > topCount) {
      topCount = count;
      top_level = level;
    }
  }

  // Amenity tallies across all reviews (one count per key, not per review).
  const count_by_key = {};
  for (const r of reviews) {
    for (const amenity of r.amenities ?? []) {
      count_by_key[amenity] = (count_by_key[amenity] ?? 0) + 1;
    }
  }

  return {
    overall_avg,
    overall_count,
    welcome: { distribution, top_level },
    amenities: { count_by_key },
  };
}

// GET — public-ish list of a place's reviews + aggregates. Any authed user.
async function GET(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const placeId = params.placeId;

    const reviews = await sql`
      SELECT
        r.id,
        r.owner_user_id,
        r.place_id,
        r.place_name,
        r.place_category,
        r.overall_rating,
        r.pet_welcome_level,
        r.amenities,
        r.comment,
        r.created_at,
        r.updated_at,
        COALESCE(up.full_name, up.username) AS reviewer_name
      FROM place_reviews r
      LEFT JOIN user_profiles up ON up.id = r.owner_user_id
      WHERE r.place_id = ${placeId}
        AND r.deleted_at IS NULL
      ORDER BY r.created_at DESC, r.id DESC
    `;

    return Response.json({ reviews, aggregates: computeAggregates(reviews) });
  } catch (error) {
    console.error("[GET /api/places/[placeId]/reviews] Error:", error.message);
    return Response.json({ error: "Failed to fetch reviews" }, { status: 500 });
  }
}

// POST — upsert the caller's single review for this place. Validates everything before any write.
async function POST(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    const placeId = params.placeId;
    const body = (await request.json()) ?? {};
    const {
      overall_rating,
      pet_welcome_level,
      comment,
      place_name,
      place_category,
    } = body;
    const amenities = body.amenities ?? [];

    // ── Validate BEFORE any write (400 on any violation) ──────────────────────
    if (
      typeof place_name !== "string" ||
      place_name.trim().length === 0
    ) {
      return Response.json(
        { error: "place_name is required" },
        { status: 400 },
      );
    }
    if (
      !Number.isInteger(overall_rating) ||
      overall_rating < 1 ||
      overall_rating > 5
    ) {
      return Response.json(
        { error: "overall_rating is required and must be an integer from 1 to 5" },
        { status: 400 },
      );
    }
    if (!VALID_PET_WELCOME_LEVELS.includes(pet_welcome_level)) {
      return Response.json(
        {
          error: `pet_welcome_level must be one of: ${VALID_PET_WELCOME_LEVELS.join(", ")}`,
        },
        { status: 400 },
      );
    }
    if (!Array.isArray(amenities)) {
      return Response.json(
        { error: "amenities must be an array" },
        { status: 400 },
      );
    }
    const unknownAmenity = amenities.find(
      (a) => !VALID_PLACE_AMENITIES.includes(a),
    );
    if (unknownAmenity !== undefined) {
      return Response.json(
        { error: `Unknown amenity: ${unknownAmenity}` },
        { status: 400 },
      );
    }

    // Upsert the caller's single review. ON CONFLICT revives a previously soft-deleted review
    // (deleted_at back to NULL) and refreshes updated_at, mirroring the saved_places idempotent save.
    const saved = await sql`
      INSERT INTO place_reviews
        (owner_user_id, place_id, place_name, place_category,
         overall_rating, pet_welcome_level, amenities, comment)
      VALUES (
        ${userId}, ${placeId}, ${place_name}, ${place_category ?? null},
        ${overall_rating}, ${pet_welcome_level}, ${amenities}, ${comment ?? null}
      )
      ON CONFLICT (owner_user_id, place_id)
      DO UPDATE SET
        place_name = EXCLUDED.place_name,
        place_category = EXCLUDED.place_category,
        overall_rating = EXCLUDED.overall_rating,
        pet_welcome_level = EXCLUDED.pet_welcome_level,
        amenities = EXCLUDED.amenities,
        comment = EXCLUDED.comment,
        updated_at = now(),
        deleted_at = NULL
      RETURNING id, owner_user_id, place_id, place_name, place_category,
        overall_rating, pet_welcome_level, amenities, comment,
        created_at, updated_at, deleted_at
    `;

    return Response.json({ review: saved[0] }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/places/[placeId]/reviews] Error:", error.message);
    return Response.json({ error: "Failed to save review" }, { status: 500 });
  }
}

// DELETE — soft-delete the caller's own review for this place.
async function DELETE(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    const placeId = params.placeId;
    const deleted = await sql`
      UPDATE place_reviews
      SET deleted_at = now()
      WHERE owner_user_id = ${userId}
        AND place_id = ${placeId}
        AND deleted_at IS NULL
      RETURNING id
    `;
    if (deleted.length === 0) {
      return Response.json({ error: "Review not found" }, { status: 404 });
    }
    return Response.json({ ok: true });
  } catch (error) {
    console.error("[DELETE /api/places/[placeId]/reviews] Error:", error.message);
    return Response.json({ error: "Failed to delete review" }, { status: 500 });
  }
}

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md).
const wrappedGET = withRequestContext(GET);
const wrappedPOST = withRequestContext(POST);
const wrappedDELETE = withRequestContext(DELETE);
export { wrappedGET as GET, wrappedPOST as POST, wrappedDELETE as DELETE };
