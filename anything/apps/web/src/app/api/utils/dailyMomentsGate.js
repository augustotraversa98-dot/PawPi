import sql from "@/app/api/utils/sql";
import { ownerTodayFrom } from "@/app/api/utils/ownerLocalDay";

// The daily-post unlock ("BeReal" mechanic), server side. A viewer must post their own
// daily moment to see other pets' moments. This is the ONE place that decides whether the
// viewer has posted today, shared by:
//   - GET /api/posts/owner-posted-today   (the Feed's lock — the client reads it)
//   - GET /api/pets/[id]/profile          (hides the Daily moments grid)
//   - GET /api/posts/history              (a pet's daily-post history)
//   - GET /api/posts                      (the feed — other owners' media is redacted)
// so the lock the Feed shows and the data the API withholds can never disagree.
//
// Identity: the caller passes the AUTH user id (session.user.id). It is mapped to
// user_profiles.id here, and the check is owner-scoped on pets.owner_user_id = user_profiles.id
// (any of the viewer's pets counts) — never on the auth id.
//
// Returns null when the viewer has no user_profiles row yet (they cannot have posted).
// Otherwise { userId, todayDate, isOwner, hasPostedToday }:
//   - isOwner is true when `targetOwnerId` is the viewer's own user_profiles.id (own pets are
//     never gated); the posted-today query is skipped then and hasPostedToday is null.
export async function getViewerDailyStatus(authUserId, { targetOwnerId } = {}) {
  const profileRows = await sql`
    SELECT id, (now() AT TIME ZONE COALESCE(timezone, 'America/Buenos_Aires'))::date AS local_today
    FROM user_profiles
    WHERE auth_user_id = ${authUserId}
    LIMIT 1
  `;
  if (profileRows.length === 0) return null;

  const userId = profileRows[0].id;
  // Owner-local today (AUDIT_2026-09 A-10) — must agree with the Care Ring and POST /api/posts.
  const todayDate = ownerTodayFrom(profileRows[0]);

  if (targetOwnerId != null && String(targetOwnerId) === String(userId)) {
    return { userId, todayDate, isOwner: true, hasPostedToday: null };
  }

  // Any daily update today across ALL pets owned by this viewer.
  const rows = await sql`
    SELECT 1
    FROM posts p
    INNER JOIN pets pet ON p.pet_id = pet.id
    WHERE pet.owner_user_id = ${userId}
      AND p.is_daily_update = true
      AND p.post_date = ${todayDate}
    LIMIT 1
  `;

  return { userId, todayDate, isOwner: false, hasPostedToday: rows.length > 0 };
}

// Fields that expose another owner's moment: the photo, the video + its poster frame, and the
// caption (the locked card shows a placeholder bar instead of the caption anyway).
const LOCKED_POST_FIELDS = ["image_url", "video_url", "video_thumbnail_url", "caption"];

// Feed lock, server side. While the viewer has not posted today, every OTHER owner's pet post
// is returned WITHOUT its media/caption and tagged `locked: true`, so the client renders its
// existing blurred card with nothing to read off the wire. The viewer's own posts (matched on
// posts.user_id = user_profiles.id) are never redacted, and once the viewer has posted today
// the posts are returned untouched. `status` is getViewerDailyStatus() — null (anonymous, or no
// profile yet) means "has not posted", so everything of anyone else's is redacted. Business
// (provider_post) items are public marketing content and are left as they are.
//
// `{ redact: false }` is the tag-only mode for a surface that deliberately previews other owners'
// media (GET /api/discover's "sneak peek" tiles): the same posts are tagged `locked: true` but no
// field is withheld, so the client knows whether a tap should open or prompt. A caller using it
// must SELECT only what its tile needs — never video_url or anything beyond the thumbnail.
export function applyDailyMomentsLock(posts, status, { redact = true } = {}) {
  if (status?.hasPostedToday) return posts;
  return posts.map((post) => {
    if (post.item_type === "provider_post") return post;
    if (status && String(post.user_id) === String(status.userId)) return post;
    const locked = { ...post, locked: true };
    if (!redact) return locked;
    for (const field of LOCKED_POST_FIELDS) {
      if (field in locked) locked[field] = null;
    }
    return locked;
  });
}
