import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// /api/adoption/favorites — the OWNER's favorited (saved) adoptable dogs. Phase 2 ticket 2.12.
//
// GET    — the owner's favorites (with the dog + place), owner-private (RLS 0038).
// POST   — favorite a listing. Body: { listing_id }. Idempotent: a duplicate (unique on
//          owner+listing) returns the existing favorite, not an error.
// DELETE — unfavorite. Body: { listing_id }. Owner-scoped (RLS owner_all).
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

    const favorites = await sql`
      SELECT
        f.id, f.owner_user_id, f.listing_id, f.created_at,
        l.name AS listing_name, l.breed AS listing_breed,
        l.photo_urls AS listing_photo_urls, l.status AS listing_status,
        l.provider_id, p.name AS provider_name
      FROM adoption_favorites f
      LEFT JOIN adoptable_listings l ON l.id = f.listing_id
      LEFT JOIN providers p ON p.id = l.provider_id
      WHERE f.owner_user_id = ${userId}
      ORDER BY f.created_at DESC, f.id DESC
    `;

    return Response.json({ favorites });
  } catch (error) {
    console.error("[GET /api/adoption/favorites] Error:", error?.message);
    return Response.json({ error: "Failed to fetch favorites" }, { status: 500 });
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
    const { listing_id } = body;
    if (!listing_id) {
      return Response.json({ error: "listing_id is required" }, { status: 400 });
    }

    // Idempotent favorite: ON CONFLICT DO NOTHING on the (owner, listing) unique, then read
    // back so a repeat tap returns the existing row (no error).
    await sql`
      INSERT INTO adoption_favorites (owner_user_id, listing_id)
      VALUES (${userId}, ${listing_id})
      ON CONFLICT (owner_user_id, listing_id) DO NOTHING
    `;
    const rows = await sql`
      SELECT id, owner_user_id, listing_id, created_at
      FROM adoption_favorites
      WHERE owner_user_id = ${userId} AND listing_id = ${listing_id}
    `;

    return Response.json({ favorite: rows[0] ?? null }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/adoption/favorites] Error:", error?.message);
    return Response.json({ error: "Failed to favorite" }, { status: 500 });
  }
}

async function DELETE(request) {
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
    const { listing_id } = body;
    if (!listing_id) {
      return Response.json({ error: "listing_id is required" }, { status: 400 });
    }

    await sql`
      DELETE FROM adoption_favorites
      WHERE owner_user_id = ${userId} AND listing_id = ${listing_id}
    `;

    return Response.json({ ok: true });
  } catch (error) {
    console.error("[DELETE /api/adoption/favorites] Error:", error?.message);
    return Response.json({ error: "Failed to unfavorite" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
const wrappedPOST = withRequestContext(POST);
const wrappedDELETE = withRequestContext(DELETE);
export { wrappedGET as GET, wrappedPOST as POST, wrappedDELETE as DELETE };
