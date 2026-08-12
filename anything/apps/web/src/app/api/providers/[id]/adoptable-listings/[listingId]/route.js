import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import {
  requireProviderRole,
  requireProviderCapability,
  ProviderAuthError,
} from "@/app/api/utils/providerAuth";
import { withRequestContext } from "@/app/api/utils/requestContext";
import {
  sanitizeQuestions,
  isMissingColumn,
} from "@/app/api/utils/adoptionQuestions";

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

// GET (ticket 2.56) — PUBLIC single-listing read, closing the 2.30 deviation (the
// feed deep-link previously loaded the place's whole public list + found the dog).
// Returns the dog IFF it is AVAILABLE and its place is PUBLISHED — the exact
// visibility the public browse uses (adoptable_listings RLS 0038 SELECT branch:
// status='available' AND a published provider). Filtering both here gives uniform
// PUBLIC semantics even for a shelter admin (who could otherwise see pending/adopted
// via RLS) and exposes ONLY the public columns (same projection as the browse GET) +
// the place's public identity. Any unpublished / adopted / pending / removed listing
// → 404 "not available" (the graceful path the mobile deep-open relies on). No RLS
// change — purely a route. No resolveUserId / capability gate (a discovery read; the
// published+available predicate IS the gate, and a 403 would break the 404 path).
async function GET(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: providerId, listingId } = params;

    // application_questions (0086) rides a pre-migration degrade: on 42703 (column not applied
    // yet) the read retries with a '[]' literal, so the public deep-link still opens the dog
    // (apply form shows no questions) pre-apply. Two explicit statements, mirroring the 0084
    // comments degrade (keeps exactly one sql call on the happy path).
    let rows;
    try {
      rows = await sql`
        SELECT
          al.id, al.provider_id, al.name, al.breed, al.age_years, al.age_months,
          al.gender, al.size, al.photo_urls, al.video_url, al.story,
          al.good_with_kids, al.good_with_cats, al.good_with_dogs, al.energy_level,
          al.vaccination_status, al.adoption_fee_cents, al.currency, al.status,
          al.placement_type, al.is_urgent, al.is_featured, al.urgent_reason, al.featured_until,
          al.application_questions,
          al.created_at, al.updated_at,
          p.name AS provider_name, p.slug AS provider_slug, p.logo_url AS provider_logo_url,
          loc.lat AS provider_lat, loc.lng AS provider_lng,
          loc.address AS provider_address, loc.name AS provider_location_name
        FROM adoptable_listings al
        JOIN providers p ON p.id = al.provider_id
        LEFT JOIN LATERAL (
          SELECT lat, lng, address, name
          FROM provider_locations pl
          WHERE pl.provider_id = p.id
          ORDER BY pl.created_at ASC
          LIMIT 1
        ) loc ON true
        WHERE al.id = ${listingId}
          AND al.provider_id = ${providerId}
          AND al.status = 'available'
          AND p.status = 'published'
      `;
    } catch (e) {
      if (!isMissingColumn(e)) throw e;
      rows = await sql`
        SELECT
          al.id, al.provider_id, al.name, al.breed, al.age_years, al.age_months,
          al.gender, al.size, al.photo_urls, al.video_url, al.story,
          al.good_with_kids, al.good_with_cats, al.good_with_dogs, al.energy_level,
          al.vaccination_status, al.adoption_fee_cents, al.currency, al.status,
          al.placement_type, al.is_urgent, al.is_featured, al.urgent_reason, al.featured_until,
          '[]'::jsonb AS application_questions,
          al.created_at, al.updated_at,
          p.name AS provider_name, p.slug AS provider_slug, p.logo_url AS provider_logo_url,
          loc.lat AS provider_lat, loc.lng AS provider_lng,
          loc.address AS provider_address, loc.name AS provider_location_name
        FROM adoptable_listings al
        JOIN providers p ON p.id = al.provider_id
        LEFT JOIN LATERAL (
          SELECT lat, lng, address, name
          FROM provider_locations pl
          WHERE pl.provider_id = p.id
          ORDER BY pl.created_at ASC
          LIMIT 1
        ) loc ON true
        WHERE al.id = ${listingId}
          AND al.provider_id = ${providerId}
          AND al.status = 'available'
          AND p.status = 'published'
      `;
    }

    if (rows.length === 0) {
      return Response.json({ error: "Listing not available" }, { status: 404 });
    }

    return Response.json({ listing: rows[0] });
  } catch (e) {
    console.error(
      "[GET /api/providers/[id]/adoptable-listings/[listingId]] Error:",
      e?.message,
    );
    return Response.json({ error: "Failed to fetch listing" }, { status: 500 });
  }
}

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
    // Age: a present null CLEARS it (empty → unknown); a present value must be valid.
    if (
      body.age_years != null &&
      (!Number.isInteger(body.age_years) || body.age_years < 0)
    ) {
      return Response.json(
        { error: "age_years must be a non-negative integer" },
        { status: 400 },
      );
    }
    if (
      body.age_months != null &&
      (!Number.isInteger(body.age_months) || body.age_months < 0 || body.age_months > 11)
    ) {
      return Response.json(
        { error: "age_months must be an integer between 0 and 11" },
        { status: 400 },
      );
    }
    if (
      body.placement_type !== undefined &&
      !["adopt", "foster", "both"].includes(body.placement_type)
    ) {
      return Response.json({ error: "Invalid placement_type" }, { status: 400 });
    }

    // Per-listing application questions (0086): a present array REPLACES; absent keeps. null =
    // not provided (leave unchanged); an array (incl. []) replaces the stored questions. Written
    // in a SEPARATE guarded statement below so the column can degrade cleanly pre-migration.
    const questions = sanitizeQuestions(body.application_questions);

    // COALESCE keeps unspecified fields. RLS (admin_all) + the provider_id filter scope the
    // row to THIS place's admin — a non-admin updates ZERO rows (handled as 404 below).
    const updated = await sql`
      UPDATE adoptable_listings
      SET
        name = COALESCE(${body.name ?? null}, name),
        breed = COALESCE(${body.breed ?? null}, breed),
        age_years = ${"age_years" in body ? body.age_years : sql`age_years`},
        age_months = ${"age_months" in body ? body.age_months : sql`age_months`},
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
        placement_type = COALESCE(${body.placement_type ?? null}, placement_type),
        is_urgent = COALESCE(${body.is_urgent === undefined ? null : body.is_urgent}, is_urgent),
        is_featured = COALESCE(${body.is_featured === undefined ? null : body.is_featured}, is_featured),
        urgent_reason = COALESCE(${body.urgent_reason ?? null}, urgent_reason),
        featured_until = COALESCE(${body.featured_until ?? null}, featured_until),
        updated_at = now()
      WHERE id = ${listingId} AND provider_id = ${providerId}
      RETURNING *
    `;
    if (updated.length === 0) {
      return Response.json({ error: "Listing not found" }, { status: 404 });
    }

    // Questions written separately + guarded (0086 degrade): only when the client sent the field.
    // On 42703 (column not applied yet) skip silently — the rest of the edit already succeeded.
    let listing = updated[0];
    if (questions != null) {
      try {
        const q = await sql`
          UPDATE adoptable_listings
          SET application_questions = ${sql.json(questions)}, updated_at = now()
          WHERE id = ${listingId} AND provider_id = ${providerId}
          RETURNING application_questions
        `;
        if (q.length > 0) listing = { ...listing, application_questions: q[0].application_questions };
      } catch (e) {
        if (!isMissingColumn(e)) throw e; // pre-migration: leave questions unset
      }
    }

    return Response.json({ listing });
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

const wrappedGET = withRequestContext(GET);
const wrappedPATCH = withRequestContext(PATCH);
const wrappedDELETE = withRequestContext(DELETE);
export { wrappedGET as GET, wrappedPATCH as PATCH, wrappedDELETE as DELETE };
