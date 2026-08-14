// FF3 — collapse a pet's same-day daily moments into ONE "day card" item for the main feed.
//
// The multi-caregiver DayCard component + GET /api/pets/[id]/day-card already exist (E13 PR2), but the
// main feed rendered each daily moment as its own PostCard. This PURE helper groups the feed's
// daily-moment pet posts by (pet_id, owner-day) into a single `{ kind: "daycard" }` item whose
// `dayCard` payload matches the endpoint's contract, so the existing DayCard component renders it
// unchanged — WITHOUT an extra per-group network call (the feed already carries every field).
//
// Rules:
//   - Only PET posts (no `kind`, not a provider_post) with `is_daily_update === true` are grouped.
//   - Everything else — regular pet posts, suggestion cards, business posts — passes through UNCHANGED,
//     in order (no regression to non-moment feed behaviour).
//   - The feed arrives newest-first (created_at DESC), so a group's card lands at the position of its
//     NEWEST moment → a fresh contribution naturally BUMPS the card toward the top.
//   - A single-author day yields a one-slide card (clean single card); multiple caregivers → per-author
//     slides + an author count.
//   - Slides are ordered chronologically (created_at ASC), matching the endpoint.

function isMomentPost(p) {
  return (
    p &&
    !p.kind &&
    p.item_type !== "provider_post" &&
    p.is_daily_update === true &&
    p.pet_id != null &&
    !!p.post_date
  );
}

function slideFrom(post) {
  return {
    post_id: post.id,
    image_url: post.image_url ?? null,
    caption: post.caption ?? null,
    created_at: post.created_at ?? null,
    media_type: post.media_type ?? "image",
    video_url: post.video_url ?? null,
    video_thumbnail_url: post.video_thumbnail_url ?? null,
    author: {
      id: post.user_id ?? null,
      username: post.username ?? null,
      avatar_url: post.user_avatar ?? null,
    },
    // The original feed post, so a tap can open the real post detail (paws/barks/comments).
    _post: post,
  };
}

export function groupFeedDayCards(posts) {
  const list = Array.isArray(posts) ? posts : [];
  const out = [];
  const indexByKey = new Map(); // "petId|day" -> index of the daycard item in `out`

  for (const post of list) {
    if (!isMomentPost(post)) {
      out.push(post);
      continue;
    }

    const day = String(post.post_date).slice(0, 10);
    const key = `${post.pet_id}|${day}`;

    if (indexByKey.has(key)) {
      const card = out[indexByKey.get(key)].dayCard;
      card.slides.push(slideFrom(post));
      card.paw_count += Number(post.paw_count) || 0;
      card.bark_count += Number(post.bark_count) || 0;
      continue;
    }

    const item = {
      kind: "daycard",
      id: `daycard-${post.pet_id}-${day}`,
      pet_id: post.pet_id,
      // Carry the newest member's feed_group so the "Suggested for you" divider still lands correctly.
      feed_group: post.feed_group,
      day,
      dayCard: {
        pet: { name: post.pet_name ?? null, avatar_url: post.pet_avatar ?? null },
        slides: [slideFrom(post)],
        paw_count: Number(post.paw_count) || 0,
        bark_count: Number(post.bark_count) || 0,
      },
    };
    indexByKey.set(key, out.length);
    out.push(item);
  }

  // Finalize each card: chronological slides, distinct-author count, latest contribution timestamp.
  for (const item of out) {
    if (item.kind !== "daycard") continue;
    const card = item.dayCard;
    card.slides.sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")));
    card.author_count = new Set(card.slides.map((s) => s.author?.id)).size;
    card.latest_contribution_at = card.slides.length
      ? card.slides[card.slides.length - 1].created_at
      : null;
  }

  return out;
}
