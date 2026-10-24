import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { withRequestContext } from "@/app/api/utils/requestContext";
import {
  getViewerDailyStatus,
  applyDailyMomentsLock,
} from "@/app/api/utils/dailyMomentsGate";

// GET /api/discover — real Discover data for the mobile Search & Discover screen
// (ticket 2.25). Replaces mockPopularProfiles + mockPopularPetMoments.
//
//   • profiles — pets ranked by a REAL signal: followers (pet_follows) then paws
//                received (post_paws), newest as the tiebreak. Public profile fields +
//                the stats the card shows. No owner_user_id, no medical data.
//   • moments  — recent real posts, newest first, as small "sneak peek" tiles: the thumbnail
//                (image_url / video_thumbnail_url) + caption + pet. Unlike /api/posts these are NOT
//                redacted for a viewer who hasn't posted today — they come back tagged
//                `locked: true` so the client prompts instead of opening on tap. The playable
//                video_url is never selected; the gated screens behind a tile (pet profile,
//                posts/history) stay server-enforced by utils/dailyMomentsGate.js.
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

    // PERF (perf audit 5.2): the three reads are independent, so they are queued together and awaited
    // TOGETHER below (pipelined on the request transaction: one round trip instead of three). Response
    // shape and ordering are unchanged.
    //
    // Popular profiles — ranked by followers, then paws received, then recency.
    const profilesQuery = sql`
      SELECT
        p.id,
        p.name,
        p.handle,
        p.avatar_url,
        p.species,
        p.breed,
        NULLIF(BTRIM(ow.full_name), '') AS owner_name,
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
      -- Exclude demo/seed content (0111) so App-Review seed pets never rank in real Discover.
      WHERE ow.is_demo IS NOT TRUE
      ORDER BY followers DESC, paws DESC, p.created_at DESC, p.id DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    // Popular pet moments — recent posts with their pet + engagement context.
    const momentsQuery = sql`
      SELECT
        p.id,
        p.pet_id,
        p.user_id,
        p.image_url,
        p.video_thumbnail_url,
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
      -- Exclude demo/seed moments (0111) so seed posts never surface in real Discover.
      WHERE p.user_id NOT IN (SELECT id FROM user_profiles WHERE is_demo)
      ORDER BY p.created_at DESC, p.id DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    // Daily-post lock state (utils/dailyMomentsGate.js): Discover is a sneak-peek surface, so
    // other owners' tiles are tagged `locked: true` until the viewer has posted today but NOT
    // redacted (`redact: false`). The viewer's own moments, and everything once they have
    // posted, carry no flag.
    const statusQuery = getViewerDailyStatus(session.user.id);

    const [profiles, moments, status] = await Promise.all([
      profilesQuery,
      momentsQuery,
      statusQuery,
    ]);
    return Response.json({
      profiles,
      moments: applyDailyMomentsLock(moments, status, { redact: false }),
    });
  } catch (error) {
    console.error("[GET /api/discover] Error:", error.message);
    return Response.json({ error: "Failed to load discover" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
