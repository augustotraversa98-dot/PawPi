import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import {
  requireProviderRole,
  requireProviderCapability,
  ProviderAuthError,
} from "@/app/api/utils/providerAuth";
import { withRequestContext } from "@/app/api/utils/requestContext";
import { moderationResponse } from "@/app/api/utils/moderateText";

// /api/providers/[id]/adoptable-listings — an adoption place's adoptable dogs, in the
// existing DOG-PROFILE format. Phase 2 ticket 2.12 (docs/phase2-tickets/2.12-adoption.md).
//
// GET: gated by requireProviderCapability(providerId,'adoption') — the MODULE gate (2.1).
// adoptable_listings RLS (0038) scopes per-row visibility: a PUBLISHED place's AVAILABLE
// listings are public-readable (DISCOVERY — an owner browses the dogs), while shelter STAFF
// also see pending/adopted listings + a draft place. The route does NOT require staff
// membership for GET — it is the shared "browse this place's dogs" surface AND the shelter's
// own listing list.
//
// POST (create a listing): TWO gates, in order (none bypassed):
//   1. requireProviderCapability(providerId,'adoption') — the MODULE gate (2.1).
//   2. requireProviderRole(providerId, me, ['owner','admin']) — listing writes are shelter
//      ADMIN only (the ticket: "shelter-staff write").
//   3. RLS on adoptable_listings (0038): admin_all requires app_is_provider_admin — a
//      non-admin caller inserts ZERO. A listing is provider CONFIGURATION, not pet data, so
//      there is no assertCareAccess here.
//
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

    // MODULE gate — the provider must hold the 'adoption' capability (2.1). 403 if not.
    await requireProviderCapability(providerId, "adoption");

    // RLS scopes which rows are visible (available-of-published for owners; all for staff).
    const listings = await sql`
      SELECT
        id, provider_id, name, breed, age_years, age_months, gender, size,
        photo_urls, video_url, story, good_with_kids, good_with_cats, good_with_dogs,
        energy_level, vaccination_status, adoption_fee_cents, currency, status,
        placement_type, is_urgent, is_featured, urgent_reason, featured_until,
        created_at, updated_at
      FROM adoptable_listings
      WHERE provider_id = ${providerId}
      ORDER BY (status = 'available') DESC, is_featured DESC, created_at DESC, id DESC
    `;

    return Response.json({ listings });
  } catch (e) {
    if (e instanceof ProviderAuthError) {
      return Response.json({ error: e.message }, { status: e.status ?? 403 });
    }
    console.error("[GET /api/providers/[id]/adoptable-listings] Error:", e?.message);
    return Response.json({ error: "Failed to fetch listings" }, { status: 500 });
  }
}

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

    // GATE 1 — the place must HOLD the 'adoption' capability (2.1). 403 if not.
    await requireProviderCapability(providerId, "adoption");
    // GATE 2 — listing writes are shelter-admin only.
    await requireProviderRole(providerId, userId, ["owner", "admin"]);

    const body = (await request.json()) ?? {};
    const {
      name,
      breed,
      age_years,
      age_months,
      gender,
      size,
      photo_urls,
      video_url,
      story,
      good_with_kids,
      good_with_cats,
      good_with_dogs,
      energy_level,
      vaccination_status,
      adoption_fee_cents,
      currency,
    } = body;

    if (!name || typeof name !== "string") {
      return Response.json({ error: "name is required" }, { status: 400 });
    }

    // Age validation (defense-in-depth; the editor validates too). null = unknown.
    if (
      age_years != null &&
      (!Number.isInteger(age_years) || age_years < 0)
    ) {
      return Response.json(
        { error: "age_years must be a non-negative integer" },
        { status: 400 },
      );
    }
    if (
      age_months != null &&
      (!Number.isInteger(age_months) || age_months < 0 || age_months > 11)
    ) {
      return Response.json(
        { error: "age_months must be an integer between 0 and 11" },
        { status: 400 },
      );
    }

    // Content filter (T7): reject objectionable listing name / breed / story text before insert.
    const blockedListing = moderationResponse(name, breed, story);
    if (blockedListing) return blockedListing;
    // Foster/urgent/featured flags (ticket 2.57). placement_type defaults to 'adopt'.
    const placementType = ["adopt", "foster", "both"].includes(body.placement_type)
      ? body.placement_type
      : "adopt";
    const fee =
      Number.isInteger(adoption_fee_cents) && adoption_fee_cents >= 0
        ? adoption_fee_cents
        : 0;
    const photos = Array.isArray(photo_urls) ? photo_urls : [];

    // Create the listing. RLS scopes to admins of THIS place (no admin → zero rows).
    const created = await sql`
      INSERT INTO adoptable_listings (
        provider_id, name, breed, age_years, age_months, gender, size,
        photo_urls, video_url, story, good_with_kids, good_with_cats, good_with_dogs,
        energy_level, vaccination_status, adoption_fee_cents, currency,
        placement_type, is_urgent, is_featured, urgent_reason, featured_until
      ) VALUES (
        ${providerId}, ${name}, ${breed ?? null}, ${age_years ?? null},
        ${age_months ?? null}, ${gender ?? null}, ${size ?? null}, ${photos},
        ${video_url ?? null}, ${story ?? null}, ${good_with_kids ?? null},
        ${good_with_cats ?? null}, ${good_with_dogs ?? null}, ${energy_level ?? null},
        ${vaccination_status ?? null}, ${fee}, ${currency ?? "ARS"},
        ${placementType}, ${body.is_urgent === true}, ${body.is_featured === true},
        ${body.urgent_reason ?? null}, ${body.featured_until ?? null}
      )
      RETURNING *
    `;
    if (created.length === 0) {
      return Response.json(
        { error: "Not authorized to create a listing for this place" },
        { status: 403 },
      );
    }

    return Response.json({ listing: created[0] }, { status: 201 });
  } catch (e) {
    if (e instanceof ProviderAuthError) {
      return Response.json({ error: e.message }, { status: e.status ?? 403 });
    }
    console.error("[POST /api/providers/[id]/adoptable-listings] Error:", e?.message);
    return Response.json({ error: "Failed to create listing" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
const wrappedPOST = withRequestContext(POST);
export { wrappedGET as GET, wrappedPOST as POST };
