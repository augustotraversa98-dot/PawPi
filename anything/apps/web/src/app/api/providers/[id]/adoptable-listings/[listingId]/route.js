import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import {
  requireProviderRole,
  requireProviderCapability,
  ProviderAuthError,
} from "@/app/api/utils/providerAuth";
import { withRequestContext } from "@/app/api/utils/requestContext";

// /api/providers/[id]/adoptable-listings/[listingId] — update / withdraw one adoptable dog.
// Phase 2 ticket 2.12. Shelter-ADMIN only (listing management).
//
// PATCH: edit the dog-profile fields + status (available/pending/adopted). DELETE: SOFT
// withdraw — sets status='adopted'... no: a withdrawn listing should leave discovery without
// pretending it was adopted, so DELETE here marks it 'pending' is wrong too. We model
// withdrawal as a hard DELETE (its applications CASCADE) — a place removing a dog it should
// not have listed. The normal happy path is the approval flow flipping status to 'adopted'.
// Both verbs gate the 'adoption' capability + admin role; adoptable_listings RLS (0038) is
// the last line (admin_all).
//
// DB is porsager's tagged-template `sql` (SCHEMA_NOTES "neon→porsager").
async function PATCH(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: providerId, listingId } = params;
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    await requireProviderCapability(providerId, "adoption");
    await requireProviderRole(providerId, userId, ["owner", "admin"]);

    const body = (await request.json()) ?? {};

    if (
      body.adoption_fee_cents !== undefined &&
      (!Number.isInteger(body.adoption_fee_cents) || body.adoption_fee_cents < 0)
    ) {
      return Response.json(
        { error: "adoption_fee_cents must be a non-negative integer" },
        { status: 400 },
      );
    }
    if (
      body.status !== undefined &&
      !["available", "pending", "adopted"].includes(body.status)
    ) {
      return Response.json({ error: "Invalid status" }, { status: 400 });
    }

    // COALESCE keeps unspecified fields. RLS (admin_all) + the provider_id filter scope the
    // row to THIS place's admin — a non-admin updates ZERO rows (handled as 404 below).
    const updated = await sql`
      UPDATE adoptable_listings
      SET
        name = COALESCE(${body.name ?? null}, name),
        breed = COALESCE(${body.breed ?? null}, breed),
        age_years = COALESCE(${body.age_years ?? null}, age_years),
        age_months = COALESCE(${body.age_months ?? null}, age_months),
        gender = COALESCE(${body.gender ?? null}, gender),
        size = COALESCE(${body.size ?? null}, size),
        photo_urls = COALESCE(${
          Array.isArray(body.photo_urls) ? body.photo_urls : null
        }, photo_urls),
        video_url = COALESCE(${body.video_url ?? null}, video_url),
        story = COALESCE(${body.story ?? null}, story),
        good_with_kids = COALESCE(${
          body.good_with_kids === undefined ? null : body.good_with_kids
        }, good_with_kids),
        good_with_cats = COALESCE(${
          body.good_with_cats === undefined ? null : body.good_with_cats
        }, good_with_cats),
        good_with_dogs = COALESCE(${
          body.good_with_dogs === undefined ? null : body.good_with_dogs
        }, good_with_dogs),
        energy_level = COALESCE(${body.energy_level ?? null}, energy_level),
        vaccination_status = COALESCE(${body.vaccination_status ?? null}, vaccination_status),
        adoption_fee_cents = COALESCE(${body.adoption_fee_cents ?? null}, adoption_fee_cents),
        currency = COALESCE(${body.currency ?? null}, currency),
        status = COALESCE(${body.status ?? null}, status),
        updated_at = now()
      WHERE id = ${listingId} AND provider_id = ${providerId}
      RETURNING *
    `;
    if (updated.length === 0) {
      return Response.json({ error: "Listing not found" }, { status: 404 });
    }

    return Response.json({ listing: updated[0] });
  } catch (e) {
    if (e instanceof ProviderAuthError) {
      return Response.json({ error: e.message }, { status: e.status ?? 403 });
    }
    console.error(
      "[PATCH /api/providers/[id]/adoptable-listings/[listingId]] Error:",
      e?.message,
    );
    return Response.json({ error: "Failed to update listing" }, { status: 500 });
  }
}

async function DELETE(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: providerId, listingId } = params;
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    await requireProviderCapability(providerId, "adoption");
    await requireProviderRole(providerId, userId, ["owner", "admin"]);

    // Remove the listing (its applications + favorites CASCADE). RLS (admin_all) + provider_id
    // scope the row to THIS place's admin — a non-admin deletes ZERO rows (404 below).
    const deleted = await sql`
      DELETE FROM adoptable_listings
      WHERE id = ${listingId} AND provider_id = ${providerId}
      RETURNING id
    `;
    if (deleted.length === 0) {
      return Response.json({ error: "Listing not found" }, { status: 404 });
    }

    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof ProviderAuthError) {
      return Response.json({ error: e.message }, { status: e.status ?? 403 });
    }
    console.error(
      "[DELETE /api/providers/[id]/adoptable-listings/[listingId]] Error:",
      e?.message,
    );
    return Response.json({ error: "Failed to delete listing" }, { status: 500 });
  }
}

const wrappedPATCH = withRequestContext(PATCH);
const wrappedDELETE = withRequestContext(DELETE);
export { wrappedPATCH as PATCH, wrappedDELETE as DELETE };
