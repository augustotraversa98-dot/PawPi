// Who may delete or edit a moment? The server's rule is "the AUTHOR": DELETE and PATCH /api/posts/[id] match on the
// post's user_id (and RLS posts_author_all does the same). So a member of a shared dog may remove their OWN moment,
// and nobody is offered a button the server would refuse.

/**
 * DELETE is wider than edit since migration 0145: the dog's owner may also remove any daily moment of that dog.
 *
 * @param {object|null} post
 * @param {{ myProfileId?: number|string|null, ownsPet?: boolean }} ctx
 * @returns {boolean}
 */
export function canDeleteMoment(post, ctx = {}) {
  if (canManageMoment(post, ctx)) return true;
  return !!ctx.ownsPet && post?.is_daily_update === true && post.item_type !== "provider_post";
}

/**
 * May the viewer EDIT it? The author only.
 *
 * @param {object|null} post a feed / profile post (`user_id` = author profile id, when the payload carries it)
 * @param {{ myProfileId?: number|string|null, ownsPet?: boolean }} ctx
 * @returns {boolean}
 */
export function canManageMoment(post, { myProfileId, ownsPet = false } = {}) {
  if (!post || post.item_type === "provider_post") return false;
  if (post.user_id != null && myProfileId != null) {
    return String(post.user_id) === String(myProfileId);
  }
  // Author or own id not known (yet): only what was offered before, i.e. posts of the viewer's own dogs.
  return !!ownsPet;
}
