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
export async function getViewerDailyStatus(authUserId, { targetOwnerId, targetPetId } = {}) {
  // ONE statement (perf audit 5.2): the profile lookup and the "posted today" check used to be two
  // sequential cross-region round trips, the second depending on the first. The owner-local day is computed
  // once, in a LATERAL, and shared by `local_today` and the EXISTS, so both always agree.
  //
  // HOUSEHOLD (family-sharing PR3): a person who shares a dog is not a stranger to it. `pet_ids` = the pets the viewer OWNS plus
  // the pets they hold an ACTIVE, UNEXPIRED grant on (family or caregiver). "Posted today" is true when there is a daily moment
  // today on any of those pets (whoever posted it — it is "our dog's" moment) or one the viewer authored. For a viewer with no
  // grants this is exactly the old rule (any daily update today on a pet they own). Built from the indexed pet_caregivers lookup
  // — never by calling app_user_has_pet_access() per pets row.
  const rows = await sql`
    SELECT
      up.id,
      d.local_today,
      h.pet_ids,
      EXISTS (
        SELECT 1
        FROM posts p
        WHERE p.is_daily_update = true
          AND p.post_date = d.local_today
          AND (p.user_id = up.id OR p.pet_id = ANY (h.pet_ids))
      ) AS posted_today
    FROM user_profiles up
    CROSS JOIN LATERAL (
      SELECT (now() AT TIME ZONE COALESCE(up.timezone, 'America/Buenos_Aires'))::date AS local_today
    ) d
    CROSS JOIN LATERAL (
      SELECT COALESCE(array_agg(x.pet_id), '{}'::int[]) AS pet_ids
      FROM (
        SELECT id AS pet_id FROM pets WHERE owner_user_id = up.id
        UNION
        SELECT pet_id FROM pet_caregivers
        WHERE grantee_user_id = up.id
          AND status = 'active'
          AND (expires_at IS NULL OR expires_at > now())
      ) x
    ) h
    WHERE up.auth_user_id = ${authUserId}
    LIMIT 1
  `;
  if (rows.length === 0) return null;

  const userId = rows[0].id;
  const householdPetIds = Array.isArray(rows[0].pet_ids) ? rows[0].pet_ids : [];
  // Owner-local today (AUDIT_2026-09 A-10) — must agree with the Care Ring and POST /api/posts.
  const todayDate = ownerTodayFrom(rows[0]);

  // The viewer's own pets AND a dog they are an active family/caregiver on are never gated (their own household's dog).
  const isMine = targetOwnerId != null && String(targetOwnerId) === String(userId);
  const isHouseholdPet = targetPetId != null && householdPetIds.some((id) => String(id) === String(targetPetId));
  if (isMine || isHouseholdPet) {
    return { userId, todayDate, isOwner: true, hasPostedToday: null, householdPetIds };
  }

  // Any daily update today across the viewer's household dogs (owned or shared with them), or authored by them.
  return { userId, todayDate, isOwner: false, hasPostedToday: rows[0].posted_today === true, householdPetIds };
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
    // Moments of a dog the viewer owns or is an active family/caregiver on are their household's own — never locked.
    if (status?.householdPetIds?.some((id) => String(id) === String(post.pet_id))) return post;
    const locked = { ...post, locked: true };
    if (!redact) return locked;
    for (const field of LOCKED_POST_FIELDS) {
      if (field in locked) locked[field] = null;
    }
    return locked;
  });
}
