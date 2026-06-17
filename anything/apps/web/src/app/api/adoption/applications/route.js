import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// /api/adoption/applications — the OWNER's adoption applications. Phase 2 ticket 2.12.
//
// GET  — the owner's own applications (with the applied-for dog + place). OWNER-context:
//        adoption_applications RLS (0038) scopes to applicant_owner_user_id = me.
// POST — APPLY to adopt a listing. Body: { listing_id, answers }. The route resolves the
//        listing's provider (so provider_id is set consistently for the shelter-staff RLS
//        branch + dashboard queue), then inserts the application AS the owner (RLS WITH CHECK:
//        applicant_owner_user_id = me). The 0038 partial unique index makes a second active
//        application for the same dog a clean 409.
//
// DB is porsager's tagged-template `sql` (SCHEMA_NOTES "neon→porsager").
async function GET(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    const applications = await sql`
      SELECT
        a.id, a.listing_id, a.provider_id, a.applicant_owner_user_id, a.answers,
        a.status, a.transferred_pet_id, a.created_at, a.updated_at,
        l.name AS listing_name, l.breed AS listing_breed,
        l.photo_urls AS listing_photo_urls,
        p.name AS provider_name
      FROM adoption_applications a
      LEFT JOIN adoptable_listings l ON l.id = a.listing_id
      LEFT JOIN providers p ON p.id = a.provider_id
      WHERE a.applicant_owner_user_id = ${userId}
      ORDER BY a.created_at DESC, a.id DESC
    `;

    return Response.json({ applications });
  } catch (error) {
    console.error("[GET /api/adoption/applications] Error:", error?.message);
    return Response.json({ error: "Failed to fetch applications" }, { status: 500 });
  }
}

async function POST(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    const body = (await request.json()) ?? {};
    const { listing_id, answers } = body;
    if (!listing_id) {
      return Response.json({ error: "listing_id is required" }, { status: 400 });
    }

    // Resolve the listing — it must be an AVAILABLE listing of a PUBLISHED place (RLS lets an
    // authed owner read exactly those, so a draft/pending/adopted listing reads as NOT FOUND).
    const listingRows = await sql`
      SELECT id, provider_id, status FROM adoptable_listings WHERE id = ${listing_id}
    `;
    if (listingRows.length === 0) {
      return Response.json({ error: "Listing not available" }, { status: 404 });
    }
    const listing = listingRows[0];
    if (listing.status !== "available") {
      return Response.json(
        { error: "This dog is no longer available to adopt" },
        { status: 409 },
      );
    }

    // Insert the application AS the owner (RLS WITH CHECK: applicant_owner_user_id = me). The
    // partial unique index (0038) rejects a duplicate active application → clean 409.
    let created;
    try {
      created = await sql`
        INSERT INTO adoption_applications
          (listing_id, provider_id, applicant_owner_user_id, answers, status)
        VALUES (
          ${listing.id}, ${listing.provider_id}, ${userId},
          ${sql.json(answers ?? {})}, 'submitted'
        )
        RETURNING *
      `;
    } catch (e) {
      if (e?.code === "23505") {
        return Response.json(
          { error: "You already have an application for this dog" },
          { status: 409 },
        );
      }
      throw e;
    }

    return Response.json({ application: created[0] }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/adoption/applications] Error:", error?.message);
    return Response.json({ error: "Failed to submit application" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
const wrappedPOST = withRequestContext(POST);
export { wrappedGET as GET, wrappedPOST as POST };
