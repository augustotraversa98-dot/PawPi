import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { withRequestContext } from "@/app/api/utils/requestContext";

// GET /api/discover — real Discover data for the mobile Search & Discover screen
// (ticket 2.25). Replaces mockPopularProfiles + mockPopularPetMoments.
//
//   • profiles — pets ranked by a REAL signal: followers (pet_follows) then paws
//                received (post_paws), newest as the tiebreak. Public profile fields +
//                the stats the card shows. No owner_user_id, no medical data.
//   • moments  — recent real posts (the same shape /api/posts surfaces), newest first.
//
// Empty when there's nothing — no fabricated counts, no mock fallback. Session required.
// Pagination via ?limit/&offset (applies to both lists' caps).
const DEFAULT_LIMIT = 12;

async function GET(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") || String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT, 1),
      50,
    );
    const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10) || 0, 0);

    // Popular profiles — ranked by followers, then paws received, then recency.
    const profiles = await sql`
      SELECT
        p.id,
        p.name,
        p.handle,
        p.avatar_url,
        p.species,
        p.breed,
        ow.username AS owner_name,
        (SELECT COUNT(*)::int FROM pet_follows f WHERE f.followed_pet_id = p.id) AS followers,
        (SELECT COUNT(*)::int FROM post_paws pp
           JOIN posts po ON po.id = pp.post_id
          WHERE po.pet_id = p.id) AS paws,
        (SELECT COUNT(*)::int FROM post_barks pb
           JOIN posts po ON po.id = pb.post_id
          WHERE po.pet_id = p.id) AS barks,
        (SELECT COUNT(*)::int FROM posts po WHERE po.pet_id = p.id) AS daily_posts
      FROM pets p
      LEFT JOIN user_profiles ow ON ow.id = p.owner_user_id
      ORDER BY followers DESC, paws DESC, p.created_at DESC, p.id DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    // Popular pet moments — recent posts with their pet + engagement context.
    const moments = await sql`
      SELECT
        p.id,
        p.pet_id,
        p.image_url,
        p.caption,
        p.created_at,
        pet.name AS pet_name,
        pet.handle AS pet_handle,
        pet.avatar_url AS pet_avatar,
        COALESCE(paw.count, 0)::int AS paw_count,
        COALESCE(bark.count, 0)::int AS bark_count
      FROM posts p
      JOIN pets pet ON pet.id = p.pet_id
      LEFT JOIN (
        SELECT post_id, COUNT(*) AS count FROM post_paws GROUP BY post_id
      ) paw ON paw.post_id = p.id
      LEFT JOIN (
        SELECT post_id, COUNT(*) AS count FROM post_barks GROUP BY post_id
      ) bark ON bark.post_id = p.id
      ORDER BY p.created_at DESC, p.id DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    return Response.json({ profiles, moments });
  } catch (error) {
    console.error("[GET /api/discover] Error:", error.message);
    return Response.json({ error: "Failed to load discover" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
